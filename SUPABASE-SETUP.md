# Configurar o backend (Supabase)

O login por e-mail/senha e o "salvar banners" usam o **Supabase** (plano gratuito).
Enquanto `js/supabase-config.js` estiver vazio, esses recursos ficam desativados e o site
funciona normal (criar + baixar + galeria local).

Regras de permissão implementadas:
- **Admin master** (`gapz.visual@gmail.com`): pode remover **qualquer** banner.
- **Demais usuários**: podem remover **apenas os banners que eles criaram**.
- Todos os usuários logados **veem** todos os banners salvos (compartilhados).

Gerenciamento de usuários (aba **Usuários**, só para admins):
- Admins veem os usuários comuns, cadastram novos (nome, e-mail e senha) e removem.
- Admins **não** podem remover nem editar outros admins.
- O admin master **não aparece** na lista para ninguém além dele mesmo.
- Remover um usuário **não apaga** os banners dele: a posse passa para o admin.

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

## 3c. Área de usuários (rode este SQL também)

Adiciona o campo **nome**, fecha a leitura da tabela `profiles` e cria a função que preserva os
banners de quem for removido.

```sql
-- ========== NOME DO USUÁRIO ==========
alter table public.profiles add column if not exists nome text;
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

-- ========== QUEM VÊ QUEM ==========
-- Antes: qualquer logado lia a tabela inteira (inclusive o admin master).
-- Agora: cada um vê a si mesmo, e admins veem adicionalmente os não-admins.
drop policy if exists "profiles legíveis por autenticados" on public.profiles;
drop policy if exists "profiles: leitura restrita" on public.profiles;
create policy "profiles: leitura restrita"
  on public.profiles for select to authenticated
  using (id = auth.uid() or (public.is_admin() and is_admin = false));

-- ========== PRESERVAR OS BANNERS AO REMOVER ==========
-- banners.owner é "on delete cascade", então apagar o usuário apagaria os banners.
-- Esta função transfere a posse antes, e é chamada pela Edge Function admin-users.
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
```

O `revoke` no fim é importante: só a Edge Function (que usa `service_role`) pode chamar essa função.

## 3d. Publicar a Edge Function `admin-users`

Criar e remover contas exige a chave **`service_role`**, que ignora todas as regras de RLS e por
isso **nunca** pode ficar no site. Essas duas operações rodam numa Edge Function.

1. No painel: **Edge Functions → Deploy a new function**.
2. Nome exato: **`admin-users`**.
3. Cole o conteúdo de `supabase/functions/admin-users/index.ts` deste repositório e publique.

Não é preciso configurar nenhum secret: o Supabase já injeta `SUPABASE_URL`, `SUPABASE_ANON_KEY`
e `SUPABASE_SERVICE_ROLE_KEY` nas Edge Functions.

**Teste antes de liberar para a cliente**, nesta ordem:

1. Logado como um usuário **comum**, abra o console do navegador e rode:
   ```js
   await AffemgBackend.createUser({ nome: 'x', email: 'x@x.com', senha: '123456' })
   ```
   Tem que falhar com "Apenas administradores podem gerenciar usuários." Se criar o usuário,
   **pare tudo**: a checagem de admin não está funcionando.
2. Logado como admin, cadastre um usuário de teste pela aba **Usuários** e confirme o login dele.
3. Com esse usuário de teste, salve um banner. Depois, como admin, remova o usuário e confirme que
   **o banner continua na galeria**, agora sob o admin.

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

1. Criar o projeto (passo 1) e rodar o SQL (passos **2**, **3b** e **3c**).
2. Criar o usuário **admin** e marcá-lo como admin (passo 3).
3. Publicar a Edge Function `admin-users` e testar (passo **3d**).
4. Rodar `node migrate-curated.js` (passo 4b) para publicar os prontos.
5. Configurar os secrets do keep-alive no GitHub (passo 5).

> **Ordem no deploy de atualizações:** rode o SQL e publique a Edge Function **antes** de subir o
> site. Se o site for primeiro, a aba Usuários aparece e dá erro ao cadastrar ou remover.

Depois disso, no site: a aba **Criar banner** é aberta (monta + baixa WebP local); a aba
**Banners salvos** exige login e mostra tudo por categoria, com a recomendada em destaque e os
conjuntos em `.zip`. **Admin** remove/gerencia qualquer banner e marca recomendado; **demais
usuários** salvam em categorias (existentes ou novas) e removem só os que criaram.
