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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // 1. Quem está chamando?
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
      .from('profiles').select('is_admin').eq('id', caller.id).maybeSingle();

    if (!callerProfile?.is_admin) {
      return json({ error: 'Apenas administradores podem gerenciar usuários.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const acao = body.acao;

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

    // ---------- remover ----------
    if (acao === 'delete') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'Usuário não informado.' }, 400);
      if (id === caller.id) return json({ error: 'Você não pode remover a si mesmo.' }, 400);

      const { data: alvo } = await admin
        .from('profiles').select('id, email, is_admin').eq('id', id).maybeSingle();

      if (!alvo) return json({ error: 'Usuário não encontrado.' }, 404);
      if (alvo.is_admin) {
        return json({ error: 'Não é possível remover um administrador.' }, 403);
      }

      // Destino dos banners: o admin mais antigo (o master). Se não achar, o próprio
      // admin que está removendo. Precisa vir ANTES do delete, porque a FK de
      // banners.owner é "on delete cascade" e levaria os banners junto.
      const { data: masters } = await admin
        .from('profiles').select('id').eq('is_admin', true)
        .order('created_at', { ascending: true }).limit(1);
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

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
