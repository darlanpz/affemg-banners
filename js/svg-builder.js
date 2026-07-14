/* svg-builder.js
   Núcleo gerador de SVG dos banners AFFEMG (1024x640).
   Monta uma string SVG auto-contida a partir de:
     { variante, elemento, imageHref, escurecer, footer }
   A MESMA função alimenta o preview (SVG inline no DOM) e o download.

   Depende de window.AFFEMG_ASSETS (js/templates.js).
*/
(function (global) {
  'use strict';

  var W = 1024, H = 640;
  var A = global.AFFEMG_ASSETS;

  // Opções válidas expostas para a UI.
  var VARIANTES = [
    { id: '01', nome: 'Imagem' },
    { id: '02', nome: 'Imagem + textura' },
  ];
  var ELEMENTOS = [
    { id: 'padrao', nome: 'Sem elemento' },
    { id: 'cima', nome: 'Logo AFFEMG (cima)' },
    { id: 'direita', nome: 'Logo AFFEMG (direita)' },
    { id: 'vertical', nome: 'Logo AFFEMG (vertical)' },
    { id: 'vilamares', nome: 'Vila Mares' },
  ];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  // Camadas de fundo conforme a variante (usadas no desenho normal E na cópia borrada do rodapé).
  // A imagem é definida UMA vez em <defs> (#affImg) e referenciada por <use>, para não
  // duplicar o data-URI (fundo + cópia borrada do rodapé) e manter o arquivo enxuto.
  function backgroundMarkup(variante, imageHref) {
    var img = imageHref
      ? '<use xlink:href="#affImg" href="#affImg"/>'
      : '<rect width="' + W + '" height="' + H + '" fill="#0a2a45"/>'; // placeholder quando sem imagem

    if (variante === '02') {
      return (
        '<rect width="' + W + '" height="' + H + '" fill="' + A.blue + '"/>' +
        '<rect width="' + W + '" height="' + H + '" fill="url(#affTexture)" fill-opacity="0.5"/>' +
        '<g mask="url(#affVar02Mask)">' + img + '</g>'
      );
    }
    return img;
  }

  function elementMarkup(elemento) {
    if (!elemento || elemento === 'padrao') return '';
    return A.elements[elemento] || '';
  }

  // Reúne apenas os <defs> realmente necessários para manter o SVG enxuto.
  function buildDefs(opts) {
    var defs = [
      '<clipPath id="affClip"><rect width="' + W + '" height="' + H + '"/></clipPath>',
    ];

    // Imagem de fundo embutida uma única vez.
    if (opts.imageHref) {
      defs.push(
        '<image id="affImg" href="' + esc(opts.imageHref) + '" xlink:href="' + esc(opts.imageHref) +
        '" x="0" y="0" width="' + W + '" height="' + H +
        '" preserveAspectRatio="xMidYMid slice"/>'
      );
    }

    if (opts.variante === '02') {
      defs.push(A.texturePattern);
      defs.push(
        '<linearGradient id="affVar02MaskGrad" x1="' + W + '" y1="320" x2="0" y2="320" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0.497125" stop-color="white"/>' +
        '<stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>',
        '<mask id="affVar02Mask" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '">' +
        '<rect width="' + W + '" height="' + H + '" fill="url(#affVar02MaskGrad)"/></mask>'
      );
    }

    if (opts.elemento === 'cima') {
      defs.push(
        '<linearGradient id="affLogoGradV" x1="511.5" y1="40" x2="511.5" y2="433" gradientUnits="userSpaceOnUse">' +
        '<stop stop-color="white"/>' +
        '<stop offset="0.6" stop-color="white" stop-opacity="0"/></linearGradient>'
      );
    }

    if (opts.elemento === 'vilamares') {
      defs.push(
        '<radialGradient id="affSunGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" ' +
        'gradientTransform="translate(461 87) rotate(82.1064) scale(291.26 295.825)">' +
        '<stop stop-color="#FDC917"/>' +
        '<stop offset="1" stop-color="#FDC917" stop-opacity="0.09"/></radialGradient>'
      );
    }

    if (opts.footer) {
      defs.push(
        // Gradiente escuro do rodapé (transparente -> preto 0.8).
        '<linearGradient id="affFooterGrad" x1="512" y1="400" x2="512" y2="632.29" gradientUnits="userSpaceOnUse">' +
        '<stop stop-opacity="0"/>' +
        '<stop offset="1" stop-opacity="0.8"/></linearGradient>',
        // Blur do rodapé.
        '<filter id="affBlur" x="-10%" y="-10%" width="120%" height="120%">' +
        '<feGaussianBlur stdDeviation="12"/></filter>',
        // Recorte do rodapé (faixa inferior de 240px).
        '<clipPath id="affFooterClip"><rect x="0" y="400" width="' + W + '" height="240"/></clipPath>',
        // Máscara para o blur PROGRESSIVO (some no topo, opaco embaixo).
        '<linearGradient id="affFooterMaskGrad" x1="512" y1="400" x2="512" y2="640" gradientUnits="userSpaceOnUse">' +
        '<stop stop-color="white" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="white"/></linearGradient>',
        '<mask id="affFooterMask" maskUnits="userSpaceOnUse" x="0" y="400" width="' + W + '" height="240">' +
        '<rect x="0" y="400" width="' + W + '" height="240" fill="url(#affFooterMaskGrad)"/></mask>'
      );
    }

    return '<defs>' + defs.join('') + '</defs>';
  }

  function footerMarkup(variante, imageHref) {
    // Cópia borrada do fundo, recortada ao rodapé e com blur que aumenta para baixo,
    // somada ao gradiente escuro. Aproxima o "backdrop blur progressivo" do Figma.
    return (
      '<g clip-path="url(#affFooterClip)">' +
      '<g mask="url(#affFooterMask)" filter="url(#affBlur)">' +
      backgroundMarkup(variante, imageHref) +
      '</g></g>' +
      '<rect x="0" y="400" width="' + W + '" height="240" fill="url(#affFooterGrad)"/>'
    );
  }

  /**
   * Gera a string SVG completa e auto-contida.
   * @param {Object} opts
   * @param {'01'|'02'} opts.variante
   * @param {'padrao'|'cima'|'direita'|'vertical'|'vilamares'} opts.elemento
   * @param {string} [opts.imageHref]  data: URI (recomendado) ou URL da imagem de fundo
   * @param {boolean} [opts.escurecer]  camada preta 40%
   * @param {boolean} [opts.footer]     efeito de rodapé (blur + gradiente)
   * @returns {string} SVG
   */
  function buildSVG(opts) {
    opts = opts || {};
    var variante = opts.variante === '02' ? '02' : '01';
    var elemento = opts.elemento || 'padrao';
    var imageHref = opts.imageHref || '';
    var escurecer = !!opts.escurecer;
    var footer = opts.footer !== false; // default ligado

    var layers = [
      backgroundMarkup(variante, imageHref),
      elementMarkup(elemento),
      escurecer ? '<rect width="' + W + '" height="' + H + '" fill="black" fill-opacity="0.4"/>' : '',
      footer ? footerMarkup(variante, imageHref) : '',
    ].join('');

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" fill="none">' +
      buildDefs({ variante: variante, elemento: elemento, footer: footer, imageHref: imageHref }) +
      '<g clip-path="url(#affClip)">' + layers + '</g>' +
      '</svg>'
    );
  }

  global.AffemgBanner = {
    buildSVG: buildSVG,
    VARIANTES: VARIANTES,
    ELEMENTOS: ELEMENTOS,
    WIDTH: W,
    HEIGHT: H,
  };
})(typeof window !== 'undefined' ? window : this);
