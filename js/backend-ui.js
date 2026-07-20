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
    var fechado = false;
    var aoFechar = [];
    function onEsc(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (fechado) return;
      fechado = true;
      overlay.remove();
      document.body.classList.remove('has-modal');
      document.removeEventListener('keydown', onEsc);
      aoFechar.forEach(function (cb) { try { cb(); } catch (e) {} });
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);
    return {
      overlay: overlay,
      box: overlay.querySelector('.modal__box'),
      close: close,
      onClose: function (cb) { aoFechar.push(cb); },
    };
  }

  // ---------- Confirmação e aviso (no lugar de confirm()/alert()) ----------
  function acoes(botoes) { return '<div class="modal__actions">' + botoes + '</div>'; }

  function confirmar(opts) {
    return new Promise(function (resolve) {
      var m = modal(
        '<h3 class="modal__title">' + esc(opts.titulo) + '</h3>' +
        '<p class="modal__text">' + esc(opts.texto).replace(/\n/g, '<br>') + '</p>' +
        acoes(
          '<button class="btn btn--ghost" id="cNao">' + esc(opts.cancelar || 'Cancelar') + '</button>' +
          '<button class="btn ' + (opts.perigo ? 'btn--danger-solid' : 'btn--primary') + '" id="cSim">' +
          esc(opts.ok || 'Confirmar') + '</button>'
        )
      );
      var respondido = false;
      function responde(v) { if (respondido) return; respondido = true; m.close(); resolve(v); }
      m.box.querySelector('#cNao').addEventListener('click', function () { responde(false); });
      m.box.querySelector('#cSim').addEventListener('click', function () { responde(true); });
      // Fechar pelo X, pelo Escape ou clicando fora equivale a cancelar.
      m.onClose(function () { responde(false); });
      m.box.querySelector('#cSim').focus();
    });
  }

  function avisar(opts) {
    return new Promise(function (resolve) {
      var m = modal(
        '<h3 class="modal__title">' + esc(opts.titulo) + '</h3>' +
        '<p class="modal__text' + (opts.erro ? ' is-err' : '') + '">' +
          esc(opts.texto).replace(/\n/g, '<br>') + '</p>' +
        acoes('<button class="btn btn--primary" id="aOk">Entendi</button>')
      );
      m.onClose(function () { resolve(); });
      m.box.querySelector('#aOk').addEventListener('click', m.close);
      m.box.querySelector('#aOk').focus();
    });
  }

  // Campo de senha com botão para revelar o que está sendo digitado.
  function campoSenha(id, autocomplete) {
    return '<div class="field-pass">' +
      '<input type="password" id="' + id + '" autocomplete="' + (autocomplete || 'current-password') + '">' +
      '<button type="button" class="field-pass__eye" data-eye="' + id + '" aria-label="Mostrar senha" title="Mostrar senha">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
          '<path class="eye-open" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>' +
          '<circle class="eye-open" cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
          '<path class="eye-off" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M3 3l18 18"/>' +
        '</svg>' +
      '</button></div>';
  }

  // Liga os botões de revelar senha existentes dentro de um modal.
  function ligarOlhos(box) {
    box.querySelectorAll('[data-eye]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = box.querySelector('#' + btn.dataset.eye);
        var mostrando = input.type === 'text';
        input.type = mostrando ? 'password' : 'text';
        btn.classList.toggle('is-on', !mostrando);
        var rot = mostrando ? 'Mostrar senha' : 'Ocultar senha';
        btn.setAttribute('aria-label', rot);
        btn.setAttribute('title', rot);
        input.focus();
      });
    });
  }

  // ---------- Avisos rápidos no canto (toasts) ----------
  var TOAST_MS = 4000;

  function toastArea() {
    var area = document.getElementById('toasts');
    if (!area) {
      area = el('div', 'toasts');
      area.id = 'toasts';
      area.setAttribute('role', 'status');
      area.setAttribute('aria-live', 'polite');
      document.body.appendChild(area);
    }
    return area;
  }

  var ICONES = {
    ok: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M4 12.5l5 5L20 6.5"/></svg>',
    erro: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 6.5v7M12 17.4v.2"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 10.5v7M12 6.6v.2"/></svg>',
  };

  function toast(texto, tipo) {
    tipo = ICONES[tipo] ? tipo : 'info';
    var t = el('div', 'toast toast--' + tipo);
    t.innerHTML =
      '<span class="toast__icon">' + ICONES[tipo] + '</span>' +
      '<span class="toast__text">' + esc(texto) + '</span>' +
      '<button type="button" class="toast__x" aria-label="Fechar">&times;</button>';
    toastArea().appendChild(t);

    var saindo = false;
    var timer = setTimeout(sai, TOAST_MS);
    function sai() {
      if (saindo) return;
      saindo = true;
      clearTimeout(timer);
      t.classList.add('is-out');
      // Remove depois da animação; o fallback cobre quem tem motion desligado.
      var fim = setTimeout(function () { t.remove(); }, 400);
      t.addEventListener('animationend', function () { clearTimeout(fim); t.remove(); });
    }
    t.querySelector('.toast__x').addEventListener('click', sai);
    // Passar o mouse segura o aviso na tela.
    t.addEventListener('mouseenter', function () { clearTimeout(timer); });
    t.addEventListener('mouseleave', function () { timer = setTimeout(sai, 1500); });
    return { fecha: sai };
  }

  // ---------- Camada de carregando (para o que não tem skeleton) ----------
  function carregando(texto) {
    var ov = el('div', 'loading');
    ov.innerHTML =
      '<div class="loading__box" role="status" aria-live="assertive">' +
        '<span class="loading__spin" aria-hidden="true"></span>' +
        '<span class="loading__text">' + esc(texto || 'Carregando…') + '</span>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('has-loading');
    var fechado = false;
    return {
      texto: function (novo) { ov.querySelector('.loading__text').textContent = novo; },
      fecha: function () {
        if (fechado) return;
        fechado = true;
        ov.remove();
        if (!document.querySelector('.loading')) document.body.classList.remove('has-loading');
      },
    };
  }

  // Compartilhado com admin-ui.js, para não duplicar os helpers.
  window.AffemgUI = {
    modal: modal, el: el, esc: esc,
    confirmar: confirmar, avisar: avisar,
    toast: toast, carregando: carregando,
    campoSenha: campoSenha, ligarOlhos: ligarOlhos,
    openLogin: function (cb) { openLogin(cb); },
    openSolicitarAcesso: function (e) { openSolicitarAcesso(e); },
    openEsqueciSenha: function (e) { openEsqueciSenha(e); },
    openDefinirSenha: function (c) { openDefinirSenha(c); },
  };

  // ---------- Login ----------
  function openLogin(onDone) {
    var m = modal(
      '<h3 class="modal__title">Entrar</h3>' +
      '<label class="modal__label">E-mail</label><input type="email" id="mEmail" autocomplete="username">' +
      '<label class="modal__label">Senha</label>' + campoSenha('mPass', 'current-password') +
      '<div class="modal__links modal__links--stack">' +
        '<button type="button" class="linkbtn" id="mEsqueci">Esqueci minha senha</button>' +
        '<button type="button" class="linkbtn" id="mPedir">Não tenho acesso</button>' +
      '</div>' +
      '<div class="modal__msg" id="mMsg"></div>' +
      '<div class="modal__actions"><button class="btn btn--ghost" id="mCancel">Cancelar</button>' +
      '<button class="btn btn--primary" id="mLogin">Entrar</button></div>'
    );
    var email = m.box.querySelector('#mEmail'); email.focus();
    ligarOlhos(m.box);
    m.box.querySelector('#mCancel').addEventListener('click', m.close);
    m.box.querySelector('#mEsqueci').addEventListener('click', function () {
      m.close(); openEsqueciSenha(email.value.trim());
    });
    m.box.querySelector('#mPedir').addEventListener('click', function () {
      m.close(); openSolicitarAcesso(email.value.trim());
    });
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

  // ---------- Captcha (Cloudflare Turnstile) ----------
  // Carregado sob demanda, e só quando há site key. O resto do site continua
  // sem scripts externos.
  var turnstilePromise = null;
  function carregaTurnstile() {
    if (turnstilePromise) return turnstilePromise;
    turnstilePromise = new Promise(function (resolve, reject) {
      if (window.turnstile) return resolve(window.turnstile);
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.defer = true;
      s.onload = function () { resolve(window.turnstile); };
      s.onerror = function () { reject(new Error('Não foi possível carregar a verificação de segurança.')); };
      document.head.appendChild(s);
    });
    return turnstilePromise;
  }

  // ---------- Solicitar acesso ----------
  function openSolicitarAcesso(emailInicial) {
    var temCaptcha = BK.captchaSiteKey && BK.captchaSiteKey();
    var m = modal(
      '<h3 class="modal__title">Solicitar acesso</h3>' +
      '<p class="modal__text">O acesso é liberado por um administrador. ' +
        'Informe seus dados e você receberá um e-mail para criar sua senha.</p>' +
      '<label class="modal__label">Nome completo</label><input type="text" id="pNome" autocomplete="name">' +
      '<label class="modal__label">E-mail</label><input type="email" id="pEmail" autocomplete="email">' +
      (temCaptcha ? '<div class="captcha" id="pCaptcha"></div>' : '') +
      '<div class="modal__msg" id="pMsg"></div>' +
      '<div class="modal__actions"><button class="btn btn--ghost" id="pCancel">Cancelar</button>' +
      '<button class="btn btn--primary" id="pEnviar">Enviar pedido</button></div>'
    );
    var nome = m.box.querySelector('#pNome');
    var email = m.box.querySelector('#pEmail');
    var msg = m.box.querySelector('#pMsg');
    var btn = m.box.querySelector('#pEnviar');
    if (emailInicial) email.value = emailInicial;
    nome.focus();
    m.box.querySelector('#pCancel').addEventListener('click', m.close);

    var captchaToken = '';
    var ts = null, widgetId = null;
    function resetaCaptcha() {
      captchaToken = '';
      if (ts && widgetId != null) { try { ts.reset(widgetId); } catch (e) {} btn.disabled = true; }
    }
    if (temCaptcha) {
      btn.disabled = true;   // só libera quando o captcha resolver
      carregaTurnstile().then(function (api) {
        ts = api;
        widgetId = api.render('#pCaptcha', {
          sitekey: BK.captchaSiteKey(),
          callback: function (t) { captchaToken = t; btn.disabled = false; },
          'expired-callback': function () { captchaToken = ''; btn.disabled = true; },
          'error-callback': function () { captchaToken = ''; btn.disabled = true; },
        });
      }).catch(function (err) {
        msg.textContent = err.message; msg.className = 'modal__msg is-err';
      });
    }

    function enviar() {
      msg.textContent = 'Enviando…'; msg.className = 'modal__msg';
      btn.disabled = true;
      BK.solicitarAcesso({ nome: nome.value, email: email.value, captchaToken: captchaToken })
        .then(function () {
          m.close();
          avisar({
            titulo: 'Pedido enviado',
            texto: 'Seu pedido foi enviado aos administradores. Assim que for aprovado, ' +
                   'você receberá um e-mail em ' + email.value.trim() + ' com o link para criar sua senha.',
          });
        })
        .catch(function (err) {
          msg.textContent = err.message; msg.className = 'modal__msg is-err';
          // O token do captcha é de uso único: gera um novo para a próxima tentativa.
          if (temCaptcha) resetaCaptcha(); else btn.disabled = false;
        });
    }
    btn.addEventListener('click', enviar);
    email.addEventListener('keydown', function (e) { if (e.key === 'Enter') enviar(); });
  }

  // ---------- Esqueci minha senha ----------
  function openEsqueciSenha(emailInicial) {
    var m = modal(
      '<h3 class="modal__title">Redefinir senha</h3>' +
      '<p class="modal__text">Informe seu e-mail. Se houver uma conta, você receberá ' +
        'um link para criar uma nova senha.</p>' +
      '<label class="modal__label">E-mail</label><input type="email" id="rEmail" autocomplete="email">' +
      '<div class="modal__msg" id="rMsg"></div>' +
      '<div class="modal__actions"><button class="btn btn--ghost" id="rCancel">Cancelar</button>' +
      '<button class="btn btn--primary" id="rEnviar">Enviar link</button></div>'
    );
    var email = m.box.querySelector('#rEmail');
    var msg = m.box.querySelector('#rMsg');
    var btn = m.box.querySelector('#rEnviar');
    if (emailInicial) email.value = emailInicial;
    email.focus();
    m.box.querySelector('#rCancel').addEventListener('click', m.close);

    function enviar() {
      var v = email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) {
        msg.textContent = 'Informe um e-mail válido.'; msg.className = 'modal__msg is-err';
        return;
      }
      msg.textContent = 'Enviando…'; msg.className = 'modal__msg';
      btn.disabled = true;
      BK.enviarLinkDeSenha(v)
        .then(function () {
          m.close();
          // A mensagem não confirma se a conta existe, de propósito: isso
          // evitaria descobrir quem tem cadastro só testando e-mails.
          avisar({
            titulo: 'Verifique seu e-mail',
            texto: 'Se existir uma conta para ' + v + ', o link para criar uma nova senha ' +
                   'chegará em instantes. O link vale por uma hora.',
          });
        })
        .catch(function (err) {
          msg.textContent = err.message; msg.className = 'modal__msg is-err';
          btn.disabled = false;
        });
    }
    btn.addEventListener('click', enviar);
    email.addEventListener('keydown', function (e) { if (e.key === 'Enter') enviar(); });
  }

  // ---------- Definir senha (chegou pelo link do e-mail) ----------
  function openDefinirSenha(convite) {
    var m = modal(
      '<h3 class="modal__title">' + (convite ? 'Bem-vindo. Crie sua senha' : 'Crie sua nova senha') + '</h3>' +
      '<p class="modal__text">' + (convite
        ? 'Seu acesso foi aprovado. Defina uma senha para entrar na ferramenta.'
        : 'Escolha uma nova senha para a sua conta.') + '</p>' +
      '<label class="modal__label">Nova senha</label>' + campoSenha('dSenha', 'new-password') +
      '<label class="modal__label">Repita a senha</label>' + campoSenha('dSenha2', 'new-password') +
      '<div class="modal__hint">Pelo menos 6 caracteres.</div>' +
      '<div class="modal__msg" id="dMsg"></div>' +
      '<div class="modal__actions">' +
      '<button class="btn btn--primary" id="dSalvar">Salvar senha</button></div>'
    );
    var s1 = m.box.querySelector('#dSenha');
    var s2 = m.box.querySelector('#dSenha2');
    var msg = m.box.querySelector('#dMsg');
    var btn = m.box.querySelector('#dSalvar');
    ligarOlhos(m.box);
    s1.focus();

    function salvar() {
      if (s1.value.length < 6) {
        msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
        msg.className = 'modal__msg is-err'; s1.focus(); return;
      }
      if (s1.value !== s2.value) {
        msg.textContent = 'As duas senhas não são iguais.';
        msg.className = 'modal__msg is-err'; s2.focus(); return;
      }
      msg.textContent = ''; btn.disabled = true;
      var load = carregando('Salvando a senha…');
      BK.definirSenha(s1.value)
        .then(function () {
          load.fecha(); m.close();
          limpaHash();
          toast('Senha criada. Você já está conectado.', 'ok');
        })
        .catch(function (err) {
          load.fecha();
          msg.textContent = err.message; msg.className = 'modal__msg is-err';
          btn.disabled = false;
        });
    }
    btn.addEventListener('click', salvar);
    s2.addEventListener('keydown', function (e) { if (e.key === 'Enter') salvar(); });
  }

  // Tira o token da barra de endereço depois de usado.
  function limpaHash() {
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
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
    if (!window.AffemgCreator || !AffemgCreator.hasImage()) {
      toast('Envie uma imagem e monte o banner antes de salvar.', 'info');
      return;
    }
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
      var msg = m.box.querySelector('#sMsg'); msg.textContent = ''; msg.className = 'modal__msg';
      var btn = m.box.querySelector('#sSave'); btn.disabled = true;
      var load = carregando('Gerando o WebP…');
      window.AffemgWebp.render(AffemgCreator.currentSVG(), { quality: 0.92 })
        .then(function (blob) { load.texto('Salvando no projeto…'); return BK.saveBanner({ titulo: nome, grupo: grupo, recomendado: reco, blob: blob }); })
        .then(function () {
          load.fecha(); m.close();
          AffemgSalvos.invalidate(); if (isSalvosVisible()) AffemgSalvos.refresh();
          toast('Banner salvo em “' + grupo + '”.', 'ok');
        })
        .catch(function (err) {
          load.fecha();
          msg.textContent = 'Falha: ' + err.message; msg.className = 'modal__msg is-err';
          btn.disabled = false;
        });
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
      var load = carregando('Compactando ' + banners.length + ' banners…');
      AffemgZip.download(nome, zipEntries(banners))
        .then(function () { toast('Download do .zip iniciado.', 'ok'); })
        .catch(function (err) { toast('Falha ao gerar o .zip: ' + err.message, 'erro'); })
        .then(function () { load.fecha(); btn.disabled = false; btn.textContent = label; });
    });
    return btn;
  }

  // Faixa de miniaturas (preview) dos banners de um conjunto; clique amplia.
  function setThumbs(banners) {
    var strip = el('div', 'setcard__thumbs');
    banners.forEach(function (b) {
      var src = BK.publicUrl(b.storage_path);
      var t = el('button', 'setcard__thumb');
      t.type = 'button';
      t.setAttribute('aria-label', 'Ampliar: ' + esc(b.titulo));
      t.innerHTML = '<img src="' + src + '" alt="' + esc(b.titulo) + '" loading="lazy">';
      t.addEventListener('click', function () { AffemgLightbox.open(src, b.titulo, safeFile(b.titulo)); });
      strip.appendChild(t);
    });
    return strip;
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
    dl.addEventListener('click', function () {
      dl.disabled = true;
      var load = carregando('Preparando o download…');
      downloadOne(b)
        .catch(function (e) { toast('Falha ao baixar: ' + e.message, 'erro'); })
        .then(function () { load.fecha(); dl.disabled = false; });
    });
    var del = card.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      confirmar({
        titulo: 'Remover banner',
        texto: 'O banner “' + b.titulo + '” será apagado para todos os usuários. Não dá para desfazer.',
        ok: 'Remover', perigo: true,
      }).then(function (sim) {
        if (!sim) return;
        del.disabled = true; del.textContent = 'Removendo…';
        BK.deleteBanner(b)
          .then(function () {
            toast('Banner “' + b.titulo + '” removido.', 'ok');
            AffemgSalvos.invalidate(); AffemgSalvos.refresh();
          })
          .catch(function (err) {
            toast('Falha ao remover: ' + err.message, 'erro');
            del.disabled = false; del.textContent = 'Remover';
          });
      });
    });
    return card;
  }

  // ---------- Skeleton (enquanto carrega) ----------
  function skeletonSalvos() {
    var card =
      '<figure class="gcard gcard--skel">' +
        '<div class="skel skel--img"></div>' +
        '<figcaption class="gcard__body">' +
          '<span class="skel skel--line"></span>' +
          '<span class="skel skel--btn"></span>' +
        '</figcaption>' +
      '</figure>';
    var grid = '';
    for (var i = 0; i < 6; i++) grid += card;
    return '' +
      '<section class="gsec" aria-hidden="true">' +
        '<div class="gsec__head"><span class="skel skel--title"></span></div>' +
        '<div class="gsec__grid">' + grid + '</div>' +
      '</section>';
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

    // Bloco de conjuntos para download — por enquanto, só "Recomendados" (com preview).
    if (recomendados.length) {
      var setsWrap = el('div', 'sets');
      setsWrap.appendChild(el('h2', 'block-title', 'Conjuntos para download'));
      var setsGrid = el('div', 'sets__grid');
      var c = el('div', 'setcard setcard--wide');
      c.appendChild(el('span', 'setcard__name', 'Recomendados'));
      c.appendChild(el('span', 'setcard__desc', 'A opção recomendada de cada categoria.'));
      c.appendChild(el('span', 'setcard__count', recomendados.length + ' banners'));
      c.appendChild(setThumbs(recomendados));
      c.appendChild(zipButton('recomendados', recomendados, 'Baixar .zip'));
      setsGrid.appendChild(c);
      setsWrap.appendChild(setsGrid);
      root.appendChild(setsWrap);
    }

    // Categorias.
    order.forEach(function (g) {
      var wrap = el('section', 'gsec');
      var head = el('div', 'gsec__head');
      head.appendChild(el('h2', 'gsec__title', esc(g)));
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
      var root = $('#salvos'); root.innerHTML = skeletonSalvos(); $('#salvosMsg').hidden = true;
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

    // Quem chega por um link de convite ou de recuperação já vem com sessão
    // aberta, mas sem senha definida: a primeira coisa na tela é criá-la.
    var tipo = BK.tipoDoLink();
    BK.init().then(function (user) {
      if (user && (tipo === 'invite' || tipo === 'recovery')) {
        openDefinirSenha(tipo === 'invite');
      } else if (tipo === 'recovery' || tipo === 'invite') {
        // Link expirado ou já usado: a sessão não veio.
        avisar({
          titulo: 'Link inválido ou expirado',
          texto: 'Peça um novo link em “Esqueci minha senha”, na tela de entrada.',
          erro: true,
        });
        limpaHash();
      }
    });
  });
})();
