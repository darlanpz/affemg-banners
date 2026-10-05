/* onboarding.js: boas-vindas no primeiro acesso + tutorial guiado.

   O tutorial é guiado: cada passo destaca um elemento e tem sempre duas ações,
   "Cancelar" e "Continuar". Só o Continuar avança; mexer no formulário nunca
   avança sozinho. Alguns passos pedem uma ação antes (ex.: escolher a imagem) e
   mantêm o Continuar desligado até ela acontecer. No fim há um banner salvo de verdade.

   Para revisitar: botão "Como usar" no topo. */
(function () {
  'use strict';

  var UI = window.AffemgUI || {};
  var BK = window.AffemgBackend;
  var $ = function (s) { return document.querySelector(s); };

  var CHAVE = 'affemg.tutorial.v1';

  // ---------- O banner de exemplo ----------
  // O banner que a pessoa monta durante o tutorial: uma peça nova para uma
  // categoria que já existe. Trocar aqui muda o tutorial inteiro.
  var EXEMPLO = {
    imagem: 'assets/exemplo-fundo.webp',
    categoria: 'Convênios',   // categoria que já existe nos salvos
    variante: '02',           // imagem + textura
    elemento: 'direita',      // logo no canto direito
    escurecer: true,
    footer: true,
  };

  function nomeDe(lista, id) {
    var B = window.AffemgBanner;
    var achou = (B && B[lista] || []).filter(function (x) { return x.id === id; })[0];
    return achou ? achou.nome : id;
  }

  // ---------- Estado do tour ----------
  var ativo = false;
  var passoAtual = 0;
  var passos = [];
  var limpezas = [];   // funções para desligar listeners do passo atual
  var caixa, furo;

  function jaViu() {
    try { return localStorage.getItem(CHAVE) === 'ok'; } catch (e) { return false; }
  }
  function marcaVisto() {
    try { localStorage.setItem(CHAVE, 'ok'); } catch (e) {}
  }

  // ---------- Boas-vindas ----------
  // Jornada em 3 telas, com pouca escrita e uma cena animada em cada uma:
  //   1. o que é (um banner se montando)  2. como funciona (3 passos)  3. convite ao tutorial.
  // Movimento só com prefers-reduced-motion: no-preference (ver CSS).
  var BV_TEXTOS = [
    { t: 'Banners prontos para o app', p: 'Monte, ajuste e publique em minutos.' },
    { t: 'Três passos', p: 'Envie a imagem, escolha as opções e salve.' },
    { t: 'Vamos criar o primeiro?', p: 'Um tutorial rápido, de cerca de 2 minutos.' },
  ];

  function cenaBanner() {
    // O banner "se montando": fundo, montanhas, logo da AFFEMG e rodapé entram em sequência.
    return '<svg class="wel2__mock" viewBox="0 0 240 150" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fbdf2"/><stop offset="1" stop-color="#1d6fae"/></linearGradient>' +
        '<linearGradient id="wf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-opacity="0"/><stop offset="1" stop-opacity=".7"/></linearGradient>' +
        '<clipPath id="wc"><rect width="240" height="150" rx="10"/></clipPath>' +
      '</defs>' +
      '<g class="m-card"><g clip-path="url(#wc)">' +
        '<rect width="240" height="150" fill="url(#wg)"/>' +
        '<g class="m-mtn"><polygon points="0,150 0,96 46,60 82,88 126,48 176,92 240,70 240,150" fill="#0a3a66"/>' +
        '<polygon points="0,150 0,122 40,100 84,122 130,106 190,126 240,112 240,150" fill="#03172b"/></g>' +
        '<rect class="m-foot" y="92" width="240" height="58" fill="url(#wf)"/>' +
      '</g></g>' +
    '</svg>';
  }

  function cenaPassos() {
    function passo(icone, rotulo, n) {
      return '<div class="w-step w-step--' + n + '"><span class="w-step__ico"><span class="mi" aria-hidden="true">' + icone + '</span></span>' +
        '<span class="w-step__txt">' + rotulo + '</span></div>';
    }
    return '<div class="w-steps">' +
      '<span class="w-steps__line"><span class="w-steps__dot"></span></span>' +
      passo('add_photo_alternate', 'Imagem', 1) + passo('tune', 'Opções', 2) + passo('save', 'Salvar', 3) +
    '</div>';
  }

  function cenaPronto() {
    return '<div class="w-done"><span class="w-done__ring"></span><span class="w-done__ring w-done__ring--2"></span>' +
      '<span class="w-done__badge"><span class="mi" aria-hidden="true">check</span></span></div>';
  }

  function boasVindas() {
    var m = UI.modal(
      '<div class="wel2" aria-label="Boas-vindas">' +
        '<div class="wel2__art">' +
          '<div class="wel2__scene is-on" data-i="0">' + cenaBanner() + '</div>' +
          '<div class="wel2__scene" data-i="1">' + cenaPassos() + '</div>' +
          '<div class="wel2__scene" data-i="2">' + cenaPronto() + '</div>' +
        '</div>' +
        '<div class="wel2__body">' +
          '<div class="wel2__texts" aria-live="polite">' +
            BV_TEXTOS.map(function (x, i) {
              return '<div class="wel2__text' + (i === 0 ? ' is-on' : '') + '" data-i="' + i + '">' +
                '<h3 class="wel2__title">' + x.t + '</h3><p class="wel2__sub">' + x.p + '</p></div>';
            }).join('') +
          '</div>' +
          '<div class="wel2__dots" role="tablist" aria-label="Etapas">' +
            BV_TEXTOS.map(function (x, i) {
              return '<button type="button" class="wel2__dot' + (i === 0 ? ' is-on' : '') + '" data-go="' + i + '" role="tab" aria-label="Etapa ' + (i + 1) + ' de 3"></button>';
            }).join('') +
          '</div>' +
          '<div class="wel2__actions">' +
            '<button type="button" class="btn btn--ghost" id="welVoltar"></button>' +
            '<button type="button" class="btn btn--primary" id="welProx"></button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    m.box.classList.add('modal__box--wel2');

    var idx = 0, ultimo = BV_TEXTOS.length - 1;
    var voltar = m.box.querySelector('#welVoltar');
    var prox = m.box.querySelector('#welProx');

    function pular() {
      marcaVisto(); m.close();
      UI.toast('Para ver o tutorial depois, clique em “Como usar”.', 'info');
    }
    function iniciar() { marcaVisto(); m.close(); comeca(); }

    function vai(i) {
      idx = Math.max(0, Math.min(ultimo, i));
      m.box.querySelectorAll('.wel2__scene, .wel2__text, .wel2__dot').forEach(function (n) {
        var on = Number(n.getAttribute('data-i') != null ? n.getAttribute('data-i') : n.getAttribute('data-go')) === idx;
        n.classList.toggle('is-on', on);
        if (n.classList.contains('wel2__dot')) n.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (idx === 0) {
        voltar.innerHTML = 'Pular';
        prox.innerHTML = 'Continuar<span class="mi mi--fim" aria-hidden="true">arrow_forward</span>';
      } else if (idx < ultimo) {
        voltar.innerHTML = '<span class="mi" aria-hidden="true">arrow_back</span>Voltar';
        prox.innerHTML = 'Continuar<span class="mi mi--fim" aria-hidden="true">arrow_forward</span>';
      } else {
        voltar.innerHTML = 'Explorar sozinho';
        prox.innerHTML = '<span class="mi" aria-hidden="true">play_arrow</span>Fazer o tutorial';
      }
      prox.focus();
    }

    voltar.addEventListener('click', function () {
      if (idx === 0 || idx === ultimo) pular(); else vai(idx - 1);
    });
    prox.addEventListener('click', function () { if (idx === ultimo) iniciar(); else vai(idx + 1); });
    m.box.querySelectorAll('.wel2__dot').forEach(function (d) {
      d.addEventListener('click', function () { vai(Number(d.getAttribute('data-go'))); });
    });

    function teclas(e) {
      if (e.key === 'ArrowRight') { vai(idx + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { vai(idx - 1); e.preventDefault(); }
    }
    document.addEventListener('keydown', teclas);
    m.onClose(function () { document.removeEventListener('keydown', teclas); });

    vai(0);
  }

  // ---------- Elementos do destaque ----------
  function montaCena() {
    // Só o "furo": a sombra gigante dele já escurece o resto da tela.
    // Cliques passam por fora dele de propósito, para não travar a pessoa.
    furo = document.createElement('div');
    furo.className = 'tour__hole';

    caixa = document.createElement('div');
    caixa.className = 'tour__box';
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-live', 'polite');

    document.body.appendChild(furo);
    document.body.appendChild(caixa);
    document.body.classList.add('has-tour');
  }

  function desmontaCena() {
    [furo, caixa].forEach(function (n) { if (n && n.parentNode) n.remove(); });
    furo = caixa = null;
    document.body.classList.remove('has-tour');
  }

  // Posiciona o furo sobre o alvo e a caixa perto dele, virando de lado
  // quando não couber embaixo.
  //
  // Quando um modal abre no meio do passo (ex.: "Salvar no projeto"), o alvo
  // vira o próprio modal: o furo é desligado, porque o modal já escurece a
  // tela sozinho, e a caixa se encosta nele em vez de apontar para um botão
  // que ficou escondido atrás.
  function posiciona(alvo) {
    if (!furo || !caixa) return;

    var noModal = alvo.classList && alvo.classList.contains('modal__box');
    var pad = 8;
    var r = alvo.getBoundingClientRect();

    furo.hidden = noModal;
    if (!noModal) {
      furo.style.top = (r.top - pad) + 'px';
      furo.style.left = (r.left - pad) + 'px';
      furo.style.width = (r.width + pad * 2) + 'px';
      furo.style.height = (r.height + pad * 2) + 'px';
    }

    var cw = caixa.offsetWidth, ch = caixa.offsetHeight;
    var margem = 14;
    var top = r.bottom + margem;
    if (top + ch > window.innerHeight - 10) {
      top = r.top - ch - margem;               // não cabe embaixo: põe em cima
    }
    if (top < 10) {
      // Não coube nem em cima nem embaixo. Ao lado de um modal, encostar no
      // rodapé é melhor do que centralizar, que cairia por cima dele.
      top = noModal ? Math.max(10, window.innerHeight - ch - 10)
                    : Math.max(10, (window.innerHeight - ch) / 2);
    }

    var left = r.left + r.width / 2 - cw / 2;  // centralizado no alvo
    left = Math.max(10, Math.min(left, window.innerWidth - cw - 10));

    caixa.style.top = Math.round(top) + 'px';
    caixa.style.left = Math.round(left) + 'px';
  }

  // O alvo efetivo do destaque: se há um modal aberto, é ele.
  function alvoEfetivo(alvoDoPasso) {
    return document.querySelector('.modal__box') || alvoDoPasso;
  }

  // ---------- Execução dos passos ----------
  function limpaPasso() {
    limpezas.forEach(function (f) { try { f(); } catch (e) {} });
    limpezas = [];
  }

  // Espera um elemento aparecer no DOM (ex.: o modal de salvar depois do login).
  function esperaElemento(seletor, aoAparecer) {
    if ($(seletor)) return aoAparecer();
    var obs = new MutationObserver(function () {
      if ($(seletor)) { obs.disconnect(); aoAparecer(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    limpezas.push(function () { obs.disconnect(); });
  }

  function esperaEvento(alvo, evento, condicao, aoCumprir) {
    function h(e) {
      if (condicao && !condicao(e)) return;
      aoCumprir();
    }
    alvo.addEventListener(evento, h);
    limpezas.push(function () { alvo.removeEventListener(evento, h); });
  }

  function avanca() {
    limpaPasso();
    passoAtual++;
    if (passoAtual >= passos.length) return termina();
    mostra();
  }

  function voltar() {
    limpaPasso();
    if (passoAtual > 0) passoAtual--;
    mostra();
  }

  function mostra() {
    var passo = passos[passoAtual];
    if (!passo) return termina();

    // Passos podem ficar irrelevantes (ex.: já estava logado): pule-os.
    if (passo.pular && passo.pular()) return avanca();

    if (passo.aoEntrar) passo.aoEntrar();

    // Alguns passos precisam esperar a tela assentar (ex.: a galeria carregar).
    if (passo.atraso) {
      caixa.style.visibility = 'hidden';
      furo.hidden = true;
      setTimeout(function () {
        if (ativo && passos[passoAtual] === passo) desenha(passo);
      }, passo.atraso);
      return;
    }
    desenha(passo);
  }

  // Contagem "Passo n de N" só com os passos que valem agora (os pulados, como o
  // login para quem já entrou, não entram). O passo atual sempre conta.
  function contagem() {
    var vale = function (p) { return !(p.pular && p.pular()); };
    var total = passos.filter(vale).length;
    var pos = passos.slice(0, passoAtual).filter(vale).length + 1;
    return { pos: pos, total: Math.max(total, pos) };
  }

  function desenha(passo) {
    var resolve = function () { return typeof passo.alvo === 'function' ? passo.alvo() : $(passo.alvo); };
    var alvo = resolve();
    if (!alvo) {
      // Alvo sumiu (UI mudou): não trava o usuário, segue adiante.
      return avanca();
    }
    caixa.style.visibility = '';

    alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });

    var ultimo = passoAtual === passos.length - 1;
    caixa.innerHTML =
      '<div class="tour__top">' +
        '<span class="tour__count">Passo ' + contagem().pos + ' de ' + contagem().total + '</span>' +
        '<button type="button" class="tour__x" aria-label="Sair do tutorial" title="Sair do tutorial"><span class="mi" aria-hidden="true">close</span></button>' +
      '</div>' +
      '<h4 class="tour__title">' + passo.titulo + '</h4>' +
      '<p class="tour__text">' + passo.texto + '</p>' +
      (passo.acao ? '<div class="tour__acts">' + passo.acao + '</div>' : '') +
      (passo.espera ? '<p class="tour__wait">' + (passo.dica || 'Faça a ação acima para liberar o Continuar') + '</p>' : '') +
      '<div class="tour__foot">' +
        (passo.concluir
          ? '<button type="button" class="btn btn--ghost btn--sm tour__finish"><span class="mi" aria-hidden="true">check</span>Concluir</button>'
          : '<button type="button" class="btn btn--ghost btn--sm tour__cancel"><span class="mi" aria-hidden="true">close</span>Cancelar</button>') +
        '<button type="button" class="btn btn--primary btn--sm tour__next"' + (passo.espera ? ' disabled' : '') + '>' +
          (ultimo ? '<span class="mi" aria-hidden="true">check</span>Concluir'
                  : 'Continuar<span class="mi mi--fim" aria-hidden="true">arrow_forward</span>') + '</button>' +
      '</div>';

    caixa.querySelector('.tour__x').addEventListener('click', function () { termina(true); });
    var cancela = caixa.querySelector('.tour__cancel');
    if (cancela) cancela.addEventListener('click', function () { termina(true); });
    // Passo de decisão: "Concluir" encerra com o essencial aprendido; "Continuar" segue para o resto.
    var conclui = caixa.querySelector('.tour__finish');
    if (conclui) conclui.addEventListener('click', function () {
      termina(false);
      UI.toast('Tutorial concluído. Para rever, clique em “Como usar”.', 'ok');
    });

    // Só este botão avança. Sem a trava, um duplo clique pularia o passo seguinte.
    var avancou = false;
    var next = caixa.querySelector('.tour__next');
    next.addEventListener('click', function () {
      if (avancou || next.disabled) return;
      avancou = true;
      avanca();
    });

    // Passos que pedem uma ação liberam o Continuar quando ela acontece. Isso NÃO avança.
    function libera() {
      next.disabled = false;
      var w = caixa && caixa.querySelector('.tour__wait');
      if (w) w.hidden = true;
    }

    if (passo.ligar) passo.ligar(alvo, libera);

    // Reposiciona enquanto a página se mexe.
    var repos = function () { posiciona(alvoEfetivo(resolve() || alvo)); };
    setTimeout(repos, 120);   // depois do scroll suave
    setTimeout(repos, 900);   // depois de conteúdo assíncrono (ex.: galeria)
    repos();
    window.addEventListener('resize', repos);
    window.addEventListener('scroll', repos, true);

    // Modais entram e saem do DOM: quando isso acontece, o destaque muda de alvo.
    var obs = new MutationObserver(function () { repos(); });
    obs.observe(document.body, { childList: true });

    limpezas.push(function () {
      window.removeEventListener('resize', repos);
      window.removeEventListener('scroll', repos, true);
      obs.disconnect();
      if (furo) furo.hidden = false;
    });
  }

  function termina(saiuNoMeio) {
    limpaPasso();
    desmontaCena();
    ativo = false;
    marcaVisto();
    if (saiuNoMeio) UI.toast('Tutorial encerrado. Para rever, clique em “Como usar”.', 'info');
  }

  function comeca() {
    if (ativo) return;
    ativo = true;
    // Nenhum modal pode ficar aberto por trás do tutorial.
    document.querySelectorAll('.modal').forEach(function (m) { m.remove(); });
    document.body.classList.remove('has-modal');
    passoAtual = 0;
    passos = montaPassos();
    if (window.AffemgTabs) AffemgTabs.activate('criar');
    montaCena();
    mostra();
  }

  // ---------- Os passos ----------
  // Propriedades de um passo: alvo (seletor ou função), titulo, texto, acao (HTML extra),
  // espera (Continuar desligado até libera()), dica, ligar(alvo, libera), aoEntrar, atraso, pular.
  function montaPassos() {
    var variante = nomeDe('VARIANTES', EXEMPLO.variante);
    var elemento = nomeDe('ELEMENTOS', EXEMPLO.elemento);
    var temBackend = BK && BK.isEnabled();

    var lista = [
      {
        alvo: '#dropzone',
        titulo: 'Imagem de fundo',
        texto: 'Todo banner parte de uma foto. Vamos criar um banner para <strong>' + EXEMPLO.categoria + '</strong>. ' +
               'Use a foto de exemplo ou envie a sua.',
        acao: '<button type="button" class="btn btn--ghost btn--sm" id="tourImg"><span class="mi" aria-hidden="true">add_photo_alternate</span>Usar a foto de exemplo</button>',
        espera: true,
        dica: 'Escolha uma imagem para continuar',
        ligar: function (alvo, libera) {
          var b = caixa.querySelector('#tourImg');
          if (window.AffemgCreator && AffemgCreator.hasImage && AffemgCreator.hasImage()) libera();
          b.addEventListener('click', function () {
            b.disabled = true; b.textContent = 'Carregando…';
            AffemgCreator.usarImagem(EXEMPLO.imagem)
              .then(function () { b.textContent = 'Foto aplicada'; libera(); })
              .catch(function (err) {
                b.disabled = false; b.textContent = 'Tentar de novo';
                UI.toast(err.message + ' Você pode enviar uma imagem sua e seguir.', 'erro');
              });
          });
          // Se a pessoa preferir enviar a própria imagem, também vale.
          esperaEvento(document, 'affemg:banner', function (e) { return e.detail.temImagem; }, libera);
        },
      },
      {
        alvo: '#variantes',
        titulo: 'Modelo de fundo',
        texto: '<strong>Imagem</strong> mostra só a foto. <strong>Imagem + textura</strong> acrescenta a textura da marca. ' +
               'No exemplo, use <strong>' + variante + '</strong>.',
      },
      {
        alvo: '#elementos',
        titulo: 'Elemento de marca',
        texto: 'A logo (ou a marca Vila Mares) que aparece sobre a foto. ' +
               'No exemplo, use <strong>' + elemento + '</strong>.',
      },
      {
        alvo: '#acabamento',
        titulo: 'Acabamento',
        texto: '<strong>Escurecer imagem</strong> melhora a leitura em fotos claras. ' +
               '<strong>Efeito no rodapé</strong> desfoca a parte de baixo. ' +
               'No exemplo, deixe as duas ligadas.',
      },
      {
        alvo: '#preview',
        titulo: 'Prévia',
        texto: 'Mostra o banner em tempo real, no tamanho exato do app (1024×640).',
      },
      {
        alvo: '#btnDownload',
        titulo: 'Salvar imagem',
        texto: 'Gera o arquivo WebP e salva no seu computador, sem enviar ao projeto.',
      },
    ];

    // O resto do fluxo só existe com o backend ligado.
    if (temBackend) {
      var semLogin = function () { return !BK.getUser(); };
      var comLogin = function () { return !!BK.getUser(); };

      // Ponto de decisão: o essencial (criar e salvar a imagem) acabou aqui.
      lista.push({
        alvo: '#btnSave',
        titulo: 'O essencial está pronto',
        texto: 'Você já sabe montar o banner e salvar a imagem. ' +
               'Quer ver também como publicá-lo para a equipe?',
        concluir: true,
      });

      // --- Quem ainda não entrou: como funciona o acesso, em etapas ---
      lista.push({
        alvo: '#btnSave',
        titulo: 'Salvar no projeto exige acesso',
        texto: 'Salvar no projeto publica o banner para toda a equipe e registra quem o criou, ' +
               'para que você só remova os seus. Por isso é preciso ter uma conta.',
        pular: comLogin,
      });
      lista.push({
        alvo: '#authWidget',
        titulo: 'Como pedir acesso',
        texto: '<ol class="tour__steps">' +
                 '<li>Peça acesso com seu nome e e-mail.</li>' +
                 '<li>Um administrador aprova o pedido.</li>' +
                 '<li>Você recebe um e-mail para criar a senha.</li>' +
               '</ol>',
        acao: '<button type="button" class="btn btn--ghost btn--sm" id="tourPedir">' +
                '<span class="mi" aria-hidden="true">person_add</span>Solicitar acesso</button>',
        pular: comLogin,
        ligar: function () {
          caixa.querySelector('#tourPedir').addEventListener('click', function () {
            UI.openSolicitarAcesso();
          });
        },
      });
      lista.push({
        alvo: '#authWidget',
        titulo: 'Já tem acesso?',
        texto: 'Entre com e-mail e senha. Se esquecer a senha, use <strong>Esqueci minha senha</strong> ' +
               'na tela de entrada. Depois de entrar, o tutorial continua.',
        acao: '<button type="button" class="btn btn--ghost btn--sm" id="tourEntrar">' +
                '<span class="mi" aria-hidden="true">login</span>Entrar</button>',
        pular: comLogin,
        ligar: function () {
          caixa.querySelector('#tourEntrar').addEventListener('click', function () {
            UI.openLogin();
          });
          // Entrou durante este passo: avisa e segue com o Continuar (que não é automático).
          var sair = BK.onAuth(function (user) {
            if (!user || !caixa) return;
            var t = caixa.querySelector('.tour__text');
            if (t) t.innerHTML = 'Você entrou. Clique em <strong>Continuar</strong> para salvar o banner.';
            var acts = caixa.querySelector('.tour__acts');
            if (acts) acts.hidden = true;
          });
          limpezas.push(sair);
        },
      });

      // --- Salvar no projeto (com acesso) ---
      lista.push({
        alvo: '#btnSave',
        titulo: 'Salvar no projeto',
        texto: 'Publica o banner para toda a equipe. Clique em <strong>Salvar no projeto</strong>.',
        espera: true,
        dica: 'Abra o formulário de salvar para continuar',
        pular: semLogin,
        ligar: function (alvo, libera) {
          // Libera quando o formulário de salvar estiver na tela.
          esperaElemento('#sNome', libera);
        },
      });

      lista.push({
        alvo: function () { return $('#sGrupo') || $('.modal__box') || $('#btnSave'); },
        titulo: 'Nome e categoria',
        texto: 'Dê um <strong>nome</strong> descritivo e escolha a categoria <strong>' + EXEMPLO.categoria +
               '</strong>. Depois clique em <strong>Salvar</strong>.',
        espera: true,
        dica: 'Salve o banner para continuar',
        pular: semLogin,
        ligar: function (alvo, libera) {
          var resolvido = false;
          var antes = null;
          BK.listBanners().then(function (bs) { antes = bs.length; }).catch(function () {});

          // Libera quando o banner realmente entra na lista.
          var iv = setInterval(function () {
            if (antes === null || resolvido) return;
            BK.listBanners().then(function (bs) {
              if (bs.length > antes) { resolvido = true; clearInterval(iv); libera(); }
            }).catch(function () {});
          }, 2000);

          // Se a pessoa fechar o formulário de salvar sem concluir, o tutorial
          // volta ao passo anterior (clicar em "Salvar no projeto"), em vez de
          // ficar preso esperando uma ação que não vai acontecer.
          var tinhaForm = !!$('#sNome');
          var obs = new MutationObserver(function () {
            if (resolvido) return;
            var temForm = !!$('#sNome');
            if (tinhaForm && !temForm) {
              // Fechou. Confirma que não foi salvamento antes de recuar.
              setTimeout(function () {
                if (resolvido) return;
                BK.listBanners().then(function (bs) {
                  if (antes !== null && bs.length > antes) {
                    resolvido = true; clearInterval(iv); libera();
                  } else {
                    resolvido = true; clearInterval(iv); obs.disconnect(); voltar();
                  }
                }).catch(function () {
                  resolvido = true; clearInterval(iv); obs.disconnect(); voltar();
                });
              }, 400);
            }
            tinhaForm = temForm;
          });
          obs.observe(document.body, { childList: true });
          limpezas.push(function () { clearInterval(iv); obs.disconnect(); });
        },
      });

      lista.push({
        alvo: '#tabSalvos',
        titulo: 'Banner salvo',
        texto: 'Ele já está publicado. Ao continuar, abrimos <strong>Banners salvos</strong>, ' +
               'na categoria <strong>' + EXEMPLO.categoria + '</strong>.',
        pular: semLogin,
      });
      lista.push({
        alvo: function () { return $('#salvos .gcard') || $('#salvos') || $('#salvosMsg'); },
        titulo: 'Baixar e ampliar',
        texto: 'Use <strong>Baixar</strong> em cada banner e clique na imagem para ampliar. ' +
               'A estrela marca a opção recomendada. Você remove só os seus.',
        aoEntrar: function () { if (window.AffemgTabs) AffemgTabs.activate('salvos'); },
        atraso: 700,
        pular: semLogin,
      });
      lista.push({
        alvo: function () { return $('#salvos .setcard') || $('#salvos') || $('#salvosMsg'); },
        titulo: 'Conjuntos',
        texto: '<strong>Recomendados</strong> reúne a melhor opção de cada categoria num único .zip.',
        pular: semLogin,
      });
    }

    lista.push({
      alvo: '#btnTutorial',
      titulo: 'Pronto',
      texto: 'Você já sabe criar, salvar e baixar. Para rever o tutorial, clique em <strong>Como usar</strong>.',
    });

    return lista;
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('#btnTutorial');
    if (btn) btn.addEventListener('click', function () { comeca(); });

    // Primeiro acesso: espera um pouco para a tela assentar.
    // Em desenvolvimento (localhost) as boas-vindas abrem sempre, para testar; em produção só no primeiro acesso.
    var dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (dev || !jaViu()) setTimeout(boasVindas, 700);
  });

  window.AffemgTutorial = { comeca: comeca, boasVindas: boasVindas };
})();
