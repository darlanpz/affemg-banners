/* gallery.js — utilitários de UI compartilhados pela aba "Banners salvos".
   - AffemgLightbox: preview em tela cheia.
   - AffemgZip: compacta um conjunto de blobs em .zip (fflate) e baixa. */
(function () {
  'use strict';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- Lightbox ----------
  var lb = null;
  function ensureLightbox() {
    if (lb) return lb;
    var overlay = el('div', 'lightbox');
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="lightbox__inner" role="dialog" aria-modal="true" aria-label="Pré-visualização do banner">' +
        '<button type="button" class="lightbox__close" aria-label="Fechar (Esc)">×</button>' +
        '<img class="lightbox__img" alt="">' +
        '<div class="lightbox__bar">' +
          '<span class="lightbox__name"></span>' +
          '<a class="btn btn--primary btn--sm lightbox__dl" download>Baixar WebP</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() {
      overlay.hidden = true;
      document.body.classList.remove('has-lightbox');
      overlay.querySelector('.lightbox__img').removeAttribute('src');
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('.lightbox__close')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });

    lb = {
      open: function (src, titulo, arquivo) {
        var img = overlay.querySelector('.lightbox__img');
        img.src = src; img.alt = titulo || '';
        overlay.querySelector('.lightbox__name').textContent = titulo || arquivo;
        var dl = overlay.querySelector('.lightbox__dl');
        dl.href = src; dl.setAttribute('download', arquivo || 'banner.webp');
        overlay.hidden = false;
        document.body.classList.add('has-lightbox');
        overlay.querySelector('.lightbox__close').focus();
      }
    };
    return lb;
  }

  window.AffemgLightbox = { open: function (src, titulo, arquivo) { ensureLightbox().open(src, titulo, arquivo); } };

  // ---------- ZIP ----------
  // entries: [{ name: 'arquivo.webp', getBlob: () => Promise<Blob> }]
  function zipDownload(nome, entries) {
    if (!window.fflate) return Promise.reject(new Error('Biblioteca de ZIP não carregada.'));
    var usados = {};
    return Promise.all(entries.map(function (en) {
      return en.getBlob().then(function (blob) { return blob.arrayBuffer(); }).then(function (buf) {
        var name = en.name; // evita nomes duplicados no zip
        while (usados[name]) { name = name.replace(/(\.\w+)?$/, function (ext, i) { return '-' + (Math.random().toString(36).slice(2, 5)) + (ext || ''); }); }
        usados[name] = 1;
        return [name, new Uint8Array(buf)];
      });
    })).then(function (pairs) {
      var files = {};
      pairs.forEach(function (p) { files[p[0]] = p[1]; });
      var zipped = window.fflate.zipSync(files, { level: 0 }); // WebP já comprimido
      var blob = new Blob([zipped], { type: 'application/zip' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = (nome || 'banners') + '.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  window.AffemgZip = { download: zipDownload };
})();
