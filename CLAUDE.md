# Banners AFFEMG

Site para **criar** e **guardar** banners no formato do app AFFEMG (1024×640). Frontend estático
(HTML/CSS/JS puro, **sem build**) + backend **Supabase** (auth, banco, storage, Edge Function).
Idioma do projeto e da UI: português (pt-BR). Detalhes: `README.md` e `SUPABASE-SETUP.md`.

## Como funciona

- **Criar banner** (aba `#criar`, sem login): escolhe fundo (imagem ou imagem + textura), elemento de marca
  (logo AFFEMG em 4 versões ou Vila Mares), escurecimento (40%) e rodapé (blur); preview ao vivo; baixa em WebP.
  Logado, também salva numa categoria.
- **Banners salvos** (aba `#salvos`, exige login): galeria por categoria, recomendada em destaque, conjuntos `.zip`.
- **Usuários** (só admins): cadastrar/remover/editar usuários, aprovar solicitações de acesso, sino de notificações.
- **Onboarding**: tutorial guiado interativo no primeiro acesso (botão "Como usar").
- **Renderização**: o banner é montado como SVG auto-contido (`svg-builder.js`) e rasterizado via
  `<canvas>` + `toBlob('image/webp')` (`webp.js`). Sem recursos externos nem `foreignObject`, para o canvas não ficar *tainted*.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html`, `css/styles.css` | Página única |
| `js/templates.js` | Vetores do Figma — **AUTO-GERADO**, não editar à mão (componente Template `SzMp2fHogj7U2MwpLrbTJU`, node `32:2965`) |
| `js/svg-builder.js` | Compositor do banner em SVG |
| `js/webp.js` | SVG → WebP |
| `js/creator.js` | UI do criador + abas |
| `js/gallery.js` | Lightbox + ZIP (fflate) |
| `js/supabase-config.js` | URL, anon key (pública), `adminEmail`, `turnstileSiteKey` |
| `js/supabase-client.js` | Camada de dados: auth + banners (CRUD) |
| `js/backend-ui.js` | UI de login, salvar, aba "Banners salvos" |
| `js/admin-ui.js` | Aba Usuários / solicitações / notificações |
| `js/onboarding.js` | Boas-vindas + tutorial |
| `js/vendor/` | fflate e supabase-js embutidos (sem CDN) |
| `supabase/sql/` | `usuarios.sql`, `solicitacoes.sql` (rodar no SQL Editor) |
| `supabase/functions/admin-users/index.ts` | Edge Function (Deno): criar/remover usuários, aviso por e-mail via SMTP |
| `supabase/emails/` | Templates HTML dos e-mails do Auth |
| `migrate-curated.js` | Migração única dos prontos de `banners/` para o Supabase |
| `build.js` | **Legado**: gerou os WebP em `banners/` a partir de pasta do Drive |
| `.github/workflows/keep-supabase-alive.yml` | Ping a cada 3 dias (evita pausa do plano grátis); secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` |

## Permissões (garantidas por RLS no banco, não só na UI)

- **Admin master** (`gapz.visual@gmail.com`): gerencia qualquer banner, marca recomendado, não aparece na lista de usuários para outros admins.
- **Admins**: veem/cadastram/removem usuários comuns; não editam nem removem outros admins.
- **Usuários**: criam e salvam em categorias; removem só os próprios banners. Todos logados veem todos os banners.
- Remover usuário **não apaga** os banners dele: a posse passa para o admin (`transferir_banners`).
- Listagem de usuários lê `public.profiles` direto (RLS filtra); criar/remover passa pela Edge Function (usa `service_role`, nunca no front).

## Rodar e publicar

```bash
npm start        # serve em http://localhost:3000 (usa npx serve; não há dependências)
```
O `package.json` existe só para os scripts; o site em si não tem build.
Precisa de servidor HTTP (usa `fetch` e sessão). Deploy estático (GitHub Pages em `darlanpz.github.io/affemg-banners/`).
Novas URLs de produção devem ser adicionadas em Supabase → Authentication → URL Configuration.

## Convenções

- Sem framework nem bundler: scripts globais em IIFE (`window.AffemgBanner`, `window.AffemgBackend`, `window.AffemgUI`).
- Commits em português, no estilo `fix(ci): ...` / frases curtas.
- Nunca colocar a `service_role` no front; a anon key e a Turnstile site key são públicas.
- Mudou SQL/Edge Function? Atualize também `SUPABASE-SETUP.md` e lembre que o deploy no Supabase é manual (painel).
