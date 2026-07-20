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
  function buildChoices(containerId, items, key) {
    var box = document.getElementById(containerId);
    box.innerHTML = '';
    items.forEach(function (item) {
      var label = document.createElement('label');
      label.className = 'choice' + (state[key] === item.id ? ' is-sel' : '');
      label.innerHTML =
        '<span class="choice__dot"></span>' +
        '<input type="radio" name="' + key + '" value="' + item.id + '"' +
        (state[key] === item.id ? ' checked' : '') + '>' +
        '<span>' + item.nome + '</span>';
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

    function handleFile(file) {
      if (!file || !/^image\//.test(file.type)) {
        aviso('Arquivo inválido', 'Selecione um arquivo de imagem (JPG ou PNG).');
        return;
      }
      setLoading(true);
      text.innerHTML = 'Carregando <u>' + file.name + '</u>…';
      var reader = new FileReader();
      reader.onload = function (e) {
        var dataURI = e.target.result; // data: URI
        // Espera a imagem decodificar antes de renderizar, para o preview
        // não aparecer em branco/estático até a imagem carregar.
        var img = new Image();
        img.onload = function () {
          state.imageHref = dataURI;
          dz.classList.add('has-file');
          text.innerHTML = 'Imagem carregada: <u>' + file.name + '</u> — clique para trocar';
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
    $('#btnDownload').disabled = !state.imageHref;
  }

  function download() {
    if (!state.imageHref) return;
    var btn = $('#btnDownload');
    var svg = B.buildSVG(state);
    btn.disabled = true;
    var label = btn.textContent;
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
      .then(function () { load.fecha(); btn.textContent = label; btn.disabled = !state.imageHref; });
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

  document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    buildChoices('variantes', B.VARIANTES, 'variante');
    buildChoices('elementos', B.ELEMENTOS, 'elemento');
    initUpload();
    initToggles();
    $('#btnDownload').addEventListener('click', download);
    render();
  });
})();
