/* onboarding.js: boas-vindas no primeiro acesso + tutorial guiado.

   O tutorial é interativo: cada passo destaca um elemento e só avança quando a
   pessoa realmente faz aquilo. No fim ela tem um banner salvo de verdade.

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
  function boasVindas() {
    var m = UI.modal(
      '<div class="wel">' +
        '<img class="wel__logo" src="assets/app-icon.svg" alt="" width="46" height="46">' +
        '<h3 class="wel__title">Bem-vindo aos Banners AFFEMG</h3>' +
        '<p class="wel__text">Esta ferramenta monta banners no formato certo do aplicativo da AFFEMG, ' +
          'já prontos para publicar. Você envia uma imagem de fundo, escolhe o modelo e baixa o arquivo.</p>' +
        '<ul class="wel__list">' +
          '<li><strong>Criar banner:</strong> monte o seu e baixe em WebP.</li>' +
          '<li><strong>Banners salvos:</strong> tudo que a equipe já publicou, por categoria, com download em lote.</li>' +
        '</ul>' +
        '<p class="wel__text wel__text--sm">O tutorial leva cerca de dois minutos e termina com um banner salvo de verdade.</p>' +
      '</div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" id="welPular">Agora não</button>' +
        '<button class="btn btn--primary" id="welIr">Fazer o tutorial</button>' +
      '</div>'
    );
    m.box.classList.add('modal__box--wel');
    m.box.querySelector('#welPular').addEventListener('click', function () {
      marcaVisto(); m.close();
      UI.toast('Quando quiser, clique em “Como usar” no topo.', 'info');
    });
    m.box.querySelector('#welIr').addEventListener('click', function () {
      marcaVisto(); m.close(); comeca();
    });
    m.box.querySelector('#welIr').focus();
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

    var alvo = typeof passo.alvo === 'function' ? passo.alvo() : $(passo.alvo);
    if (!alvo) {
      // Alvo sumiu (UI mudou): não trava o usuário, segue adiante.
      return avanca();
    }

    if (passo.aoEntrar) passo.aoEntrar();

    alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });

    caixa.innerHTML =
      '<div class="tour__top">' +
        '<span class="tour__count">Passo ' + (passoAtual + 1) + ' de ' + passos.length + '</span>' +
        '<button type="button" class="tour__x" aria-label="Sair do tutorial">&times;</button>' +
      '</div>' +
      '<h4 class="tour__title">' + passo.titulo + '</h4>' +
      '<p class="tour__text">' + passo.texto + '</p>' +
      (passo.acao ? '<div class="tour__acts">' + passo.acao + '</div>' : '') +
      '<div class="tour__foot">' +
        (passo.espera
          ? '<span class="tour__wait">Faça a ação acima para continuar</span>'
          : '<button type="button" class="btn btn--primary btn--sm tour__next">' +
            (passoAtual === passos.length - 1 ? 'Concluir' : 'Avançar') + '</button>') +
      '</div>';

    caixa.querySelector('.tour__x').addEventListener('click', function () { termina(true); });

    // Um passo pode ter mais de um jeito de ser cumprido (o botão do tutorial e
    // a ação manual, por exemplo). Sem esta trava, os dois disparam e o passo
    // seguinte é pulado.
    var avancou = false;
    function feito() {
      if (avancou) return;
      avancou = true;
      avanca();
    }

    var next = caixa.querySelector('.tour__next');
    if (next) next.addEventListener('click', feito);

    if (passo.ligar) passo.ligar(alvo, feito);

    // Reposiciona enquanto a página se mexe.
    var repos = function () { posiciona(alvoEfetivo(alvo)); };
    setTimeout(repos, 120);   // depois do scroll suave
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
    if (saiuNoMeio) UI.toast('Tutorial encerrado. Ele fica em “Como usar”.', 'info');
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
  function montaPassos() {
    var variante = nomeDe('VARIANTES', EXEMPLO.variante);
    var elemento = nomeDe('ELEMENTOS', EXEMPLO.elemento);
    var temBackend = BK && BK.isEnabled();

    var lista = [
      {
        alvo: '#dropzone',
        titulo: 'Comece pela imagem de fundo',
        texto: 'Todo banner parte de uma foto. Vamos criar juntos um banner novo para a categoria ' +
               '<strong>' + EXEMPLO.categoria + '</strong>, no mesmo estilo dos que já estão em Banners salvos. ' +
               'Use a foto de exemplo para acompanhar.',
        acao: '<button type="button" class="btn btn--primary btn--sm" id="tourImg">Usar a foto de exemplo</button>',
        espera: true,
        ligar: function (alvo, feito) {
          var b = caixa.querySelector('#tourImg');
          b.addEventListener('click', function () {
            b.disabled = true; b.textContent = 'Carregando…';
            AffemgCreator.usarImagem(EXEMPLO.imagem)
              .then(feito)
              .catch(function (err) {
                b.disabled = false; b.textContent = 'Tentar de novo';
                UI.toast(err.message + ' Você pode enviar uma imagem sua e seguir.', 'erro');
              });
          });
          // Se a pessoa preferir enviar a própria imagem, também vale.
          esperaEvento(document, 'affemg:banner', function (e) { return e.detail.temImagem; }, feito);
        },
      },
      {
        alvo: '#variantes',
        titulo: 'Escolha o modelo de fundo',
        texto: 'São dois: um mostra só a foto, o outro acrescenta uma textura por cima. ' +
               'Para o nosso exemplo, selecione <strong>' + variante + '</strong>.',
        espera: true,
        ligar: function (alvo, feito) {
          esperaEvento(document, 'affemg:banner',
            function (e) { return e.detail.variante === EXEMPLO.variante; }, feito);
        },
      },
      {
        alvo: '#elementos',
        titulo: 'Escolha o elemento de marca',
        texto: 'É a logo que aparece sobre a foto, em posições diferentes, ou a marca Vila Mares. ' +
               'Selecione <strong>' + elemento + '</strong>.',
        espera: true,
        ligar: function (alvo, feito) {
          esperaEvento(document, 'affemg:banner',
            function (e) { return e.detail.elemento === EXEMPLO.elemento; }, feito);
        },
      },
      {
        alvo: '#tglEscurecer',
        titulo: 'Ajuste o acabamento',
        texto: 'Escurecer ajuda quando a foto é clara demais e atrapalha a leitura. ' +
               'O nosso exemplo usa esta opção <strong>ligada</strong>.',
        espera: true,
        ligar: function (alvo, feito) {
          esperaEvento(document, 'affemg:banner',
            function (e) { return e.detail.escurecer === EXEMPLO.escurecer; }, feito);
        },
      },
      {
        alvo: '#preview',
        titulo: 'Confira o resultado',
        texto: 'A prévia acompanha cada mudança em tempo real, no tamanho exato do app ' +
               '(1024 por 640). É assim que ele vai aparecer para o associado.',
      },
      {
        alvo: '#btnDownload',
        titulo: 'Baixar direto',
        texto: 'Este botão gera o arquivo WebP e baixa no seu computador, sem salvar nada. ' +
               'Use quando o banner for de uso único.',
      },
    ];

    // O resto do fluxo só existe com o backend ligado.
    if (temBackend) {
      // Quem ainda não entrou precisa entender o login ANTES de ele aparecer,
      // senão a tela de senha surge do nada no meio do tutorial.
      if (!BK.getUser()) {
        lista.push({
          alvo: '#authWidget',
          titulo: 'Por que existe login',
          texto: 'Baixar um banner não exige conta. Já <strong>salvar</strong> sim, por dois motivos: ' +
                 'a ferramenta registra quem criou cada banner, e assim você pode remover os seus ' +
                 'sem correr o risco de apagar o de outra pessoa. ' +
                 'No próximo passo ele vai pedir seu e-mail e senha. É esperado.',
        });
      }

      lista.push({
        alvo: '#btnSave',
        titulo: 'Salvar para a equipe',
        texto: 'Salvar publica o banner numa categoria, e a partir daí ele fica disponível para todo mundo. ' +
               'Clique em <strong>Salvar no projeto</strong>' +
               (BK.getUser() ? '.' : ' e faça o login quando ele pedir.'),
        espera: true,
        ligar: function (alvo, feito) {
          // Avança só quando o formulário de salvar estiver na tela. Se houver
          // login pelo caminho, ele aparece antes e este passo continua esperando.
          esperaElemento('#sNome', function () { setTimeout(feito, 250); });
        },
      });

      lista.push({
        alvo: function () { return $('#sGrupo') || $('.modal__box') || $('#btnSave'); },
        titulo: 'Nome e categoria',
        texto: 'O <strong>nome</strong> é como o banner aparece na lista, então vale ser descritivo. ' +
               'A <strong>categoria</strong> é o assunto: escolha <strong>' + EXEMPLO.categoria +
               '</strong>, que já existe, em vez de criar uma nova. ' +
               'Depois clique em <strong>Salvar</strong>.',
        espera: true,
        ligar: function (alvo, feito) {
          var resolvido = false;
          var antes = null;
          BK.listBanners().then(function (bs) { antes = bs.length; }).catch(function () {});

          // Avança quando o banner realmente entra na lista.
          var iv = setInterval(function () {
            if (antes === null || resolvido) return;
            BK.listBanners().then(function (bs) {
              if (bs.length > antes) { resolvido = true; clearInterval(iv); feito(); }
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
                    resolvido = true; clearInterval(iv); feito();
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
        titulo: 'Salvo. Agora veja onde ele foi parar',
        texto: 'Seu banner já está publicado. Clique em <strong>Banners salvos</strong> ' +
               'para encontrá-lo dentro da categoria <strong>' + EXEMPLO.categoria + '</strong>, ' +
               'junto com tudo que a equipe já publicou.',
        espera: true,
        ligar: function (alvo, feito) {
          esperaEvento(alvo, 'click', null, function () { setTimeout(feito, 600); });
        },
      });
      lista.push({
        alvo: function () { return $('#salvos .gcard') || $('#salvos') || $('#salvosMsg'); },
        titulo: 'Baixe quando precisar',
        texto: 'Cada banner tem <strong>Baixar</strong>, e clicando na imagem você amplia. ' +
               'A estrela marca a opção recomendada de cada categoria. ' +
               'Você remove os banners que criou; o administrador gerencia todos.',
      });
      lista.push({
        alvo: function () { return $('#salvos .setcard') || $('#salvos') || $('#salvosMsg'); },
        titulo: 'Conjuntos em um clique',
        texto: 'O conjunto <strong>Recomendados</strong> junta a melhor opção de cada categoria ' +
               'num único arquivo .zip. É o caminho mais rápido quando você precisa de tudo.',
      });
    }

    lista.push({
      alvo: '#btnTutorial',
      titulo: 'É isso',
      texto: 'Você já sabe criar, salvar e baixar. Este botão fica sempre neste canto: ' +
             'clique em <strong>Como usar</strong> quando quiser rever o tutorial.',
    });

    return lista;
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('#btnTutorial');
    if (btn) btn.addEventListener('click', function () { comeca(); });

    // Primeiro acesso: espera um pouco para a tela assentar.
    if (!jaViu()) setTimeout(boasVindas, 700);
  });

  window.AffemgTutorial = { comeca: comeca, boasVindas: boasVindas };
})();
