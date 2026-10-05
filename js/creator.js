/* creator.js — UI do criador de banners + navegação por abas. */
(function () {
  'use strict';

  var B = window.AffemgBanner;

  // Estado atual do banner.
  var state = {
    variante: '01',
    elemento: 'padrao',
    imageHref: '',
    escurecer: false,
    footer: true,
  };

  var $ = function (sel) { return document.querySelector(sel); };

  // Avisos em modal (mesmo visual do resto). O alert() fica só como rede de
  // segurança, caso o backend-ui não tenha carregado.
  function aviso(titulo, texto) {
    if (window.AffemgUI && AffemgUI.toast) return AffemgUI.toast(titulo + ': ' + texto, 'erro');
    alert(titulo + ': ' + texto);
  }

  // ---------- Abas ----------
  var TABS = ['criar', 'salvos', 'usuarios'];

  function activateTab(name) {
    if (TABS.indexOf(name) < 0) name = 'criar';
    // Abas ocultas (ex.: "Usuários" para quem não é admin) não podem ser abertas
    // nem por link direto no hash.
    var btn = document.querySelector('.tab[data-tab="' + name + '"]');
    if (btn && btn.hidden) name = 'criar';
    document.querySelectorAll('.tab').forEach(function (t) {
      var active = t.dataset.tab === name;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    TABS.forEach(function (n) {
      var panel = document.getElementById('panel-' + n);
      if (!panel) return;
      var on = n === name;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
    if (name === 'salvos' && window.AffemgSalvos) window.AffemgSalvos.refresh();
    if (name === 'usuarios' && window.AffemgUsuarios) window.AffemgUsuarios.refresh();
  }

  // Exposto para o admin-ui tirar o usuário da aba "Usuários" ao deslogar.
  window.AffemgTabs = { activate: activateTab };

  function irPara(nome) {
    if (history.replaceState) history.replaceState(null, '', '#' + nome);
    activateTab(nome);
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { irPara(tab.dataset.tab); });
    });

    // A marca no topo funciona como atalho para o criador.
    var home = $('#btnHome');
    if (home) home.addEventListener('click', function () {
      irPara('criar');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    activateTab((location.hash || '').replace('#', ''));
  }

  // ---------- Cartões de escolha ----------
  // Cada opção é um cartão com miniatura quadrada (40px) + nome + frase de apoio, sem o círculo do radio.
  // Miniaturas do "Modelo de fundo" e do "Acabamento": cena genérica (não é a imagem do usuário).
  // As do "Elemento de marca" são o próprio compositor (buildSVG) sobre um céu de exemplo, recortadas
  // em quadrado, então mostram exatamente o que cada opção desenha. Vão em <img> para os ids do SVG
  // não colidirem com os do preview.
  var CENA =
    '<rect width="80" height="80" fill="url(#GRAD)"/>' +
    '<polygon points="0,80 0,50 20,32 34,46 52,26 80,52 80,80" fill="#0a3a66"/>' +
    '<polygon points="0,80 0,64 16,52 32,64 50,56 80,66 80,80" fill="#03172b"/>';
  function cena(id, defsExtra, overlay) {
    var g = 'il' + id;
    return '<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#6fbdf2"/><stop offset="1" stop-color="#1d6fae"/></linearGradient>' +
        (defsExtra || '').replace(/ID/g, g) +
      '</defs>' + CENA.replace('GRAD', g) + (overlay || '').replace(/ID/g, g) + '</svg>';
  }
  function ilustraVariante(id) {
    var textura = id === '02';
    return cena(id,
      textura ? '<pattern id="IDt" width="20" height="20" patternUnits="userSpaceOnUse">' +
        '<path d="M10 0L20 10L10 20L0 10Z" fill="none" stroke="#fff" stroke-width="3.5" opacity=".85"/></pattern>' : '',
      textura ? '<rect width="80" height="80" fill="url(#IDt)"/>' : '');
  }
  function ilustraAcabamento(id) {
    if (id === 'escurecer') return cena('esc', '', '<rect width="80" height="80" fill="#000" opacity=".45"/>');
    return cena('rod',
      '<linearGradient id="IDf" x1="0" y1="0" x2="0" y2="1"><stop offset=".4" stop-opacity="0"/><stop offset="1" stop-opacity=".9"/></linearGradient>',
      '<rect width="80" height="80" fill="url(#IDf)"/>');
  }
  var CEU = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640"><defs>' +
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fbdf2"/>' +
    '<stop offset="1" stop-color="#1d6fae"/></linearGradient></defs><rect width="1024" height="640" fill="url(#g)"/></svg>');
  // Início (x) do recorte quadrado de 640px, de modo que o elemento caiba na miniatura.
  var RECORTE = { padrao: 192, cima: 255, direita: 384, vertical: 192, vilamares: 192 };
  function ilustraElemento(id) {
    var svg = B.buildSVG({ variante: '01', elemento: id, imageHref: CEU, footer: false })
      .replace('width="1024" height="640" viewBox="0 0 1024 640"',
               'width="80" height="80" viewBox="' + (RECORTE[id] || 192) + ' 0 640 640"');
    return '<img alt="" width="40" height="40" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '">';
  }
  var DESCRICOES = {
    '01': 'Exibir apenas a imagem de fundo',
    '02': 'Aplicar uma textura sobreposta',
    padrao: 'Apenas a imagem, sem logo ou marca',
    cima: 'Logo AFFEMG centralizada no topo',
    direita: 'Logo AFFEMG no canto direito',
    vertical: 'Logo AFFEMG em composição vertical',
    vilamares: 'Marca Vila Mares, com sol e onda',
    escurecer: 'Camada escura para destacar o conteúdo',
    footer: 'Desfoque na parte de baixo',
  };

  function cartaoTexto(nome, desc) {
    return '<span class="choice__txt"><strong>' + nome + '</strong><span class="choice__desc">' + desc + '</span></span>';
  }

  // ilus: função id -> HTML da miniatura.
  function buildChoices(containerId, items, key, ilus) {
    var box = document.getElementById(containerId);
    box.innerHTML = '';
    items.forEach(function (item) {
      var label = document.createElement('label');
      label.className = 'choice choice--ilus' + (state[key] === item.id ? ' is-sel' : '');
      label.innerHTML =
        '<input type="radio" name="' + key + '" value="' + item.id + '"' +
        (state[key] === item.id ? ' checked' : '') + '>' +
        '<span class="choice__thumb">' + ilus(item.id) + '</span>' +
        cartaoTexto(item.nome, DESCRICOES[item.id] || '');
      label.querySelector('input').addEventListener('change', function () {
        state[key] = item.id;
        box.querySelectorAll('.choice').forEach(function (c) { c.classList.remove('is-sel'); });
        label.classList.add('is-sel');
        render();
        anunciaMudanca();
      });
      box.appendChild(label);
    });
  }

  // Cartões do "Acabamento" (checkboxes): miniatura + marca de selecionado, como os radios.
  function ligaAcabamento() {
    [['cardEscurecer', 'escurecer'], ['cardFooter', 'footer']].forEach(function (par) {
      var card = document.getElementById(par[0]);
      card.querySelector('.choice__thumb').innerHTML = ilustraAcabamento(par[1]);
      var input = card.querySelector('input');
      var sync = function () { card.classList.toggle('is-sel', input.checked); };
      input.addEventListener('change', sync);
      sync();
    });
  }

  // ---------- Upload de imagem ----------
  function initUpload() {
    var dz = $('#dropzone');
    var input = $('#fileInput');
    var text = $('#dropzoneText');
    var preview = $('#preview');

    function setLoading(on) {
      preview.classList.toggle('is-loading', on);
      dz.classList.toggle('is-loading', on);
    }

    // Nome do arquivo escapado, cortado com reticências (o campo não cresce) e completo no tooltip.
    function nomeArquivo(nome) {
      var n = String(nome).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return '<u class="dropzone__file" title="' + n + '">' + n + '</u>';
    }

    function handleFile(file) {
      if (!file || !/^image\//.test(file.type)) {
        aviso('Arquivo inválido', 'Selecione um arquivo de imagem (JPG ou PNG).');
        return;
      }
      setLoading(true);
      text.innerHTML = 'Carregando ' + nomeArquivo(file.name) + '…';
      var reader = new FileReader();
      reader.onload = function (e) {
        var dataURI = e.target.result; // data: URI
        // Espera a imagem decodificar antes de renderizar, para o preview
        // não aparecer em branco/estático até a imagem carregar.
        var img = new Image();
        img.onload = function () {
          state.imageHref = dataURI;
          dz.classList.add('has-file');
          dz.querySelector('.dropzone__icon .mi').textContent = 'check';
          text.innerHTML = 'Imagem carregada: ' + nomeArquivo(file.name) + ', <span class="dropzone__nw">clique para trocar</span>';
          render();
          setLoading(false);
          anunciaMudanca();
        };
        img.onerror = function () {
          setLoading(false);
          text.innerHTML = 'Arraste uma imagem aqui ou <u>clique para escolher</u>';
          aviso('Não foi possível abrir a imagem', 'Tente outro arquivo (JPG ou PNG).');
        };
        img.src = dataURI;
      };
      reader.onerror = function () {
        setLoading(false);
        text.innerHTML = 'Arraste uma imagem aqui ou <u>clique para escolher</u>';
        aviso('Falha ao ler o arquivo', 'Tente novamente ou escolha outro arquivo.');
      };
      reader.readAsDataURL(file);
    }

    input.addEventListener('change', function () { handleFile(input.files[0]); });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-drag'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-drag'); });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
  }

  // ---------- Toggles ----------
  function initToggles() {
    $('#tglEscurecer').addEventListener('change', function () { state.escurecer = this.checked; render(); anunciaMudanca(); });
    $('#tglFooter').addEventListener('change', function () { state.footer = this.checked; render(); anunciaMudanca(); });
  }

  // ---------- Render + Download ----------
  function render() {
    $('#preview').innerHTML = B.buildSVG(state);
    // O guia some com a imagem ou quando há um elemento de marca escolhido; "Sem elemento" sem imagem o traz de volta.
    $('#previewEmpty').hidden = !!state.imageHref || state.elemento !== 'padrao';
    $('#btnDownload').disabled = !state.imageHref;
  }

  function download() {
    if (!state.imageHref) return;
    var btn = $('#btnDownload');
    var svg = B.buildSVG(state);
    btn.disabled = true;
    var label = btn.innerHTML;
    btn.textContent = 'Gerando…';
    var load = window.AffemgUI && AffemgUI.carregando
      ? AffemgUI.carregando('Gerando o WebP…') : { fecha: function () {} };
    window.AffemgWebp.render(svg, { quality: 0.92 })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'affemg-banner-' + state.variante + '-' + state.elemento + '.webp';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        if (window.AffemgUI) AffemgUI.toast('Banner gerado. O download já começou.', 'ok');
      })
      .catch(function (err) { aviso('Não foi possível gerar o WebP', err.message); })
      .then(function () { load.fecha(); btn.innerHTML = label; btn.disabled = !state.imageHref; });
  }

  // Avisa quem estiver ouvindo (hoje, o tutorial) que o banner mudou.
  function anunciaMudanca() {
    document.dispatchEvent(new CustomEvent('affemg:banner', { detail: copiaEstado() }));
  }
  function copiaEstado() {
    return {
      variante: state.variante, elemento: state.elemento,
      escurecer: state.escurecer, footer: state.footer,
      temImagem: !!state.imageHref,
    };
  }

  // Exposto para o backend-ui (botão Salvar) usar o estado atual do banner.
  window.AffemgCreator = {
    currentSVG: function () { return B.buildSVG(state); },
    hasImage: function () { return !!state.imageHref; },
    estado: copiaEstado,

    // Carrega uma imagem por URL (usado pelo tutorial, com a foto de exemplo).
    usarImagem: function (url) {
      return fetch(url)
        .then(function (r) {
          if (!r.ok) throw new Error('Não foi possível carregar a imagem de exemplo.');
          return r.blob();
        })
        .then(function (blob) {
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (e) { resolve(e.target.result); };
            reader.onerror = function () { reject(new Error('Falha ao ler a imagem.')); };
            reader.readAsDataURL(blob);
          });
        })
        .then(function (dataURI) {
          return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
              state.imageHref = dataURI;
              $('#dropzone').classList.add('has-file');
              $('#dropzone .dropzone__icon .mi').textContent = 'check';
              $('#dropzoneText').innerHTML = 'Imagem de exemplo carregada';
              render();
              anunciaMudanca();
              resolve();
            };
            img.onerror = function () { reject(new Error('Imagem de exemplo inválida.')); };
            img.src = dataURI;
          });
        });
    },
    suggestName: function () {
      var el = (B.ELEMENTOS.filter(function (e) { return e.id === state.elemento; })[0] || {}).nome || '';
      return 'Banner ' + el;
    },
  };

  // Volta modelo, elemento e acabamento ao padrão. A imagem enviada é mantida.
  function restaurar() {
    state.variante = '01';
    state.elemento = 'padrao';
    state.escurecer = false;
    state.footer = true;
    buildChoices('variantes', B.VARIANTES, 'variante', ilustraVariante);
    buildChoices('elementos', B.ELEMENTOS, 'elemento', ilustraElemento);
    [['tglEscurecer', 'cardEscurecer', state.escurecer], ['tglFooter', 'cardFooter', state.footer]].forEach(function (c) {
      $('#' + c[0]).checked = c[2];
      $('#' + c[1]).classList.toggle('is-sel', c[2]);
    });
    render();
    anunciaMudanca();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    $('#btnReset').addEventListener('click', restaurar);
    buildChoices('variantes', B.VARIANTES, 'variante', ilustraVariante);
    buildChoices('elementos', B.ELEMENTOS, 'elemento', ilustraElemento);
    ligaAcabamento();
    initUpload();
    initToggles();
    $('#btnDownload').addEventListener('click', download);
    $('#btnPickImage').addEventListener('click', function () { $('#fileInput').click(); });
    render();
  });
})();
