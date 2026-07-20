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
  var confirmar = UI.confirmar, avisar = UI.avisar;
  var campoSenha = UI.campoSenha, ligarOlhos = UI.ligarOlhos;
  var toast = UI.toast, carregando = UI.carregando;

  function dataBR(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR');
  }

  // ---------- Cadastro e edição (mesmo formulário) ----------
  // Sem "u" (usuário existente) é cadastro; com "u" é edição, e aí a senha
  // é opcional: em branco, mantém a que a pessoa já usa.
  function openForm(u, onDone) {
    var editando = !!u;
    var m = modal(
      '<h3 class="modal__title">' + (editando ? 'Editar usuário' : 'Novo usuário') + '</h3>' +
      '<label class="modal__label">Nome</label><input type="text" id="uNome" autocomplete="name">' +
      '<label class="modal__label">E-mail</label><input type="email" id="uEmail" autocomplete="off">' +
      '<label class="modal__label">' + (editando ? 'Nova senha' : 'Senha') + '</label>' +
      campoSenha('uSenha', 'new-password') +
      '<div class="modal__hint">' + (editando
        ? 'Deixe a senha em branco para manter a atual.'
        : 'A senha precisa ter pelo menos 6 caracteres. O usuário já entra direto, sem confirmar e-mail.') +
      '</div>' +
      '<div class="modal__msg" id="uMsg"></div>' +
      '<div class="modal__actions"><button class="btn btn--ghost" id="uCancel">Cancelar</button>' +
      '<button class="btn btn--primary" id="uSave">' + (editando ? 'Salvar' : 'Cadastrar') + '</button></div>'
    );
    var nome = m.box.querySelector('#uNome');
    var email = m.box.querySelector('#uEmail');
    var senha = m.box.querySelector('#uSenha');
    var msg = m.box.querySelector('#uMsg');
    var btn = m.box.querySelector('#uSave');

    if (editando) { nome.value = u.nome || ''; email.value = u.email || ''; }
    ligarOlhos(m.box);
    nome.focus();
    m.box.querySelector('#uCancel').addEventListener('click', m.close);

    function erro(texto) { msg.textContent = texto; msg.className = 'modal__msg is-err'; }

    function submit() {
      var v = { nome: nome.value.trim(), email: email.value.trim(), senha: senha.value };
      if (!v.nome) { erro('Informe o nome.'); nome.focus(); return; }
      if (!v.email) { erro('Informe o e-mail.'); email.focus(); return; }
      if (!editando && v.senha.length < 6) {
        erro('A senha precisa ter pelo menos 6 caracteres.'); senha.focus(); return;
      }
      if (editando && v.senha && v.senha.length < 6) {
        erro('A nova senha precisa ter pelo menos 6 caracteres.'); senha.focus(); return;
      }

      msg.textContent = ''; msg.className = 'modal__msg';
      btn.disabled = true;
      var load = carregando(editando ? 'Salvando alterações…' : 'Criando o usuário…');

      var acao = editando
        ? BK.updateUser({ id: u.id, nome: v.nome, email: v.email, senha: v.senha })
        : BK.createUser(v);

      acao.then(function () {
        load.fecha(); m.close();
        toast(editando ? 'Dados de “' + v.nome + '” atualizados.' : 'Usuário “' + v.nome + '” criado.', 'ok');
        if (onDone) onDone();
      }).catch(function (err) { load.fecha(); erro(err.message); btn.disabled = false; });
    }
    btn.addEventListener('click', submit);
    senha.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  // ---------- Cartão de usuário ----------
  function userCard(u, onChange) {
    var card = el('div', 'ucard');
    var nome = esc(u.nome || u.email || 'Sem nome');
    var pode = BK.canManageUser(u);
    var eu = BK.getUser() && u.id === BK.getUser().id;

    var selos =
      (u.is_master ? '<span class="ucard__tag ucard__tag--master">master</span>'
        : u.is_admin ? '<span class="ucard__tag">admin</span>' : '') +
      (eu ? '<span class="ucard__tag ucard__tag--eu">você</span>' : '');

    card.innerHTML =
      '<div class="ucard__info">' +
        '<span class="ucard__name">' + nome + selos + '</span>' +
        '<span class="ucard__mail">' + esc(u.email || '') + '</span>' +
        (u.created_at ? '<span class="ucard__since">Desde ' + dataBR(u.created_at) + '</span>' : '') +
      '</div>' +
      '<div class="ucard__acts">' +
        (pode
          ? '<button class="btn btn--ghost btn--sm" data-edit="1">Editar</button>' +
            '<button class="btn btn--danger btn--sm" data-del="1">Remover</button>'
          : '<span class="ucard__nota">' + (eu ? 'Sua conta' : 'Somente leitura') + '</span>') +
      '</div>';

    var edit = card.querySelector('[data-edit]');
    if (edit) edit.addEventListener('click', function () {
      openForm(u, function () { if (onChange) onChange(); });
    });

    var del = card.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      confirmar({
        titulo: 'Remover acesso',
        texto: '“' + (u.nome || u.email) + '” perderá o acesso à ferramenta.\n\n' +
               'Os banners criados por essa pessoa continuam na galeria, sob o admin.',
        ok: 'Remover', perigo: true,
      }).then(function (sim) {
        if (!sim) return;
        del.disabled = true; del.textContent = 'Removendo…';
        var load = carregando('Removendo o acesso…');
        BK.deleteUser(u.id)
          .then(function () {
            load.fecha();
            toast('“' + (u.nome || u.email) + '” não tem mais acesso.', 'ok');
            if (onChange) onChange();
          })
          .catch(function (err) {
            load.fecha();
            toast('Falha ao remover: ' + err.message, 'erro');
            del.disabled = false; del.textContent = 'Remover';
          });
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
      openForm(null, function () { Usuarios.invalidate(); Usuarios.refresh(); });
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
