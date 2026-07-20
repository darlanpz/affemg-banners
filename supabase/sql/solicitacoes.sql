-- ============================================================================
-- Banners AFFEMG: solicitações de acesso
--
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
--
-- Quem não tem conta pede acesso pela tela de login, informando nome e e-mail.
-- O pedido cai aqui, e um administrador aprova pela aba Usuários. Ao aprovar,
-- a pessoa recebe um convite por e-mail e cria a própria senha.
-- ============================================================================

create table if not exists public.solicitacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'recusada')),
  created_at timestamptz not null default now(),
  decidida_em timestamptz,
  decidida_por uuid references auth.users(id) on delete set null,

  -- Limites simples de sanidade: o formulário é aberto ao público, então o
  -- banco não confia no que vem da tela.
  constraint nome_tamanho check (char_length(nome) between 2 and 80),
  constraint email_tamanho check (char_length(email) between 5 and 160),
  constraint email_formato check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$')
);

-- Um pedido pendente por e-mail: reenviar não duplica a fila.
create unique index if not exists solicitacoes_pendente_email
  on public.solicitacoes_acesso (lower(email))
  where status = 'pendente';

create index if not exists solicitacoes_status_data
  on public.solicitacoes_acesso (status, created_at desc);

alter table public.solicitacoes_acesso enable row level security;

-- Qualquer visitante pode PEDIR acesso (é o único jeito de quem não tem conta
-- se apresentar). Só pode criar pedido pendente, nunca já aprovado.
drop policy if exists "solicitacoes: qualquer um pede" on public.solicitacoes_acesso;
create policy "solicitacoes: qualquer um pede"
  on public.solicitacoes_acesso for insert to anon, authenticated
  with check (status = 'pendente');

-- Ler, decidir e apagar: só administradores.
drop policy if exists "solicitacoes: admin lê" on public.solicitacoes_acesso;
create policy "solicitacoes: admin lê"
  on public.solicitacoes_acesso for select to authenticated
  using (public.is_admin());

drop policy if exists "solicitacoes: admin decide" on public.solicitacoes_acesso;
create policy "solicitacoes: admin decide"
  on public.solicitacoes_acesso for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "solicitacoes: admin apaga" on public.solicitacoes_acesso;
create policy "solicitacoes: admin apaga"
  on public.solicitacoes_acesso for delete to authenticated
  using (public.is_admin());

-- Conferência: deve listar as 4 políticas acima.
select policyname, cmd
  from pg_policies
 where tablename = 'solicitacoes_acesso'
 order by policyname;
