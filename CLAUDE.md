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
- **Mobile (≤820px)**: rodapé fixo (`#peekbar`) com um pedaço do banner ao vivo e o botão "Ver banner"; aparece quando o preview sai da tela (IntersectionObserver em `creator.js`). Fica fora do painel da aba porque o painel tem `transform` e prenderia o `position: fixed`.
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
| `assets/fonts/archivo-*.woff2` | Fonte **Archivo** (variável 100–900, latin + latin-ext), padrão do projeto via `--font` em `css/styles.css` |
| `assets/fonts/material-symbols-*.woff2` | Material Symbols Outlined (woff2 variável, auto-hospedado, **só os ícones usados**). Uso: `<span class="mi" aria-hidden="true">nome</span>`; espessura em `.mi` (`'wght' 300`, de 100 a 700) |
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
npm start        # serve em http://localhost:3000 (npx serve)
npm run dev      # igual, mas com live reload (npx live-server)
```
O `package.json` existe só para os scripts; o site em si não tem build.
Precisa de servidor HTTP (usa `fetch` e sessão). Deploy estático (GitHub Pages em `darlanpz.github.io/affemg-banners/`).
Novas URLs de produção devem ser adicionadas em Supabase → Authentication → URL Configuration.

## Convenções

- Sem framework nem bundler: scripts globais em IIFE (`window.AffemgBanner`, `window.AffemgBackend`, `window.AffemgUI`).
- Commits em português, no estilo `fix(ci): ...` / frases curtas.
- Nunca colocar a `service_role` no front; a anon key e a Turnstile site key são públicas.
- Mudou SQL/Edge Function? Atualize também `SUPABASE-SETUP.md` e lembre que o deploy no Supabase é manual (painel).

## Ícones (Material Symbols)

O woff2 contém só os ícones em uso (4 KB). **Ao usar um ícone novo, regenere a fonte** com a lista completa
em ordem alfabética (ícones atuais: add_photo_alternate, arrow_back, arrow_downward, arrow_forward, person_add, play_arrow, restart_alt, tune, check, check_circle, close, download, error, help, info, login, logout, notifications, save, star, upload, visibility, visibility_off, zoom_in):

```bash
CSS=$(curl -sS -A "Mozilla/5.0 Chrome/124.0.0.0" "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100..700,0,0&icon_names=<lista,ordenada>&display=block")
curl -sS -o assets/fonts/material-symbols-outlined.woff2 "$(echo "$CSS" | grep -o 'https://[^)]*')"
```
Depois de regenerar, suba o `?v=N` da fonte em `css/styles.css` e `index.html` (evita cache velho).
Os nomes são os do catálogo Material **Symbols** (ex.: `notifications`, não `notifications_none`).
