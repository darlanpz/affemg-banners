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

  // Lido AGORA, na carga do script: o supabase-js consome e limpa o hash da URL
  // assim que o cliente é criado, então depois já não dá para saber se a pessoa
  // chegou por um convite ou por um link de recuperação de senha.
  var TIPO_LINK = (String(location.hash || '').match(/[#&]type=([a-z_]+)/i) || [])[1] || '';
  var BUCKET = 'banners';

  var client = null;
  var currentUser = null;
  var currentIsAdmin = false;
  var currentIsMaster = false;
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
    if (!currentUser) { currentIsAdmin = false; currentIsMaster = false; return Promise.resolve(false); }
    var ehMasterPeloEmail = !!(CFG.adminEmail && currentUser.email === CFG.adminEmail);
    return getClient().from('profiles').select('is_admin, is_master').eq('id', currentUser.id).maybeSingle()
      .then(function (res) {
        currentIsMaster = !!(res.data && res.data.is_master) || ehMasterPeloEmail;
        currentIsAdmin = !!(res.data && res.data.is_admin) || currentIsMaster;
        return currentIsAdmin;
      })
      .catch(function () {
        currentIsMaster = ehMasterPeloEmail;
        currentIsAdmin = ehMasterPeloEmail;
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
  function isMaster() { return currentIsMaster; }

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
      currentUser = null; currentIsAdmin = false; currentIsMaster = false; notify();
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

  // Baixa os bytes (usado para montar o .zip sem depender de CORS de img).
  function downloadBlob(path) {
    return getClient().storage.from(BUCKET).download(path).then(function (res) {
      if (res.error) throw new Error(res.error.message);
      return res.data; // Blob
    });
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
          titulo: p.titulo, grupo: p.grupo || 'Geral', storage_path: path,
          owner_email: currentUser.email, recomendado: !!p.recomendado && currentIsAdmin,
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

  // ---------- Usuários (área do admin) ----------
  // A listagem lê profiles direto: quem filtra é a RLS, então o admin master
  // some da resposta para os demais. Criar e remover exigem service_role e por
  // isso passam pela Edge Function "admin-users".
  function callFn(nome, payload) {
    return getClient().functions.invoke(nome, { body: payload }).then(function (res) {
      // Erros HTTP vêm em res.error com o corpo dentro de context.
      if (res.error) {
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(
            function (b) { throw new Error(traduzErro((b && b.error) || res.error.message)); },
            function () { throw new Error(traduzErro(res.error.message)); }
          );
        }
        throw new Error(traduzErro(res.error.message));
      }
      if (res.data && res.data.error) throw new Error(traduzErro(res.data.error));
      return res.data;
    });
  }

  function listUsers() {
    return getClient().from('profiles')
      .select('id, email, nome, is_admin, is_master, created_at')
      .order('nome', { ascending: true })
      .then(function (res) {
        if (res.error) throw new Error(res.error.message);
        return res.data || [];
      });
  }

  function createUser(p) {
    return callFn('admin-users', {
      acao: 'create', nome: p.nome, email: p.email, senha: p.senha,
    });
  }

  // senha vazia = mantém a atual
  function updateUser(p) {
    return callFn('admin-users', {
      acao: 'update', id: p.id, nome: p.nome, email: p.email, senha: p.senha || '',
    });
  }

  function deleteUser(id) {
    return callFn('admin-users', { acao: 'delete', id: id });
  }

  // Regra pura (sem estado global) de quem gerencia quem, para poder ser testada:
  //   eu    = { id, isAdmin, isMaster }
  //   alvo  = linha de profiles
  // Admin comum mexe só em quem não é admin; o master mexe em todos; ninguém
  // mexe em si mesmo por aqui. A regra real, que vale, está na Edge Function.
  function podeGerenciar(eu, alvo) {
    if (!eu || !eu.isAdmin || !alvo) return false;
    if (alvo.id === eu.id) return false;
    if (alvo.is_admin || alvo.is_master) return !!eu.isMaster;
    return true;
  }

  // Só para a UI decidir se mostra os botões.
  function canManageUser(profile) {
    if (!currentUser) return false;
    return podeGerenciar(
      { id: currentUser.id, isAdmin: currentIsAdmin, isMaster: currentIsMaster },
      profile
    );
  }

  // ---------- Solicitações de acesso ----------
  // Quem não tem conta se apresenta por aqui. A tabela aceita insert de
  // visitante (é o único jeito), mas só admin consegue ler e decidir.
  function captchaSiteKey() { return CFG.turnstileSiteKey || ''; }

  function solicitarAcesso(p) {
    var nome = String(p.nome || '').trim();
    var email = String(p.email || '').trim().toLowerCase();
    if (nome.length < 2) return Promise.reject(new Error('Informe seu nome completo.'));
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
      return Promise.reject(new Error('Informe um e-mail válido.'));
    }

    // Com captcha configurado, o pedido passa pela Edge Function, que valida o
    // token e insere com service_role. Assim o token não tem como ser burlado
    // no cliente. Sem captcha, insere direto (a RLS permite).
    if (captchaSiteKey()) {
      if (!p.captchaToken) {
        return Promise.reject(new Error('Confirme que você não é um robô.'));
      }
      return callFn('admin-users', {
        acao: 'solicitar', nome: nome, email: email, captchaToken: p.captchaToken,
      }).then(function () { return true; });
    }

    return getClient().from('solicitacoes_acesso')
      .insert({ nome: nome, email: email, status: 'pendente' })
      .then(function (res) {
        if (res.error) {
          // Índice único de pendentes: já existe pedido em aberto.
          if (/duplicate|unique/i.test(res.error.message)) {
            throw new Error('Já existe um pedido em análise para este e-mail.');
          }
          throw new Error(traduzErro(res.error.message));
        }
        return true;
      });
  }

  function listSolicitacoes() {
    return getClient().from('solicitacoes_acesso')
      .select('id, nome, email, status, created_at')
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) throw new Error(res.error.message);
        return res.data || [];
      });
  }

  function aprovarSolicitacao(id) {
    return callFn('admin-users', { acao: 'aprovar', id: id, redirectTo: urlDeRetorno() });
  }
  function recusarSolicitacao(id) {
    return callFn('admin-users', { acao: 'recusar', id: id });
  }
  function concluirSolicitacao(id) {
    return callFn('admin-users', { acao: 'concluir', id: id });
  }

  // ---------- Senha ----------
  // Para onde o link do e-mail traz a pessoa de volta. Precisa estar na lista
  // de Redirect URLs do Supabase. Ver SUPABASE-SETUP.md.
  function urlDeRetorno() {
    return location.origin + location.pathname;
  }

  // Dispara o e-mail com o link de definir senha. Serve tanto para o
  // "esqueci minha senha" quanto para o admin pedir a troca de outra pessoa.
  function enviarLinkDeSenha(email) {
    return getClient().auth.resetPasswordForEmail(String(email || '').trim().toLowerCase(), {
      redirectTo: urlDeRetorno(),
    }).then(function (res) {
      if (res.error) throw new Error(traduzErro(res.error.message));
      return true;
    });
  }

  function definirSenha(nova) {
    if (String(nova || '').length < 6) {
      return Promise.reject(new Error('A senha precisa ter pelo menos 6 caracteres.'));
    }
    return getClient().auth.updateUser({ password: nova }).then(function (res) {
      if (res.error) throw new Error(traduzErro(res.error.message));
      return true;
    });
  }

  // O link do e-mail (convite ou recuperação) volta com o tipo no hash. Isso é
  // lido na carga do script, antes do supabase-js consumir e limpar o hash.
  function tipoDoLink() { return TIPO_LINK; }

  function traduzErro(msg) {
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/for security purposes|rate limit|too many/i.test(msg)) {
      return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    }
    if (/new password should be different/i.test(msg)) {
      return 'A nova senha precisa ser diferente da anterior.';
    }
    if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.';
    if (/failed to (send a )?request|fetch|networkerror/i.test(msg)) {
      return 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.';
    }
    if (/function not found|404/i.test(msg)) {
      return 'A função "admin-users" ainda não foi publicada no Supabase.';
    }
    return msg;
  }

  global.AffemgBackend = {
    isEnabled: isEnabled, init: init, onAuth: onAuth, getUser: getUser, isAdmin: isAdmin,
    isMaster: isMaster,
    signIn: signIn, signOut: signOut,
    listBanners: listBanners, saveBanner: saveBanner, deleteBanner: deleteBanner,
    canDelete: canDelete, publicUrl: publicUrl, downloadBlob: downloadBlob,
    listUsers: listUsers, createUser: createUser, updateUser: updateUser, deleteUser: deleteUser,
    canManageUser: canManageUser, podeGerenciar: podeGerenciar,
    solicitarAcesso: solicitarAcesso, listSolicitacoes: listSolicitacoes,
    captchaSiteKey: captchaSiteKey,
    aprovarSolicitacao: aprovarSolicitacao, recusarSolicitacao: recusarSolicitacao,
    concluirSolicitacao: concluirSolicitacao,
    enviarLinkDeSenha: enviarLinkDeSenha, definirSenha: definirSenha,
    tipoDoLink: tipoDoLink,
  };
})(typeof window !== 'undefined' ? window : this);
