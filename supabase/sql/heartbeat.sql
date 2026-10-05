-- heartbeat: tabela de uma linha que o keep-alive (GitHub Actions) atualiza
-- a cada execução. É atividade real de escrita no banco, para o plano grátis
-- do Supabase não pausar o projeto por inatividade.
-- Rode no SQL Editor do Supabase. Não guarda nada sensível.

create table if not exists public.heartbeat (
  id int primary key,
  ping timestamptz not null default now()
);
insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;

drop policy if exists "heartbeat leitura" on public.heartbeat;
create policy "heartbeat leitura" on public.heartbeat
  for select to anon, authenticated using (true);

drop policy if exists "heartbeat escrita" on public.heartbeat;
create policy "heartbeat escrita" on public.heartbeat
  for update to anon, authenticated using (id = 1) with check (id = 1);

grant select, update on public.heartbeat to anon, authenticated;
