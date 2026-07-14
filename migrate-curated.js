#!/usr/bin/env node
/* migrate-curated.js — sobe os banners prontos atuais (banners/ + banners.json)
 * para o Supabase, como pertencentes ao ADMIN, com categoria e recomendado.
 *
 * Rode UMA vez, com as credenciais do admin em variáveis de ambiente:
 *
 *   # PowerShell:
 *   $env:ADMIN_EMAIL="gapz.visual@gmail.com"; $env:ADMIN_PASSWORD="suaSenha"; node migrate-curated.js
 *
 *   # bash:
 *   ADMIN_EMAIL="gapz.visual@gmail.com" ADMIN_PASSWORD="suaSenha" node migrate-curated.js
 *
 * A senha NÃO é gravada em lugar nenhum — fica só no ambiente durante a execução.
 * Requer que o SQL do SUPABASE-SETUP.md (incluindo a coluna "recomendado") já tenha rodado.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lê url + anonKey de js/supabase-config.js (reaproveita a config do site).
function readConfig() {
  const g = {};
  const code = fs.readFileSync(path.join(__dirname, 'js', 'supabase-config.js'), 'utf8');
  new Function('window', code)(g);
  return g.AFFEMG_SUPABASE || {};
}

async function main() {
  const cfg = readConfig();
  const URL = cfg.url, ANON = cfg.anonKey;
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (!URL || !ANON) throw new Error('js/supabase-config.js sem url/anonKey.');
  if (!email || !password) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente.');

  // 1) Login do admin
  const tokRes = await fetch(URL + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const tok = await tokRes.json();
  if (!tokRes.ok) throw new Error('Login admin falhou: ' + (tok.msg || tok.error_description || JSON.stringify(tok)));
  const token = tok.access_token;
  const auth = { apikey: ANON, Authorization: 'Bearer ' + token };

  // 2) Lê o manifesto atual
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'banners.json'), 'utf8'));
  const jobs = [];
  (manifest.secoes || []).forEach((sec) => {
    (sec.banners || []).forEach((b) => {
      jobs.push({ grupo: sec.titulo, titulo: b.titulo, recomendado: !!b.recomendado, arquivo: b.arquivo });
    });
  });
  if (!jobs.length) throw new Error('banners.json sem banners.');

  let ok = 0;
  for (const job of jobs) {
    const bytes = fs.readFileSync(path.join(__dirname, 'banners', job.arquivo));
    const storagePath = tok.user.id + '/' + crypto.randomUUID() + '.webp';

    // 3) Upload para o storage
    const up = await fetch(URL + '/storage/v1/object/banners/' + storagePath, {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'image/webp', 'x-upsert': 'true' }, auth), body: bytes,
    });
    if (!up.ok) { console.error('  ! upload falhou:', job.arquivo, await up.text()); continue; }

    // 4) Insere a linha (owner = auth.uid() por default)
    const ins = await fetch(URL + '/rest/v1/banners', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, auth),
      body: JSON.stringify({
        titulo: job.titulo, grupo: job.grupo, storage_path: storagePath,
        owner_email: email, recomendado: job.recomendado,
      }),
    });
    if (!ins.ok) { console.error('  ! insert falhou:', job.titulo, await ins.text()); continue; }
    ok++;
    console.log('  ✓', job.grupo, '›', job.titulo, job.recomendado ? '(recomendado)' : '');
  }
  console.log('\nMigrados ' + ok + '/' + jobs.length + ' banners para o Supabase.');
}

main().catch((e) => { console.error('FALHA:', e.message); process.exit(1); });
