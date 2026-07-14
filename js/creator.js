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

  // ---------- Abas ----------
  var TABS = ['criar', 'salvos'];

  function activateTab(name) {
    if (TABS.indexOf(name) < 0) name = 'criar';
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
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (history.replaceState) history.replaceState(null, '', '#' + tab.dataset.tab);
        activateTab(tab.dataset.tab);
      });
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
        alert('Selecione um arquivo de imagem (JPG ou PNG).');
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
        };
        img.onerror = function () {
          setLoading(false);
          text.innerHTML = 'Arraste uma imagem aqui ou <u>clique para escolher</u>';
          alert('Não foi possível abrir a imagem. Tente outro arquivo (JPG ou PNG).');
        };
        img.src = dataURI;
      };
      reader.onerror = function () {
        setLoading(false);
        text.innerHTML = 'Arraste uma imagem aqui ou <u>clique para escolher</u>';
        alert('Falha ao ler o arquivo.');
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
    $('#tglEscurecer').addEventListener('change', function () { state.escurecer = this.checked; render(); });
    $('#tglFooter').addEventListener('change', function () { state.footer = this.checked; render(); });
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
      })
      .catch(function (err) { alert('Não foi possível gerar o WebP: ' + err.message); })
      .then(function () { btn.textContent = label; btn.disabled = !state.imageHref; });
  }

  // Exposto para o backend-ui (botão Salvar) usar o estado atual do banner.
  window.AffemgCreator = {
    currentSVG: function () { return B.buildSVG(state); },
    hasImage: function () { return !!state.imageHref; },
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
