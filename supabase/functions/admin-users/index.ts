// admin-users: criar e remover usuários (só para admins).
//
// Roda no Supabase Edge Functions (Deno). Precisa da chave service_role, que o
// Supabase injeta como variável de ambiente e que NUNCA pode ir para o site.
// Por isso estas duas operações vivem aqui, e não no navegador.
//
// A listagem de usuários não passa por aqui: o site lê public.profiles direto,
// e quem filtra é a policy de RLS. Ver SUPABASE-SETUP.md.
//
// Deploy: painel do Supabase > Edge Functions > Deploy a new function,
// nome "admin-users", e cole este arquivo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const APP_URL = Deno.env.get('APP_URL') || 'https://darlanpz.github.io/affemg-banners/';

// Envia um aviso para todos os admins quando alguém pede acesso. Usa o mesmo
// SMTP (Zoho) que os e-mails de login, com as credenciais em variáveis da
// função. É best-effort: se não houver SMTP configurado ou o envio falhar, o
// pedido continua valendo (o sino de notificações cobre esse caso).
async function avisaAdmins(emails: string[], nome: string, email: string) {
  const host = Deno.env.get('SMTP_HOST');
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const from = Deno.env.get('SMTP_FROM') || user;
  if (!host || !user || !pass || !from || !emails.length) return;

  const html =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;background:#f4f7fa;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fa;padding:24px 12px;"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">' +
    '<tr><td align="center" style="background:#0060A6;padding:26px 24px;">' +
    '<img src="' + APP_URL + 'assets/email-logo.png" width="60" height="60" alt="AFFEMG" style="display:block;border:0;">' +
    '<div style="color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;margin-top:10px;">Banners AFFEMG</div>' +
    '</td></tr>' +
    '<tr><td style="padding:32px 32px 6px;font-family:Arial,Helvetica,sans-serif;color:#12242f;">' +
    '<h1 style="margin:0 0 14px;font-size:20px;">Novo pedido de acesso</h1>' +
    '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f4c55;">Uma pessoa pediu acesso &agrave; ferramenta:</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:15px;color:#12242f;">' +
    '<tr><td style="padding:2px 12px 2px 0;color:#8a97a0;">Nome</td><td style="padding:2px 0;font-weight:bold;">' + escHtml(nome) + '</td></tr>' +
    '<tr><td style="padding:2px 12px 2px 0;color:#8a97a0;">E-mail</td><td style="padding:2px 0;font-weight:bold;">' + escHtml(email) + '</td></tr>' +
    '</table>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>' +
    '<td align="center" bgcolor="#0060A6" style="border-radius:8px;">' +
    '<a href="' + APP_URL + '#usuarios" target="_blank" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#fff;text-decoration:none;border-radius:8px;">Ver na ferramenta</a>' +
    '</td></tr></table>' +
    '<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#8a97a0;">Aprove ou recuse na aba Usu&aacute;rios.</p>' +
    '</td></tr>' +
    '<tr><td style="padding:14px 32px 30px;font-family:Arial,Helvetica,sans-serif;">' +
    '<hr style="border:0;border-top:1px solid #e8edf1;margin:0 0 16px;">' +
    '<p style="margin:0;font-size:12px;color:#8a97a0;">Voc&ecirc; recebe este aviso porque &eacute; administrador dos Banners AFFEMG.</p>' +
    '</td></tr></table></td></tr></table></body></html>';

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: port === 465,               // 465 = TLS direto; 587 = STARTTLS
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({
      from: from,
      to: emails,
      subject: 'Novo pedido de acesso - Banners AFFEMG',
      html,
    });
  } finally {
    try { await client.close(); } catch (_e) { /* ignora */ }
  }
}

