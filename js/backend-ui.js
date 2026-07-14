/* backend-ui.js — UI de login, salvar e aba "Salvos" (usa AffemgBackend).
   Tudo fica oculto se o Supabase não estiver configurado. */
(function () {
  'use strict';

  var BK = window.AffemgBackend;
  var $ = function (s) { return document.querySelector(s); };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // ---------- Modal genérico ----------
  function modal(innerHTML) {
    var overlay = el('div', 'modal');
    overlay.innerHTML = '<div class="modal__box" role="dialog" aria-modal="true">' + innerHTML + '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('has-modal');
    function close() { overlay.remove(); document.body.classList.remove('has-modal'); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    return { overlay: overlay, box: overlay.querySelector('.modal__box'), close: close };
  }

  // ---------- Login ----------
  function openLogin(onDone) {
    var m = modal(
      '<h3 class="modal__title">Entrar</h3>' +
      '<label class="modal__label">E-mail</label><input type="email" id="mEmail" autocomplete="username">' +
      '<label class="modal__label">Senha</label><input type="password" id="mPass" autocomplete="current-password">' +
      '<div class="modal__msg" id="mMsg"></div>' +
      '<div class="modal__actions"><button class="btn btn--ghost" id="mCancel">Cancelar</button>' +
      '<button class="btn btn--primary" id="mLogin">Entrar</button></div>'
    );
    var email = m.box.querySelector('#mEmail');
    email.focus();
    m.box.querySelector('#mCancel').addEventListener('click', m.close);
    function submit() {
      var msg = m.box.querySelector('#mMsg');
      msg.textContent = 'Entrando…'; msg.className = 'modal__msg';
      var btn = m.box.querySelector('#mLogin'); btn.disabled = true;
      BK.signIn(email.value.trim(), m.box.querySelector('#mPass').value)
        .then(function () { m.close(); if (onDone) onDone(); })
        .catch(function (err) { msg.textContent = err.message; msg.className = 'modal__msg is-err'; btn.disabled = false; });
    }
    m.box.querySelector('#mLogin').addEventListener('click', submit);
    m.box.querySelector('#mPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  // ---------- Widget de auth (cabeçalho) ----------
  function renderAuth(user) {
    var w = $('#authWidget');
    w.hidden = false;
    if (user) {
      w.innerHTML = '<span class="auth__user" title="' + esc(user.email) + '">' + esc(user.email) +
        (BK.isAdmin() ? ' · admin' : '') + '</span><button class="btn btn--ghost btn--sm" id="btnLogout">Sair</button>';
      w.querySelector('#btnLogout').addEventListener('click', function () { BK.signOut(); });
    } else {
      w.innerHTML = '<button class="btn btn--primary btn--sm" id="btnLogin">Entrar</button>';
      w.querySelector('#btnLogin').addEventListener('click', function () { openLogin(); });
    }
  }

  // ---------- Salvar ----------
  function grupoOptions() {
    // sugere grupos já usados
    return BK.listBanners().then(function (bs) {
      var set = {}; bs.forEach(function (b) { if (b.grupo) set[b.grupo] = 1; });
      return Object.keys(set).sort();
    }).catch(function () { return []; });
  }

  function openSave() {
    if (!window.AffemgCreator || !AffemgCreator.hasImage()) { alert('Envie uma imagem e monte o banner antes de salvar.'); return; }
    if (!BK.getUser()) { openLogin(function () { openSave(); }); return; }

    var m = modal(
      '<h3 class="modal__title">Salvar banner</h3>' +
      '<label class="modal__label">Nome</label><input type="text" id="sNome">' +
      '<label class="modal__label">Grupo</label><input type="text" id="sGrupo" list="sGrupos" placeholder="Ex.: Convênios"><datalist id="sGrupos"></datalist>' +
      '<div class="modal__msg" id="sMsg"></div>' +
      '<div class="modal__actions"><button class="btn btn--ghost" id="sCancel">Cancelar</button>' +
      '<button class="btn btn--primary" id="sSave">Salvar</button></div>'
    );
    m.box.querySelector('#sNome').value = AffemgCreator.suggestName();
    m.box.querySelector('#sCancel').addEventListener('click', m.close);
    grupoOptions().then(function (gs) {
      var dl = m.box.querySelector('#sGrupos');
      gs.forEach(function (g) { var o = document.createElement('option'); o.value = g; dl.appendChild(o); });
    });

    m.box.querySelector('#sSave').addEventListener('click', function () {
      var nome = m.box.querySelector('#sNome').value.trim();
      var grupo = m.box.querySelector('#sGrupo').value.trim() || 'Geral';
      if (!nome) { return; }
      var msg = m.box.querySelector('#sMsg'); msg.textContent = 'Gerando e salvando…'; msg.className = 'modal__msg';
      var btn = m.box.querySelector('#sSave'); btn.disabled = true;
      window.AffemgWebp.render(AffemgCreator.currentSVG(), { quality: 0.92 })
        .then(function (blob) { return BK.saveBanner({ titulo: nome, grupo: grupo, blob: blob }); })
        .then(function () { m.close(); if (window.AffemgSalvos) AffemgSalvos.invalidate(); })
        .catch(function (err) { msg.textContent = 'Falha: ' + err.message; msg.className = 'modal__msg is-err'; btn.disabled = false; });
    });
  }

  // ---------- Aba "Salvos" ----------
  var salvosLoaded = false;

  function salvosCard(b) {
    var card = el('figure', 'gcard');
    var src = BK.publicUrl(b.storage_path);
    var titulo = esc(b.titulo);
    card.innerHTML =
      '<button type="button" class="gcard__imgbtn"><img class="gcard__img" src="' + src + '" alt="' + titulo + '" loading="lazy"><span class="gcard__zoom">⛶ Ampliar</span></button>' +
      '<figcaption class="gcard__body">' +
        '<span class="gcard__name">' + titulo + '<br><small class="gcard__by">' + esc(b.owner_email || '') + '</small></span>' +
        '<span class="gcard__acts">' +
          '<a class="btn btn--ghost btn--sm" href="' + src + '" download="' + titulo + '.webp">Baixar</a>' +
          (BK.canDelete(b) ? '<button class="btn btn--sm btn--danger" data-del="1">Remover</button>' : '') +
        '</span>' +
      '</figcaption>';
    var img = card.querySelector('.gcard__img');
    card.querySelector('.gcard__imgbtn').addEventListener('click', function () {
      if (window.AffemgLightbox) window.AffemgLightbox.open(src, b.titulo, titulo + '.webp');
      else window.open(src, '_blank');
    });
    var del = card.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (!confirm('Remover "' + b.titulo + '"? Isso apaga para todos.')) return;
      del.disabled = true; del.textContent = 'Removendo…';
      BK.deleteBanner(b).then(function () { AffemgSalvos.invalidate(); AffemgSalvos.refresh(); })
        .catch(function (err) { alert('Falha ao remover: ' + err.message); del.disabled = false; del.textContent = 'Remover'; });
    });
    return card;
  }

  function renderSalvos(banners) {
    var root = $('#salvos'); var msg = $('#salvosMsg');
    root.innerHTML = '';
    if (!BK.getUser()) {
      msg.hidden = false; msg.innerHTML = 'Faça login para ver os banners salvos. <button class="btn btn--primary btn--sm" id="salvosLogin">Entrar</button>';
      msg.querySelector('#salvosLogin').addEventListener('click', function () { openLogin(function () { AffemgSalvos.invalidate(); AffemgSalvos.refresh(); }); });
      return;
    }
    if (!banners.length) { msg.hidden = false; msg.textContent = 'Nenhum banner salvo ainda. Crie um e clique em “Salvar no projeto”.'; return; }
    msg.hidden = true;

    var groups = {}; var order = [];
    banners.forEach(function (b) { var g = b.grupo || 'Geral'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(b); });
    order.sort(function (a, b) { return a.localeCompare(b, 'pt'); });
    order.forEach(function (g) {
      var wrap = el('section', 'gsec');
      wrap.appendChild(el('div', 'gsec__head', '<h2 class="gsec__title">' + esc(g) + '</h2>'));
      var grid = el('div', 'gsec__grid');
      groups[g].forEach(function (b) { grid.appendChild(salvosCard(b)); });
      wrap.appendChild(grid);
      root.appendChild(wrap);
    });
  }

  window.AffemgSalvos = {
    invalidate: function () { salvosLoaded = false; },
    refresh: function () {
      if (!BK || !BK.isEnabled()) return;
      if (!BK.getUser()) { renderSalvos([]); return; }
      if (salvosLoaded) return;
      var root = $('#salvos'); root.innerHTML = '<p class="empty">Carregando…</p>'; $('#salvosMsg').hidden = true;
      BK.listBanners().then(function (bs) { salvosLoaded = true; renderSalvos(bs); })
        .catch(function (err) { $('#salvosMsg').hidden = false; $('#salvosMsg').textContent = 'Erro ao carregar: ' + err.message; root.innerHTML = ''; });
    },
  };

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', function () {
    if (!BK || !BK.isEnabled()) return; // recursos de backend ficam ocultos

    $('#tabSalvos').hidden = false;
    var save = $('#btnSave'); save.hidden = false;
    save.addEventListener('click', openSave);

    BK.onAuth(function (user) {
      renderAuth(user);
      salvosLoaded = false;
      // se estiver na aba salvos, re-render
      var panel = $('#panel-salvos');
      if (panel && !panel.hidden) AffemgSalvos.refresh();
    });

    BK.init();
  });
})();
