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
          ? '<button class="btn btn--ghost btn--sm" data-senha="1">Redefinir senha</button>' +
            '<button class="btn btn--ghost btn--sm" data-edit="1">Editar</button>' +
            '<button class="btn btn--danger btn--sm" data-del="1">Remover</button>'
          : '<span class="ucard__nota">' + (eu ? 'Sua conta' : 'Somente leitura') + '</span>') +
      '</div>';

    var senha = card.querySelector('[data-senha]');
    if (senha) senha.addEventListener('click', function () {
      confirmar({
        titulo: 'Enviar link de nova senha',
        texto: '“' + (u.nome || u.email) + '” vai receber um e-mail em ' + u.email +
               ' com o link para criar uma nova senha. A senha atual continua valendo até ela trocar.',
        ok: 'Enviar',
      }).then(function (sim) {
        if (!sim) return;
        senha.disabled = true; senha.textContent = 'Enviando…';
        BK.enviarLinkDeSenha(u.email)
          .then(function () { toast('Link enviado para ' + u.email + '.', 'ok'); })
          .catch(function (err) { toast('Falha ao enviar: ' + err.message, 'erro'); })
          .then(function () { senha.disabled = false; senha.textContent = 'Redefinir senha'; });
      });
    });

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

  // ---------- Fila de solicitações de acesso ----------
  function pedidoCard(s, onChange) {
    var card = el('div', 'ucard ucard--pedido');
    card.innerHTML =
      '<div class="ucard__info">' +
        '<span class="ucard__name">' + esc(s.nome) +
          '<span class="ucard__tag ucard__tag--novo">novo</span></span>' +
        '<span class="ucard__mail">' + esc(s.email) + '</span>' +
        '<span class="ucard__since">Pedido em ' + dataBR(s.created_at) + '</span>' +
      '</div>' +
      '<div class="ucard__acts">' +
        '<button class="btn btn--ghost btn--sm" data-nao="1">Recusar</button>' +
        '<button class="btn btn--primary btn--sm" data-sim="1">Aprovar</button>' +
      '</div>';

    function trava(on, texto) {
      card.querySelectorAll('button').forEach(function (b) { b.disabled = on; });
      if (texto) card.querySelector('[data-sim]').textContent = texto;
    }

    card.querySelector('[data-sim]').addEventListener('click', function () {
      trava(true, 'Aprovando…');
      var load = carregando('Criando a conta e enviando o convite…');
      BK.aprovarSolicitacao(s.id)
        .then(function (r) {
          load.fecha();
          if (r && r.jaExiste) return jaTemConta(s, onChange);
          toast('Acesso aprovado. Convite enviado para ' + s.email + '.', 'ok');
          if (onChange) onChange();
        })
        .catch(function (err) {
          load.fecha();
          toast('Falha ao aprovar: ' + err.message, 'erro');
          trava(false, 'Aprovar');
        });
    });

    card.querySelector('[data-nao]').addEventListener('click', function () {
      confirmar({
        titulo: 'Recusar pedido',
        texto: '“' + s.nome + '” não terá acesso à ferramenta. O pedido sai da lista.',
        ok: 'Recusar', perigo: true,
      }).then(function (sim) {
        if (!sim) return;
        trava(true);
        BK.recusarSolicitacao(s.id)
          .then(function () { toast('Pedido recusado.', 'ok'); if (onChange) onChange(); })
          .catch(function (err) { toast('Falha: ' + err.message, 'erro'); trava(false, 'Aprovar'); });
      });
    });
    return card;
  }

  // O e-mail do pedido já tem conta: em vez de criar de novo, o caminho útil
  // é mandar o link para a pessoa recuperar a senha.
  function jaTemConta(s, onChange) {
    var m = modal(
      '<h3 class="modal__title">Esse e-mail já tem conta</h3>' +
      '<p class="modal__text">Já existe um cadastro para <strong>' + esc(s.email) + '</strong>. ' +
        'Provavelmente a pessoa esqueceu a senha. Você pode enviar o link para ela criar uma nova.</p>' +
      '<div class="modal__msg" id="jMsg"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" id="jFechar">Só arquivar o pedido</button>' +
        '<button class="btn btn--primary" id="jEnviar">Enviar link de senha</button>' +
      '</div>'
    );
    function arquiva() {
      return BK.concluirSolicitacao(s.id).catch(function () {});
    }
    m.box.querySelector('#jFechar').addEventListener('click', function () {
      m.close();
      arquiva().then(function () { toast('Pedido arquivado.', 'ok'); if (onChange) onChange(); });
    });
    m.box.querySelector('#jEnviar').addEventListener('click', function () {
      var btn = m.box.querySelector('#jEnviar');
      btn.disabled = true;
      m.box.querySelector('#jMsg').textContent = 'Enviando…';
      BK.enviarLinkDeSenha(s.email)
        .then(arquiva)
        .then(function () {
          m.close();
          toast('Link de nova senha enviado para ' + s.email + '.', 'ok');
          if (onChange) onChange();
        })
        .catch(function (err) {
          btn.disabled = false;
          var msg = m.box.querySelector('#jMsg');
          msg.textContent = err.message; msg.className = 'modal__msg is-err';
        });
    });
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
  function render(users, pedidos) {
    var root = $('#usuarios');
    var msg = $('#usuariosMsg');
    root.innerHTML = '';

    // Pedidos de acesso vêm primeiro: é o que exige ação do admin.
    if (pedidos && pedidos.length) {
      var bloco = el('section', 'pedidos');
      bloco.appendChild(el('h2', 'block-title',
        'Pedidos de acesso (' + pedidos.length + ')'));
      var lista = el('div', 'ulist');
      pedidos.forEach(function (s) {
        lista.appendChild(pedidoCard(s, function () { Usuarios.invalidate(); Usuarios.refresh(); }));
      });
      bloco.appendChild(lista);
      root.appendChild(bloco);
    }

    if (!users.length) {
      msg.hidden = false;
      msg.textContent = 'Nenhum usuário cadastrado ainda além de você.';
      return;
    }
    msg.hidden = true;

    var wrap = el('section', 'usec');
    if (pedidos && pedidos.length) wrap.appendChild(el('h2', 'block-title', 'Com acesso'));
    var lista = el('div', 'ulist');
    users.forEach(function (u) {
      lista.appendChild(userCard(u, function () { Usuarios.invalidate(); Usuarios.refresh(); }));
    });
    wrap.appendChild(lista);
    root.appendChild(wrap);
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
      Promise.all([
        BK.listUsers(),
        BK.listSolicitacoes().catch(function () { return []; }),
      ])
        .then(function (r) {
          carregado = true;
          render(r[0], r[1]);
          if (window.AffemgNotif) AffemgNotif.aplica(r[1]);  // sincroniza o sino
        })
        .catch(function (err) {
          root.innerHTML = '';
          msg.hidden = false;
          msg.textContent = 'Erro ao carregar: ' + err.message;
        });
    },
  };
  window.AffemgUsuarios = Usuarios;

  // ---------- Notificações (sino, só admin) ----------
  var Notif = (function () {
    var timer = null;
    var pop, btn, badge, wrap;

    function elementos() {
      wrap = wrap || $('#notif');
      btn = btn || $('#btnNotif');
      badge = badge || $('#notifBadge');
      pop = pop || $('#notifPop');
    }

    function fechaPop() {
      if (!pop) return;
      pop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', foraDoPop, true);
    }
    function foraDoPop(e) {
      if (wrap && !wrap.contains(e.target)) fechaPop();
    }

    function irParaUsuarios() {
      fechaPop();
      if (window.AffemgTabs) window.AffemgTabs.activate('usuarios');
      var painel = $('#panel-usuarios');
      if (painel) painel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function pintaPop(pedidos) {
      elementos();
      pop.innerHTML = '';
      pop.appendChild(el('div', 'notifpop__head', 'Notificações'));

      if (!pedidos.length) {
        pop.appendChild(el('div', 'notifpop__vazio', 'Nada de novo por aqui.'));
        return;
      }

      pop.appendChild(el('div', 'notifpop__sub',
        pedidos.length === 1 ? '1 pedido de acesso aguardando' : pedidos.length + ' pedidos de acesso aguardando'));

      var lista = el('div', 'notifpop__list');
      pedidos.slice(0, 5).forEach(function (s) {
        var item = el('button', 'notifpop__item');
        item.type = 'button';
        item.innerHTML =
          '<span class="notifpop__nome">' + esc(s.nome) + '</span>' +
          '<span class="notifpop__mail">' + esc(s.email) + '</span>';
        item.addEventListener('click', irParaUsuarios);
        lista.appendChild(item);
      });
      pop.appendChild(lista);

      var verTodos = el('button', 'notifpop__todos', 'Ver na aba Usuários');
      verTodos.type = 'button';
      verTodos.addEventListener('click', irParaUsuarios);
      pop.appendChild(verTodos);
    }

    // Atualiza o número no sino. Aceita a lista já buscada (para não pedir de
    // novo quando a aba Usuários acabou de carregar).
    function aplica(pedidos) {
      elementos();
      var n = pedidos.length;
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.hidden = n === 0;
      btn.classList.toggle('is-alerta', n > 0);
      if (pop && !pop.hidden) pintaPop(pedidos);
    }

    function busca() {
      if (!BK.isAdmin()) return;
      BK.listSolicitacoes().then(aplica).catch(function () {});
    }

    return {
      ligar: function () {
        elementos();
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!pop.hidden) return fechaPop();
          // Abre com o que já se sabe e busca a versão fresca.
          BK.listSolicitacoes().then(function (ps) {
            pintaPop(ps); aplica(ps);
            pop.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            document.addEventListener('click', foraDoPop, true);
          }).catch(function () {
            pintaPop([]); pop.hidden = false;
          });
        });
      },
      mostrar: function (on) {
        elementos();
        wrap.hidden = !on;
        if (!on) { fechaPop(); badge.hidden = true; }
      },
      atualiza: busca,
      aplica: aplica,          // usado pela aba Usuários, sem refetch
      iniciaPoll: function () {
        if (timer) return;
        // A cada 60s enquanto a aba estiver visível e houver admin logado.
        timer = setInterval(function () {
          if (BK.isAdmin() && !document.hidden) busca();
        }, 60000);
      },
    };
  })();

  window.AffemgNotif = Notif;

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', function () {
    if (!BK || !BK.isEnabled()) return;

    $('#btnNovoUsuario').addEventListener('click', function () {
      openForm(null, function () { Usuarios.invalidate(); Usuarios.refresh(); });
    });

    Notif.ligar();
    Notif.iniciaPoll();

    // A aba e o sino só existem para admin. Se o usuário sair ou trocar, somem.
    BK.onAuth(function (user, admin) {
      var ehAdmin = !!(user && admin);
      var tab = $('#tabUsuarios');
      tab.hidden = !ehAdmin;
      Notif.mostrar(ehAdmin);
      Usuarios.invalidate();
      if (!ehAdmin) {
        if (isVisible() && window.AffemgTabs) window.AffemgTabs.activate('criar');
      } else {
        Notif.atualiza();
        if (isVisible()) Usuarios.refresh();
      }
    });
  });
})();
