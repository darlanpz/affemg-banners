/* gallery.js — galeria de banners prontos.
   Lê banners.json (gerado por build.js): { secoes, sets }.
   - Seções (assuntos) com múltiplas opções; a recomendada fica em destaque.
   - Sets: coleções para baixar de uma vez em .zip (fflate).
   - Cada card baixa o WebP individual. */
(function () {
  'use strict';

  var loaded = false;
  var DATA = null;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function basename(p) { return p.split('/').pop(); }

  // ---------- Lightbox (preview em tela cheia) ----------
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
        dl.href = src; dl.setAttribute('download', arquivo);
        overlay.hidden = false;
        document.body.classList.add('has-lightbox');
        overlay.querySelector('.lightbox__close').focus();
      }
    };
    return lb;
  }

  // ---------- Cards ----------
  function bannerCard(b) {
    var card = el('figure', 'gcard' + (b.recomendado ? ' is-reco' : ''));
    var src = 'banners/' + b.arquivo;
    var arq = basename(b.arquivo);
    var titulo = b.titulo || arq;
    card.innerHTML =
      (b.recomendado ? '<span class="badge-reco">★ Recomendado</span>' : '') +
      '<button type="button" class="gcard__imgbtn" aria-label="Ver em tela cheia: ' + titulo + '">' +
        '<img class="gcard__img" src="' + src + '" alt="' + titulo + '" loading="lazy">' +
        '<span class="gcard__zoom" aria-hidden="true">⛶ Ampliar</span>' +
      '</button>' +
      '<figcaption class="gcard__body">' +
        '<span class="gcard__name">' + titulo + '</span>' +
        '<a class="btn btn--ghost btn--sm" href="' + src + '" download="' + arq + '">Baixar</a>' +
      '</figcaption>';
    card.querySelector('.gcard__imgbtn').addEventListener('click', function () {
      ensureLightbox().open(src, titulo, arq);
    });
    return card;
  }

  // ---------- ZIP (download em lote) ----------
  function downloadZip(nome, arquivos, btn) {
    if (!window.fflate) { alert('Biblioteca de ZIP não carregada.'); return; }
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Compactando…';
    Promise.all(arquivos.map(function (arq) {
      return fetch('banners/' + arq)
        .then(function (r) { if (!r.ok) throw new Error(arq); return r.arrayBuffer(); })
        .then(function (buf) { return [arq, new Uint8Array(buf)]; });
    }))
      .then(function (pairs) {
        var files = {};
        pairs.forEach(function (p) { files[p[0]] = p[1]; });
        // WebP já é comprimido -> nível 0 (store) é rápido e não incha.
        var zipped = window.fflate.zipSync(files, { level: 0 });
        var blob = new Blob([zipped], { type: 'application/zip' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = nome + '.zip';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      })
      .catch(function (err) { alert('Falha ao gerar o ZIP: ' + err.message); })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  }

  // Faixa de miniaturas dos banners que serão baixados no conjunto.
  function setThumbs(arquivos) {
    var strip = el('div', 'setcard__thumbs');
    arquivos.forEach(function (arq) {
      var src = 'banners/' + arq;
      var b = el('button', 'setcard__thumb');
      b.type = 'button';
      b.setAttribute('aria-label', 'Ver em tela cheia: ' + basename(arq));
      b.innerHTML = '<img src="' + src + '" alt="' + basename(arq) + '" loading="lazy">';
      b.addEventListener('click', function () {
        ensureLightbox().open(src, basename(arq), basename(arq));
      });
      strip.appendChild(b);
    });
    return strip;
  }

  function zipButton(nome, arquivos, texto) {
    var btn = el('button', 'btn btn--primary btn--sm', texto || ('Baixar todos (' + arquivos.length + ')'));
    btn.type = 'button';
    btn.addEventListener('click', function () { downloadZip(nome, arquivos, btn); });
    return btn;
  }

  // ---------- Render ----------
  function render(data) {
    DATA = data;
    var root = document.getElementById('gallery');
    var empty = document.getElementById('galleryEmpty');
    root.innerHTML = '';

    var secoes = (data && data.secoes) || [];
    var sets = (data && data.sets) || [];
    if (!secoes.length && !sets.length) { empty.hidden = false; return; }
    empty.hidden = true;

    // Sets (conjuntos para download em lote).
    if (sets.length) {
      var setsWrap = el('div', 'sets');
      setsWrap.appendChild(el('h2', 'block-title', 'Conjuntos para download'));
      var setsGrid = el('div', 'sets__grid');
      sets.forEach(function (set) {
        var c = el('div', 'setcard');
        c.appendChild(el('span', 'setcard__name', set.titulo));
        if (set.descricao) c.appendChild(el('span', 'setcard__desc', set.descricao));
        c.appendChild(el('span', 'setcard__count', set.banners.length + ' banners'));
        c.appendChild(setThumbs(set.banners));
        c.appendChild(zipButton(set.id || set.titulo, set.banners, 'Baixar .zip'));
        setsGrid.appendChild(c);
      });
      setsWrap.appendChild(setsGrid);
      root.appendChild(setsWrap);
    }

    // Seções (assuntos).
    secoes.forEach(function (sec) {
      var wrap = el('section', 'gsec');
      var head = el('div', 'gsec__head');
      head.appendChild(el('h2', 'gsec__title', '<span class="gsec__prefix">Categoria: </span>' + sec.titulo));
      if (sec.banners.length > 1) {
        var arqs = sec.banners.map(function (b) { return b.arquivo; });
        head.appendChild(zipButton(sec.id, arqs, 'Baixar todos (' + arqs.length + ')'));
      }
      wrap.appendChild(head);
      if (sec.descricao) wrap.appendChild(el('p', 'gsec__desc', sec.descricao));
      var grid = el('div', 'gsec__grid');
      sec.banners.forEach(function (b) { grid.appendChild(bannerCard(b)); });
      wrap.appendChild(grid);
      root.appendChild(wrap);
    });
  }

  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    fetch('banners.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(render)
      .catch(function (err) {
        loaded = false;
        var empty = document.getElementById('galleryEmpty');
        empty.hidden = false;
        empty.innerHTML = 'Não foi possível carregar <code>banners.json</code> (' + err.message +
          '). Rode por um servidor local (ex.: <code>npx serve</code>) e gere o manifesto com <code>node build.js</code>.';
      });
  }

  window.AffemgGallery = { ensureLoaded: ensureLoaded };
  // Reaproveitado pela aba "Salvos".
  window.AffemgLightbox = { open: function (src, titulo, arquivo) { ensureLightbox().open(src, titulo, arquivo); } };
})();
