/* admin-ui.js: aba "Usuários", visível apenas para administradores.
   Lista quem tem acesso, cadastra novos e remove.
   Admins não podem remover outros admins, e o admin master não aparece na lista
   (quem esconde é a RLS do Supabase, não esta tela). Ver SUPABASE-SETUP.md. */
(function () {
  'use strict';

  var BK = window.AffemgBackend;
  var UI = window.AffemgUI || {};
  var $ = function (s) { return document.querySelector(s); };
  var el = UI.el, esc = UI.esc, modal = UI.modal;

  function dataBR(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR');
  }

  // ---------- Cadastro ----------
  function openNovo(onDone) {
    var m = modal(
      '<h3 class="modal__title">Novo usuário</h3>' +
      '<label class="modal__label">Nome</label><input type="text" id="uNome" autocomplete="name">' +
      '<label class="modal__label">E-mail</label><input type="email" id="uEmail" autocomplete="off">' +
      '<label class="modal__label">Senha</label><input type="password" id="uSenha" autocomplete="new-password">' +
      '<div class="modal__hint">A senha precisa ter pelo menos 6 caracteres. O usuário já entra direto, sem confirmar e-mail.</div>' +
      '<div class="modal__msg" id="uMsg"></div>' +
      '<div class="modal__actions"><button class="btn btn--ghost" id="uCancel">Cancelar</button>' +
      '<button class="btn btn--primary" id="uSave">Cadastrar</button></div>'
    );
    var nome = m.box.querySelector('#uNome');
    var email = m.box.querySelector('#uEmail');
    var senha = m.box.querySelector('#uSenha');
    var msg = m.box.querySelector('#uMsg');
    var btn = m.box.querySelector('#uSave');
    nome.focus();
    m.box.querySelector('#uCancel').addEventListener('click', m.close);

    function erro(texto) { msg.textContent = texto; msg.className = 'modal__msg is-err'; }

    function submit() {
      var v = { nome: nome.value.trim(), email: email.value.trim(), senha: senha.value };
      if (!v.nome) { erro('Informe o nome.'); nome.focus(); return; }
      if (!v.email) { erro('Informe o e-mail.'); email.focus(); return; }
      if (v.senha.length < 6) { erro('A senha precisa ter pelo menos 6 caracteres.'); senha.focus(); return; }

      msg.textContent = 'Cadastrando…'; msg.className = 'modal__msg';
      btn.disabled = true;
      BK.createUser(v)
        .then(function () { m.close(); if (onDone) onDone(); })
        .catch(function (err) { erro(err.message); btn.disabled = false; });
    }
    btn.addEventListener('click', submit);
    senha.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  // ---------- Cartão de usuário ----------
  function userCard(u, onChange) {
    var card = el('div', 'ucard');
    var nome = esc(u.nome || u.email || 'Sem nome');
    var pode = BK.canManageUser(u);

    card.innerHTML =
      '<div class="ucard__info">' +
        '<span class="ucard__name">' + nome +
          (u.is_admin ? '<span class="ucard__tag">admin</span>' : '') + '</span>' +
        '<span class="ucard__mail">' + esc(u.email || '') + '</span>' +
        (u.created_at ? '<span class="ucard__since">Desde ' + dataBR(u.created_at) + '</span>' : '') +
      '</div>' +
      '<div class="ucard__acts">' +
        (pode ? '<button class="btn btn--danger btn--sm" data-del="1">Remover</button>' : '') +
      '</div>';

    var del = card.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      var aviso = 'Remover o acesso de "' + (u.nome || u.email) + '"?\n\n' +
        'Os banners criados por essa pessoa continuam na galeria, sob o admin.';
      if (!confirm(aviso)) return;
      del.disabled = true; del.textContent = 'Removendo…';
      BK.deleteUser(u.id)
        .then(function () { if (onChange) onChange(); })
        .catch(function (err) {
          alert('Falha ao remover: ' + err.message);
          del.disabled = false; del.textContent = 'Remover';
        });
    });
    return card;
  }

  // ---------- Skeleton ----------
  function skeleton() {
    var linha =
      '<div class="ucard ucard--skel">' +
        '<div class="ucard__info">' +
          '<span class="skel skel--line"></span>' +
          '<span class="skel skel--line skel--short"></span>' +
        '</div>' +
        '<span class="skel skel--btn"></span>' +
      '</div>';
    var out = '';
    for (var i = 0; i < 4; i++) out += linha;
    return '<div class="ulist" aria-hidden="true">' + out + '</div>';
  }

  // ---------- Render ----------
  function render(users) {
    var root = $('#usuarios');
    var msg = $('#usuariosMsg');
    root.innerHTML = '';

    if (!users.length) {
      msg.hidden = false;
      msg.textContent = 'Nenhum usuário cadastrado ainda além de você.';
      return;
    }
    msg.hidden = true;

    var lista = el('div', 'ulist');
    users.forEach(function (u) {
      lista.appendChild(userCard(u, function () { Usuarios.invalidate(); Usuarios.refresh(); }));
    });
    root.appendChild(lista);
  }

  function isVisible() { var p = $('#panel-usuarios'); return p && !p.hidden; }

  var carregado = false;
  var Usuarios = {
    invalidate: function () { carregado = false; },
    refresh: function () {
      if (!BK || !BK.isEnabled() || !BK.isAdmin()) return;
      if (carregado) return;
      var root = $('#usuarios');
      var msg = $('#usuariosMsg');
      root.innerHTML = skeleton();
      msg.hidden = true;
      BK.listUsers()
        .then(function (us) { carregado = true; render(us); })
        .catch(function (err) {
          root.innerHTML = '';
          msg.hidden = false;
          msg.textContent = 'Erro ao carregar: ' + err.message;
        });
    },
  };
  window.AffemgUsuarios = Usuarios;

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', function () {
    if (!BK || !BK.isEnabled()) return;

    $('#btnNovoUsuario').addEventListener('click', function () {
      openNovo(function () { Usuarios.invalidate(); Usuarios.refresh(); });
    });

    // A aba só existe para admin. Se o usuário sair ou trocar, ela some de novo.
    BK.onAuth(function (user, admin) {
      var tab = $('#tabUsuarios');
      tab.hidden = !(user && admin);
      Usuarios.invalidate();
      if (tab.hidden && isVisible() && window.AffemgTabs) window.AffemgTabs.activate('criar');
      else if (isVisible()) Usuarios.refresh();
    });
  });
})();
