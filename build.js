#!/usr/bin/env node
/* build.js — gera a galeria a partir da pasta de origem (Google Drive).
 *
 * O que faz, em um comando:
 *   1. Lê a pasta de origem com os "Sets" de banners prontos.
 *   2. Converte cada imagem (JPG/PNG/…) para WebP dentro de ./banners/<assunto>/.
 *   3. Marca como "recomendada" a opção cujo arquivo também está em "Set recomendado".
 *   4. Gera ./banners.json (seções + sets) que o site lê.
 *
 * Convenção de pastas na origem:
 *   Sets/
 *     Set Convênios/            -> seção "Convênios" (2 opções)
 *       Convênios 01.jpg
 *       Convênios 02.jpg
 *     Set Vila Mares/           -> seção "Vila Mares"
 *       ...
 *     Set recomendado/          -> NÃO vira seção: marca as recomendadas e vira o set "Recomendados"
 *       Convênios 02.jpg        (mesmo nome de arquivo da opção recomendada)
 *     sets.json                 -> (opcional) sets extras que você define
 *
 * Textos por seção (opcional): coloque um arquivo "_secao.json" dentro da pasta:
 *     { "titulo": "Convênios", "descricao": "Texto de apoio…", "ordem": 2 }
 *
 * Uso:
 *   node build.js
 *   node build.js --src "H:/Meu Drive/.../Sets" --quality 80
 *   node build.js --skip          (pula imagens já convertidas — mais rápido)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// sharp (codec libwebp) — reutiliza a instalação do otimizador de imagens.
let sharp;
for (const p of ['sharp', 'C:/Users/rogue/.image-optimizer/node_modules/sharp']) {
  try { sharp = require(p); break; } catch (e) { /* tenta o próximo */ }
}
if (!sharp) {
  console.error('Erro: módulo "sharp" não encontrado. Instale com:\n  cd C:/Users/rogue/.image-optimizer && npm install sharp');
  process.exit(1);
}

// ---------- Args ----------
const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const SRC = path.resolve(argVal('src', 'H:/Meu Drive/01_PROJETOS_GAPZ/AFFEMG - Gráfico/Banners 07 2026/Otimizados/Sets'));
const QUALITY = parseInt(argVal('quality', '80'), 10);
const SKIP = args.includes('--skip');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'banners');
const OUT_JSON = path.join(ROOT, 'banners.json');
const RECO_FOLDER = 'Set recomendado';
const IMG_RE = /\.(jpe?g|png|webp|tiff?|gif|avif)$/i;

const warnings = [];

function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove acentos
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function prettify(s) {
  return s.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1) : w))
    .join(' ');
}
function leadingNumber(s) { const m = s.match(/(\d+)/); return m ? parseInt(m[1], 10) : null; }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') warnings.push('JSON inválido: ' + file); return null; }
}
function listImages(dir) {
  return fs.readdirSync(dir).filter((f) => IMG_RE.test(f)).sort((a, b) => a.localeCompare(b, 'pt'));
}

async function toWebp(srcFile, outFile) {
  if (SKIP && fs.existsSync(outFile)) return 'skip';
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp(srcFile).webp({ quality: QUALITY }).toFile(outFile);
  return 'ok';
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Pasta de origem não encontrada:\n  ' + SRC);
    process.exit(1);
  }

  // Recomendadas: nomes de arquivo presentes em "Set recomendado".
  const recoDir = path.join(SRC, RECO_FOLDER);
  const recoNames = new Set();
  if (fs.existsSync(recoDir)) listImages(recoDir).forEach((f) => recoNames.add(f.toLowerCase()));
  else warnings.push('Pasta "' + RECO_FOLDER + '" não encontrada — nenhuma recomendada marcada.');

  // Limpa seções geradas anteriormente (mantém arquivos avulsos do projeto).
  // Com --skip preservamos o que já existe para reaproveitar as conversões.
  if (!SKIP && fs.existsSync(OUT_DIR)) {
    for (const d of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
      if (d.isDirectory()) fs.rmSync(path.join(OUT_DIR, d.name), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sourceFolders = fs.readdirSync(SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== RECO_FOLDER)
    .map((d) => d.name);

  const secoes = [];
  let converted = 0, skipped = 0;

  for (const folder of sourceFolders) {
    const srcDir = path.join(SRC, folder);
    const meta = readJson(path.join(srcDir, '_secao.json')) || {};
    const titulo = meta.titulo || prettify(folder.replace(/^Set\s+/i, ''));
    const slug = slugify(titulo);
    const imgs = listImages(srcDir);
    if (!imgs.length) { warnings.push('Seção sem imagens: ' + folder); continue; }

    const banners = [];
    for (const img of imgs) {
      const outName = slugify(path.basename(img, path.extname(img))) + '.webp';
      const rel = slug + '/' + outName;
      const res = await toWebp(path.join(srcDir, img), path.join(OUT_DIR, slug, outName));
      if (res === 'ok') converted++; else skipped++;
      banners.push({
        arquivo: rel,
        titulo: prettify(img),
        recomendado: recoNames.has(img.toLowerCase()),
      });
    }
    // Recomendada primeiro dentro da seção.
    banners.sort((a, b) => (b.recomendado - a.recomendado));

    secoes.push({
      id: slug,
      titulo,
      descricao: meta.descricao || '',
      ordem: meta.ordem != null ? meta.ordem : (leadingNumber(folder) != null ? leadingNumber(folder) : 9999),
      banners,
    });
  }

  secoes.sort((a, b) => (a.ordem - b.ordem) || a.titulo.localeCompare(b.titulo, 'pt'));

  // ---------- Sets ----------
  const sets = [];
  const recomendados = [];
  secoes.forEach((s) => s.banners.forEach((b) => { if (b.recomendado) recomendados.push(b.arquivo); }));
  if (recomendados.length) {
    sets.push({ id: 'recomendados', titulo: 'Recomendados', descricao: 'A opção recomendada de cada assunto.', banners: recomendados });
  }

  // Sets extras definidos por você (opcional) em Sets/sets.json.
  const known = new Map(); // nome original de arquivo (sem pasta) -> caminho convertido, por seção
  secoes.forEach((s) => s.banners.forEach((b) => known.set(b.arquivo, true)));
  const extra = readJson(path.join(SRC, 'sets.json'));
  if (Array.isArray(extra)) {
    extra.forEach((set, i) => {
      const items = (set.banners || []).map((x) => {
        // aceita "assunto-slug/arquivo.webp" já no formato de saída
        return x;
      }).filter((x) => { if (!known.has(x)) { warnings.push('Set "' + (set.titulo || i) + '": item inexistente -> ' + x); return false; } return true; });
      if (items.length) sets.push({ id: set.id || slugify(set.titulo || 'set-' + (i + 1)), titulo: set.titulo || 'Set ' + (i + 1), descricao: set.descricao || '', banners: items });
    });
  }

  const manifest = { geradoEm: new Date().toISOString(), secoes, sets };
  fs.writeFileSync(OUT_JSON, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const totalBanners = secoes.reduce((n, s) => n + s.banners.length, 0);
  console.log('OK — banners.json gerado');
  console.log('  origem : ' + SRC);
  console.log('  ' + secoes.length + ' seções · ' + totalBanners + ' banners · ' + sets.length + ' sets');
  console.log('  imagens convertidas: ' + converted + (skipped ? ' (puladas: ' + skipped + ')' : ''));
  if (warnings.length) { console.log('\nAvisos:'); warnings.forEach((w) => console.log('  - ' + w)); }
}

main().catch((e) => { console.error('FALHA:', e.message); process.exit(1); });
