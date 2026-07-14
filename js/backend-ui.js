/* backend-ui.js — login, salvar e a aba "Banners salvos" (galeria via Supabase).
   Tudo oculto se o Supabase não estiver configurado. Ver acesso exige login. */
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
  function safeFile(s) { return (String(s || 'banner').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'banner') + '.webp'; }

  // ---------- Modal genérico ----------
  function modal(innerHTML) {
    var overlay = el('div', 'modal');
    overlay.innerHTML = '<div class="modal__box" role="dialog" aria-modal="true">' + innerHTML + '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('has-modal');
    function close() { overlay.remove(); document.body.classList.remove('has-modal'); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
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
    var email = m.box.querySelector('#mEmail'); email.focus();
    m.box.querySelector('#mCancel').addEventListener('click', m.close);
    function submit() {
      var msg = m.box.querySelector('#mMsg'); msg.textContent = 'Entrando…'; msg.className = 'modal__msg';
      var btn = m.box.querySelector('#mLogin'); btn.disabled = true;
      BK.signIn(email.value.trim(), m.box.querySelector('#mPass').value)
        .then(function () { m.close(); if (onDone) onDone(); })
        .catch(function (err) { msg.textContent = err.message; msg.className = 'modal__msg is-err'; btn.disabled = false; });
    }
    m.box.querySelector('#mLogin').addEventListener('click', submit);
    m.box.querySelector('#mPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  // ---------- Widget de auth ----------
  function renderAuth(user) {
    var w = $('#authWidget'); w.hidden = false;
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
  var cacheBanners = null; // lista mais recente (para sugerir categorias e evitar recarregar)

  function existingGroups() {
    var src = cacheBanners ? Promise.resolve(cacheBanners) : BK.listBanners().catch(function () { return []; });
    return src.then(function (bs) {
      var set = {}; bs.forEach(function (b) { if (b.grupo) set[b.grupo] = 1; });
      return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'pt'); });
    });
  }

  function openSave() {
    if (!window.AffemgCreator || !AffemgCreator.hasImage()) { alert('Envie uma imagem e monte o banner antes de salvar.'); return; }
    if (!BK.getUser()) { openLogin(function () { openSave(); }); return; }
    var admin = BK.isAdmin();
    var m = modal(
      '<h3 class="modal__title">Salvar banner</h3>' +
      '<label class="modal__label">Nome</label><input type="text" id="sNome">' +
      '<label class="modal__label">Categoria</label>' +
      '<input type="text" id="sGrupo" list="sGrupos" placeholder="Escolha uma existente ou digite uma nova"><datalist id="sGrupos"></datalist>' +
      (admin ? '<label class="modal__check"><input type="checkbox" id="sReco"> Marcar como recomendado da categoria</label>' : '') +
      '<div class="modal__msg" id="sMsg"></div>' +
      '<div class="modal__actions"><button class="btn btn--ghost" id="sCancel">Cancelar</button>' +
      '<button class="btn btn--primary" id="sSave">Salvar</button></div>'
    );
    m.box.querySelector('#sNome').value = AffemgCreator.suggestName();
    m.box.querySelector('#sCancel').addEventListener('click', m.close);
    existingGroups().then(function (gs) {
      var dl = m.box.querySelector('#sGrupos');
      gs.forEach(function (g) { var o = document.createElement('option'); o.value = g; dl.appendChild(o); });
    });
    m.box.querySelector('#sSave').addEventListener('click', function () {
      var nome = m.box.querySelector('#sNome').value.trim();
      var grupo = m.box.querySelector('#sGrupo').value.trim() || 'Geral';
      var reco = admin && m.box.querySelector('#sReco').checked;
      if (!nome) { return; }
      var msg = m.box.querySelector('#sMsg'); msg.textContent = 'Gerando e salvando…'; msg.className = 'modal__msg';
      var btn = m.box.querySelector('#sSave'); btn.disabled = true;
      window.AffemgWebp.render(AffemgCreator.currentSVG(), { quality: 0.92 })
        .then(function (blob) { return BK.saveBanner({ titulo: nome, grupo: grupo, recomendado: reco, blob: blob }); })
        .then(function () { m.close(); AffemgSalvos.invalidate(); if (isSalvosVisible()) AffemgSalvos.refresh(); alert('Banner salvo em “' + grupo + '”.'); })
        .catch(function (err) { msg.textContent = 'Falha: ' + err.message; msg.className = 'modal__msg is-err'; btn.disabled = false; });
    });
  }

  // ---------- Downloads ----------
  function downloadOne(banner) {
    return BK.downloadBlob(banner.storage_path).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = safeFile(banner.titulo);
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }
  function zipEntries(banners) {
    return banners.map(function (b) { return { name: safeFile(b.titulo), getBlob: function () { return BK.downloadBlob(b.storage_path); } }; });
  }
  function zipButton(nome, banners, texto) {
    var btn = el('button', 'btn btn--primary btn--sm', texto);
    btn.type = 'button';
    btn.addEventListener('click', function () {
      var label = btn.textContent; btn.disabled = true; btn.textContent = 'Compactando…';
      AffemgZip.download(nome, zipEntries(banners))
        .catch(function (err) { alert('Falha ao gerar o .zip: ' + err.message); })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
    return btn;
  }

  // ---------- Card ----------
  function bannerCard(b) {
    var card = el('figure', 'gcard' + (b.recomendado ? ' is-reco' : ''));
    var src = BK.publicUrl(b.storage_path);
    var titulo = esc(b.titulo);
    card.innerHTML =
      (b.recomendado ? '<span class="badge-reco">★ Recomendado</span>' : '') +
      '<button type="button" class="gcard__imgbtn" aria-label="Ampliar"><img class="gcard__img" src="' + src + '" alt="' + titulo + '" loading="lazy"><span class="gcard__zoom">⛶ Ampliar</span></button>' +
      '<figcaption class="gcard__body">' +
        '<span class="gcard__name">' + titulo + '<br><small class="gcard__by">' + esc(b.owner_email || '') + '</small></span>' +
        '<span class="gcard__acts">' +
          '<button class="btn btn--ghost btn--sm" data-dl="1">Baixar</button>' +
          (BK.canDelete(b) ? '<button class="btn btn--sm btn--danger" data-del="1">Remover</button>' : '') +
        '</span>' +
      '</figcaption>';
    card.querySelector('.gcard__imgbtn').addEventListener('click', function () { AffemgLightbox.open(src, b.titulo, safeFile(b.titulo)); });
    var dl = card.querySelector('[data-dl]');
    dl.addEventListener('click', function () { dl.disabled = true; downloadOne(b).catch(function (e) { alert('Falha: ' + e.message); }).then(function () { dl.disabled = false; }); });
    var del = card.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (!confirm('Remover "' + b.titulo + '"? Isso apaga para todos.')) return;
      del.disabled = true; del.textContent = 'Removendo…';
      BK.deleteBanner(b).then(function () { AffemgSalvos.invalidate(); AffemgSalvos.refresh(); })
        .catch(function (err) { alert('Falha ao remover: ' + err.message); del.disabled = false; del.textContent = 'Remover'; });
    });
    return card;
  }

  // ---------- Render da aba ----------
  function isSalvosVisible() { var p = $('#panel-salvos'); return p && !p.hidden; }

  function renderSalvos(banners) {
    var root = $('#salvos'); var msg = $('#salvosMsg');
    root.innerHTML = '';
    if (!BK.getUser()) {
      msg.hidden = false;
      msg.innerHTML = 'Faça login para ver os banners salvos. <button class="btn btn--primary btn--sm" id="salvosLogin">Entrar</button>';
      msg.querySelector('#salvosLogin').addEventListener('click', function () { openLogin(function () { AffemgSalvos.invalidate(); AffemgSalvos.refresh(); }); });
      return;
    }
    if (!banners.length) { msg.hidden = false; msg.textContent = 'Nenhum banner salvo ainda. Vá em “Criar banner” e clique em “Salvar no projeto”.'; return; }
    msg.hidden = true;

    // Agrupa por categoria; recomendado primeiro dentro do grupo.
    var groups = {}, order = [];
    banners.forEach(function (b) { var g = b.grupo || 'Geral'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(b); });
    order.sort(function (a, b) { return a.localeCompare(b, 'pt'); });
    order.forEach(function (g) { groups[g].sort(function (a, b) { return (b.recomendado ? 1 : 0) - (a.recomendado ? 1 : 0); }); });

    var recomendados = banners.filter(function (b) { return b.recomendado; });

    // Bloco de conjuntos para download.
    var setsWrap = el('div', 'sets');
    setsWrap.appendChild(el('h2', 'block-title', 'Conjuntos para download'));
    var setsGrid = el('div', 'sets__grid');
    if (recomendados.length) {
      var c = el('div', 'setcard');
      c.appendChild(el('span', 'setcard__name', 'Recomendados'));
      c.appendChild(el('span', 'setcard__desc', 'A opção recomendada de cada categoria.'));
      c.appendChild(el('span', 'setcard__count', recomendados.length + ' banners'));
      c.appendChild(zipButton('recomendados', recomendados, 'Baixar .zip'));
      setsGrid.appendChild(c);
    }
    order.forEach(function (g) {
      if (groups[g].length < 1) return;
      var c = el('div', 'setcard');
      c.appendChild(el('span', 'setcard__name', g));
      c.appendChild(el('span', 'setcard__count', groups[g].length + (groups[g].length === 1 ? ' banner' : ' banners')));
      c.appendChild(zipButton(g, groups[g], 'Baixar .zip'));
      setsGrid.appendChild(c);
    });
    setsWrap.appendChild(setsGrid);
    root.appendChild(setsWrap);

    // Categorias.
    order.forEach(function (g) {
      var wrap = el('section', 'gsec');
      var head = el('div', 'gsec__head');
      head.appendChild(el('h2', 'gsec__title', esc(g)));
      if (groups[g].length > 1) head.appendChild(zipButton(g, groups[g], 'Baixar todos (' + groups[g].length + ')'));
      wrap.appendChild(head);
      var grid = el('div', 'gsec__grid');
      groups[g].forEach(function (b) { grid.appendChild(bannerCard(b)); });
      wrap.appendChild(grid);
      root.appendChild(wrap);
    });
  }

  var salvosLoaded = false;
  window.AffemgSalvos = {
    invalidate: function () { salvosLoaded = false; cacheBanners = null; },
    refresh: function () {
      if (!BK || !BK.isEnabled()) return;
      if (!BK.getUser()) { renderSalvos([]); return; }
      if (salvosLoaded) return;
      var root = $('#salvos'); root.innerHTML = '<p class="empty">Carregando…</p>'; $('#salvosMsg').hidden = true;
      BK.listBanners().then(function (bs) { salvosLoaded = true; cacheBanners = bs; renderSalvos(bs); })
        .catch(function (err) { $('#salvosMsg').hidden = false; $('#salvosMsg').textContent = 'Erro ao carregar: ' + err.message; root.innerHTML = ''; });
    },
  };

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', function () {
    if (!BK || !BK.isEnabled()) return;
    $('#tabSalvos').hidden = false;
    var save = $('#btnSave'); save.hidden = false;
    save.addEventListener('click', openSave);

    BK.onAuth(function (user) {
      renderAuth(user);
      AffemgSalvos.invalidate();
      if (isSalvosVisible()) AffemgSalvos.refresh();
    });
    BK.init();
  });
})();
