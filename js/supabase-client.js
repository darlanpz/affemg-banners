/* supabase-client.js — camada de dados (auth + banners salvos).
 *
 * Exposto como window.AffemgBackend. Fica desativado (isEnabled()=false) se
 * js/supabase-config.js não estiver preenchido — o site funciona sem login.
 *
 * Regras de permissão são garantidas no servidor (RLS do Supabase). A UI usa
 * canDelete() só para mostrar/ocultar o botão. Ver SUPABASE-SETUP.md.
 */
(function (global) {
  'use strict';

  var CFG = global.AFFEMG_SUPABASE || {};
  var BUCKET = 'banners';

  var client = null;
  var currentUser = null;
  var currentIsAdmin = false;
  var authListeners = [];

  function isEnabled() {
    return !!(CFG.url && CFG.anonKey && global.supabase && global.supabase.createClient);
  }

  function getClient() {
    if (!client) client = global.supabase.createClient(CFG.url, CFG.anonKey);
    return client;
  }

  function notify() { authListeners.forEach(function (cb) { try { cb(currentUser, currentIsAdmin); } catch (e) {} }); }

  function loadIsAdmin() {
    if (!currentUser) { currentIsAdmin = false; return Promise.resolve(false); }
    return getClient().from('profiles').select('is_admin').eq('id', currentUser.id).maybeSingle()
      .then(function (res) {
        currentIsAdmin = !!(res.data && res.data.is_admin) ||
          (CFG.adminEmail && currentUser.email === CFG.adminEmail);
        return currentIsAdmin;
      })
      .catch(function () {
        currentIsAdmin = !!(CFG.adminEmail && currentUser.email === CFG.adminEmail);
        return currentIsAdmin;
      });
  }

  function init() {
    if (!isEnabled()) return Promise.resolve(null);
    var c = getClient();
    // getSession() lê da sessão local (sem chamada de rede quando deslogado).
    return c.auth.getSession().then(function (res) {
      currentUser = (res.data && res.data.session && res.data.session.user) || null;
      c.auth.onAuthStateChange(function (_evt, session) {
        currentUser = (session && session.user) || null;
        loadIsAdmin().then(notify);
      });
      return loadIsAdmin().then(function () { notify(); return currentUser; });
    });
  }

  function onAuth(cb) { authListeners.push(cb); return function () { authListeners = authListeners.filter(function (f) { return f !== cb; }); }; }
  function getUser() { return currentUser; }
  function isAdmin() { return currentIsAdmin; }

  function signIn(email, password) {
    return getClient().auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) throw new Error(traduzErro(res.error.message));
        currentUser = res.data.user;
        return loadIsAdmin().then(function () { notify(); return currentUser; });
      });
  }

  function signOut() {
    return getClient().auth.signOut().then(function () {
      currentUser = null; currentIsAdmin = false; notify();
    });
  }

  // ---------- Banners ----------
  function listBanners() {
    return getClient().from('banners').select('*').order('created_at', { ascending: false })
      .then(function (res) { if (res.error) throw new Error(res.error.message); return res.data || []; });
  }

  function publicUrl(path) {
    return getClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function saveBanner(p) {
    if (!currentUser) return Promise.reject(new Error('Faça login para salvar.'));
    var uid = currentUser.id;
    var path = uid + '/' + (global.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.round(Math.random() * 1e9)) + '.webp';
    var c = getClient();
    return c.storage.from(BUCKET).upload(path, p.blob, { contentType: 'image/webp', upsert: false })
      .then(function (up) {
        if (up.error) throw new Error('Upload: ' + up.error.message);
        return c.from('banners').insert({
          titulo: p.titulo, grupo: p.grupo || 'Geral', storage_path: path, owner_email: currentUser.email,
        }).select().single();
      })
      .then(function (ins) {
        if (ins.error) {
          // rollback do arquivo se o insert falhar
          c.storage.from(BUCKET).remove([path]);
          throw new Error(ins.error.message);
        }
        return ins.data;
      });
  }

  function canDelete(banner) {
    if (!currentUser) return false;
    return banner.owner === currentUser.id || currentIsAdmin;
  }

  function deleteBanner(banner) {
    var c = getClient();
    return c.from('banners').delete().eq('id', banner.id).select()
      .then(function (res) {
        if (res.error) throw new Error(res.error.message);
        if (!res.data || !res.data.length) throw new Error('Sem permissão para remover este banner.');
        return c.storage.from(BUCKET).remove([banner.storage_path]);
      })
      .then(function () { return true; });
  }

  function traduzErro(msg) {
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.';
    return msg;
  }

  global.AffemgBackend = {
    isEnabled: isEnabled, init: init, onAuth: onAuth, getUser: getUser, isAdmin: isAdmin,
    signIn: signIn, signOut: signOut,
    listBanners: listBanners, saveBanner: saveBanner, deleteBanner: deleteBanner,
    canDelete: canDelete, publicUrl: publicUrl,
  };
})(typeof window !== 'undefined' ? window : this);
