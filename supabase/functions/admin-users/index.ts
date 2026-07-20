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
      .from('profiles').select('is_admin, is_master').eq('id', caller.id).maybeSingle();

    if (!callerProfile?.is_admin) {
      return json({ error: 'Apenas administradores podem gerenciar usuários.' }, 403);
    }
    const souMaster = !!callerProfile.is_master;

    const body = await req.json().catch(() => ({}));
    const acao = body.acao;

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

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
