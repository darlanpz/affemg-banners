/* webp.js — rasteriza um SVG (string) para um Blob WebP via <canvas>.
   O SVG é composto por svg-builder.js (imagem embutida em data: URI, sem
   recursos externos nem <foreignObject>), então o canvas NÃO fica "tainted"
   e toBlob('image/webp') funciona em navegadores modernos. */
(function (global) {
  'use strict';

  var W = 1024, H = 640;

  /**
   * @param {string} svg  string SVG completa (auto-contida)
   * @param {Object} [opts]
   * @param {number} [opts.scale=1]     multiplicador de resolução (1 = 1024x640)
   * @param {number} [opts.quality=0.92] qualidade WebP (0..1)
   * @returns {Promise<Blob>} blob image/webp
   */
  function render(svg, opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    var quality = opts.quality != null ? opts.quality : 0.92;

    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(W * scale);
          canvas.height = Math.round(H * scale);
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('Falha ao gerar WebP (toBlob retornou vazio).'));
          }, 'image/webp', quality);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Falha ao carregar o SVG para rasterização.'));
      };
      img.src = url;
    });
  }

  global.AffemgWebp = { render: render };
})(typeof window !== 'undefined' ? window : this);