function escHtml(s: string) {
  return String(s || '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function traduzErro(msg: string) {
  if (/already been registered|already exists|duplicate/i.test(msg)) {
    return 'Já existe um usuário com este e-mail.';
  }
  if (/password.*(6|short|least)/i.test(msg)) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  if (/invalid.*email|email.*invalid/i.test(msg)) return 'E-mail inválido.';
  return msg;
}

// Confere o token do Cloudflare Turnstile. Sem secret configurada, o captcha
// fica desligado (útil em teste local).
async function captchaOk(token: string, req: Request) {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return true;            // captcha desativado
  if (!token) return false;
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || '';
  if (ip) form.set('remoteip', ip.split(',')[0].trim());
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form });
    const data = await r.json();
    return !!(data && data.success);
  } catch (_e) {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const acao = body.acao;

    // ---------- solicitar acesso (PÚBLICO, protegido por captcha) ----------
    // Roda antes do gate de admin: quem pede acesso ainda não tem conta.
    if (acao === 'solicitar') {
      const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
      const nome = String(body.nome || '').trim();
      const email = String(body.email || '').trim().toLowerCase();

      if (nome.length < 2) return json({ error: 'Informe seu nome completo.' }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
        return json({ error: 'Informe um e-mail válido.' }, 400);
      }
      if (!(await captchaOk(String(body.captchaToken || ''), req))) {
        return json({ error: 'Falha na verificação de segurança. Recarregue e tente de novo.' }, 400);
      }

      const { error } = await admin.from('solicitacoes_acesso')
        .insert({ nome, email, status: 'pendente' });
      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          return json({ error: 'Já existe um pedido em análise para este e-mail.' }, 409);
        }
        return json({ error: error.message }, 400);
      }

      // Avisa os admins por e-mail. Best-effort: nunca derruba o pedido.
      try {
        const { data: admins } = await admin
          .from('profiles').select('email').eq('is_admin', true);
        const emails = (admins || []).map((a) => a.email).filter(Boolean) as string[];
        await avisaAdmins(emails, nome, email);
      } catch (e) {
        console.error('Falha ao avisar admins:', (e as Error).message);
      }

      return json({ ok: true });
    }

    // 1. Quem está chamando? (tudo daqui para baixo exige admin)
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const asCaller = createClient(URL_, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await asCaller.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);

    // 2. É admin mesmo? Conferido no banco, com service_role, ignorando a RLS.
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const { data: callerProfile } = await admin
      .from('profiles').select('is_admin, is_master').eq('id', caller.id).maybeSingle();

    if (!callerProfile?.is_admin) {
      return json({ error: 'Apenas administradores podem gerenciar usuários.' }, 403);
    }
    const souMaster = !!callerProfile.is_master;

    // Quem pode mexer em quem: admin comum só mexe em não-admin; o master mexe
    // em todos. Vale tanto para editar quanto para remover.
    async function carregarAlvo(id: string) {
      const { data } = await admin
        .from('profiles').select('id, email, is_admin, is_master').eq('id', id).maybeSingle();
      return data;
    }
    function barrar(alvo: { is_admin: boolean; is_master: boolean }, verbo: string) {
      if (alvo.is_master && !souMaster) {
        return `Não é possível ${verbo} este usuário.`;
      }
      if (alvo.is_admin && !souMaster) {
        return `Apenas o administrador master pode ${verbo} outro administrador.`;
      }
      return null;
    }

    // ---------- criar ----------
    if (acao === 'create') {
      const nome = String(body.nome || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || '');

      if (!nome) return json({ error: 'Informe o nome.' }, 400);
      if (!email) return json({ error: 'Informe o e-mail.' }, 400);
      if (senha.length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true, // nesta versão não há validação de e-mail
        user_metadata: { nome },
      });
      if (error) return json({ error: traduzErro(error.message) }, 400);

      return json({ ok: true, id: data.user?.id });
    }

    // ---------- editar ----------
    if (acao === 'update') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'Usuário não informado.' }, 400);

      const alvo = await carregarAlvo(id);
      if (!alvo) return json({ error: 'Usuário não encontrado.' }, 404);
      const impedimento = barrar(alvo, 'editar');
      if (impedimento) return json({ error: impedimento }, 403);

      const nome = String(body.nome || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || ''); // vazio = não mexe na senha

      if (!nome) return json({ error: 'Informe o nome.' }, 400);
      if (!email) return json({ error: 'Informe o e-mail.' }, 400);
      if (senha && senha.length < 6) {
        return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
      }

      const patch: Record<string, unknown> = { user_metadata: { nome } };
      if (email !== alvo.email) { patch.email = email; patch.email_confirm = true; }
      if (senha) patch.password = senha;

      const { error } = await admin.auth.admin.updateUserById(id, patch);
      if (error) return json({ error: traduzErro(error.message) }, 400);

      // O trigger só roda na criação, então o profile é atualizado aqui.
      const { error: pErr } = await admin
        .from('profiles').update({ nome, email }).eq('id', id);
      if (pErr) return json({ error: pErr.message }, 500);

      return json({ ok: true });
    }

    // ---------- remover ----------
    if (acao === 'delete') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'Usuário não informado.' }, 400);
      if (id === caller.id) return json({ error: 'Você não pode remover a si mesmo.' }, 400);

      const alvo = await carregarAlvo(id);
      if (!alvo) return json({ error: 'Usuário não encontrado.' }, 404);
      const impedimento = barrar(alvo, 'remover');
      if (impedimento) return json({ error: impedimento }, 403);

      // Destino dos banners: o admin master. Se não houver um marcado, o próprio
      // admin que está removendo. Precisa vir ANTES do delete, porque a FK de
      // banners.owner é "on delete cascade" e levaria os banners junto.
      const { data: masters } = await admin
        .from('profiles').select('id').eq('is_master', true).limit(1);
      const destino = masters?.[0]?.id || caller.id;

      const { error: transferErr } = await admin
        .rpc('transferir_banners', { de: id, para: destino });
      if (transferErr) {
        return json({ error: 'Falha ao preservar os banners: ' + transferErr.message }, 500);
      }

      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: traduzErro(error.message) }, 400);

      return json({ ok: true });
    }

    // ---------- aprovar solicitação de acesso ----------
    // Cria a conta e manda um convite por e-mail. A pessoa clica no link e
    // define a própria senha: nenhum admin precisa inventar nem transportar
    // senha de ninguém.
    if (acao === 'aprovar') {
      const id = String(body.id || '');
      const redirectTo = String(body.redirectTo || '');
      if (!id) return json({ error: 'Solicitação não informada.' }, 400);

      const { data: pedido } = await admin
        .from('solicitacoes_acesso').select('*').eq('id', id).maybeSingle();

      if (!pedido) return json({ error: 'Solicitação não encontrada.' }, 404);
      if (pedido.status !== 'pendente') {
        return json({ error: 'Esta solicitação já foi decidida.' }, 409);
      }

      const { error } = await admin.auth.admin.inviteUserByEmail(pedido.email, {
        data: { nome: pedido.nome },
        redirectTo: redirectTo || undefined,
      });

      if (error) {
        // Caso comum: a pessoa já tem conta e só esqueceu a senha. Não é falha,
        // é um desvio de fluxo, então a tela oferece o envio do link de senha.
        if (/already been registered|already exists|duplicate/i.test(error.message)) {
          return json({ ok: true, jaExiste: true, email: pedido.email, nome: pedido.nome });
        }
        return json({ error: traduzErro(error.message) }, 400);
      }

      await admin.from('solicitacoes_acesso')
        .update({ status: 'aprovada', decidida_em: new Date().toISOString(), decidida_por: caller.id })
        .eq('id', id);

      return json({ ok: true, email: pedido.email });
    }

    // ---------- recusar solicitação ----------
    if (acao === 'recusar') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'Solicitação não informada.' }, 400);

      const { error } = await admin.from('solicitacoes_acesso')
        .update({ status: 'recusada', decidida_em: new Date().toISOString(), decidida_por: caller.id })
        .eq('id', id).eq('status', 'pendente');

      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ---------- marcar a solicitação como resolvida ----------
    // Usado quando o e-mail já tinha conta: o pedido não vira cadastro novo,
    // mas também não pode ficar pendente para sempre.
    if (acao === 'concluir') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'Solicitação não informada.' }, 400);
      await admin.from('solicitacoes_acesso')
        .update({ status: 'aprovada', decidida_em: new Date().toISOString(), decidida_por: caller.id })
        .eq('id', id);
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
