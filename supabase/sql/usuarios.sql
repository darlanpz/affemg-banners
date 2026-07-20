-- ============================================================================
-- Banners AFFEMG: área de administração de usuários
--
-- Cole tudo no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema (é idempotente): se você já rodou
-- parte disso antes, rodar de novo não quebra nada.
--
-- O que este script faz:
--   1. Adiciona nome e a marca de admin master em profiles
--   2. Define quem enxerga quem (RLS)
--   3. Cria a função que preserva os banners de quem for removido
-- ============================================================================


-- 1. NOME DO USUÁRIO -------------------------------------------------------

alter table public.profiles add column if not exists nome text;

-- quem já existia fica com o e-mail como nome
update public.profiles set nome = email where nome is null;

-- o nome vem do cadastro feito pela ferramenta (user_metadata.nome);
-- se não vier, assume o e-mail
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'nome', ''), new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2. ADMIN MASTER ----------------------------------------------------------
-- Marca explícita, para o sistema não precisar adivinhar quem é o master.

alter table public.profiles add column if not exists is_master boolean not null default false;

-- >>> AQUI: troque o e-mail se algum dia o master mudar <<<
update public.profiles
   set is_master = true, is_admin = true
 where email = 'gapz.visual@gmail.com';

create or replace function public.is_master()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_master from public.profiles where id = auth.uid()), false);
$$;


-- 3. QUEM ENXERGA QUEM -----------------------------------------------------
-- Antes: qualquer usuário logado lia a tabela inteira, inclusive o master.
-- Agora: cada um se vê; admins veem todo mundo, menos o master.

drop policy if exists "profiles legíveis por autenticados" on public.profiles;
drop policy if exists "profiles: leitura restrita" on public.profiles;

create policy "profiles: leitura restrita"
  on public.profiles for select to authenticated
  using (id = auth.uid() or (public.is_admin() and is_master = false));


-- 4. PRESERVAR OS BANNERS AO REMOVER ---------------------------------------
-- banners.owner é "on delete cascade", então apagar o usuário apagaria os
-- banners dele. Esta função transfere a posse antes, e só a Edge Function
-- (que roda com service_role) pode chamá-la.

create or replace function public.transferir_banners(de uuid, para uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.banners
     set owner = para,
         owner_email = (select email from public.profiles where id = para)
   where owner = de;
  get diagnostics n = row_count;
  return n;
end; $$;

revoke all on function public.transferir_banners(uuid, uuid) from public, anon, authenticated;


-- 5. CONFERÊNCIA -----------------------------------------------------------
-- Tem que voltar exatamente UMA linha, com is_admin e is_master em true.

select email, nome, is_admin, is_master
  from public.profiles
 where is_master;
