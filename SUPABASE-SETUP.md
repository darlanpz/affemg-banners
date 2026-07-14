# Configurar o backend (Supabase)

O login por e-mail/senha e o "salvar banners" usam o **Supabase** (plano gratuito).
Enquanto `js/supabase-config.js` estiver vazio, esses recursos ficam desativados e o site
funciona normal (criar + baixar + galeria local).

Regras de permissão implementadas:
- **Admin master** (`gapz.visual@gmail.com`): pode remover **qualquer** banner.
- **Demais usuários**: podem remover **apenas os banners que eles criaram**.
- Todos os usuários logados **veem** todos os banners salvos (compartilhados).

---

## 1. Criar o projeto

1. Acesse <https://supabase.com/> e crie uma conta (grátis).
2. **New project** → escolha um nome, senha do banco e região (ex.: São Paulo).
3. Aguarde provisionar (~2 min).

## 2. Rodar o SQL (tabelas + regras + storage)

No projeto: **SQL Editor → New query**, cole tudo abaixo e clique em **Run**.

```sql
-- ========== PERFIS (guarda a flag de admin) ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles legíveis por autenticados"
  on public.profiles for select to authenticated using (true);

-- cria o profile automaticamente quando um usuário é criado no Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- helper: o usuário atual é admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ========== BANNERS (metadados) ==========
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_email text,
  titulo text not null,
  grupo text not null default 'Geral',
  storage_path text not null,
  created_at timestamptz not null default now()
);
alter table public.banners enable row level security;

create policy "banners: todos autenticados leem"
  on public.banners for select to authenticated using (true);

create policy "banners: inserir só como dono"
  on public.banners for insert to authenticated with check (owner = auth.uid());

create policy "banners: apagar dono ou admin"
  on public.banners for delete to authenticated
  using (owner = auth.uid() or public.is_admin());

-- ========== STORAGE (arquivos .webp) ==========
insert into storage.buckets (id, name, public)
  values ('banners', 'banners', true)
  on conflict (id) do nothing;

create policy "storage banners: leitura pública"
  on storage.objects for select using (bucket_id = 'banners');

create policy "storage banners: upload do dono"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "storage banners: apagar dono ou admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'banners'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
```

## 3. Criar os usuários

Como são poucas pessoas, o mais simples é **criar os usuários você mesmo** (sem cadastro aberto):

1. **Authentication → Providers → Email**: deixe **"Confirm email"** desligado (evita etapa de e-mail)
   e, se quiser impedir cadastro aberto, desligue **"Allow new users to sign up"**.
2. **Authentication → Users → Add user → Create new user**: crie cada usuário com e-mail e senha.
   - Crie o **admin**: `gapz.visual@gmail.com` com a senha que você definir (defina/atualize aqui —
     a senha fica protegida no Supabase; **não vai para o código**).

Depois de criar o admin, marque-o como admin no **SQL Editor**:

```sql
update public.profiles set is_admin = true
where email = 'gapz.visual@gmail.com';
```

> Dica de segurança: como a senha do admin foi comentada no chat, **troque-a** aqui na tela de Users.

## 3b. Atualização das regras (rode este SQL também)

Adiciona o campo **recomendado** e refina as permissões (só admin marca recomendado; só admin edita):

```sql
alter table public.banners add column if not exists recomendado boolean not null default false;

drop policy if exists "banners: inserir só como dono" on public.banners;
create policy "banners: inserir como dono"
  on public.banners for insert to authenticated
  with check (owner = auth.uid() and (recomendado = false or public.is_admin()));

drop policy if exists "banners: update só admin" on public.banners;
create policy "banners: update só admin"
  on public.banners for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

## 4. Config (já preenchida)

`js/supabase-config.js` já está com a **Project URL** e a **anon public key** deste projeto.
(São públicas. A `service_role` nunca vai para o código.)

## 4b. Migrar os banners prontos (uma vez)

Depois de criar o admin (passo 3) e rodar o SQL (passos 2 e 3b), migre os 10 banners prontos atuais
para o Supabase, na categoria certa e com a recomendada marcada, pertencendo ao admin:

```bash
# bash
ADMIN_EMAIL="gapz.visual@gmail.com" ADMIN_PASSWORD="suaSenha" node migrate-curated.js
```
```powershell
# PowerShell
$env:ADMIN_EMAIL="gapz.visual@gmail.com"; $env:ADMIN_PASSWORD="suaSenha"; node migrate-curated.js
```

A senha fica só no ambiente durante a execução — **não** é gravada em nenhum arquivo.

## 5. Impedir a pausa por inatividade (plano grátis)

O plano grátis **pausa o projeto após ~7 dias sem atividade**. Para evitar, este repositório já inclui
um **GitHub Action agendado** (`.github/workflows/keep-supabase-alive.yml`) que faz um ping no banco
a cada 3 dias.

Para ativar, no seu repositório do GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
- `SUPABASE_URL` = a Project URL
- `SUPABASE_ANON_KEY` = a anon public key

Pronto — o Action roda sozinho e mantém o projeto ativo. (Obs.: o GitHub desativa Actions agendados se o
repositório ficar 60 dias sem nenhum commit; basta um commit de vez em quando, o que naturalmente acontece.)

---

## Resumo do fluxo (o que fazer, em ordem)

1. Criar o projeto (passo 1) e rodar o SQL (passos **2** e **3b**).
2. Criar o usuário **admin** e marcá-lo como admin (passo 3).
3. Rodar `node migrate-curated.js` (passo 4b) para publicar os prontos.
4. Configurar os secrets do keep-alive no GitHub (passo 5).

Depois disso, no site: a aba **Criar banner** é aberta (monta + baixa WebP local); a aba
**Banners salvos** exige login e mostra tudo por categoria, com a recomendada em destaque e os
conjuntos em `.zip`. **Admin** remove/gerencia qualquer banner e marca recomendado; **demais
usuários** salvam em categorias (existentes ou novas) e removem só os que criaram.
