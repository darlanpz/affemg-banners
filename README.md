# Banners AFFEMG

Site para **criar** e **guardar** banners no formato do app AFFEMG (1024×640). Frontend estático
(HTML/CSS/JS) + backend **Supabase** (login, armazenamento e permissões). Duas abas:

- **Criar banner** (aberta, sem login) — escolher modelo de fundo (só imagem, ou imagem + textura),
  elemento de marca (logo AFFEMG em 4 versões ou Vila Mares), enviar imagem, ligar/desligar
  escurecimento (40%) e rodapé (blur), ver o preview ao vivo e **baixar em WebP**. Logado, também
  **Salvar no projeto** (numa categoria).
- **Banners salvos** (exige login) — galeria de tudo que está salvo, por **categoria**, com a
  **recomendada em destaque** e **conjuntos (.zip)** para baixar de uma vez.

Baseado no componente **Template** do Figma (`SzMp2fHogj7U2MwpLrbTJU`, node `32:2965`).

## Permissões

- **Admin master** (`gapz.visual@gmail.com`): remove/gerencia **qualquer** banner e marca recomendado.
- **Demais usuários**: criam e salvam em categorias (existentes ou novas) e removem **só os que criaram**.
- Ver a aba **Banners salvos** exige login. As regras são garantidas no banco (RLS do Supabase).

Configuração do backend: **[SUPABASE-SETUP.md](SUPABASE-SETUP.md)**.

## Estrutura do projeto

```
index.html               Página única (abas Criar / Banners salvos)
css/styles.css
js/templates.js          Vetores extraídos do Figma (AUTO-GERADO)
js/svg-builder.js        Compositor: monta o banner como SVG 1024×640
js/webp.js               Rasteriza o SVG para WebP (canvas.toBlob)
js/creator.js            UI do criador + abas
js/gallery.js            Utilitários: lightbox + ZIP (fflate)
js/supabase-config.js    URL + anon key do Supabase (públicas)
js/supabase-client.js    Camada de dados: auth + banners (CRUD)
js/backend-ui.js         UI de login, salvar e a aba "Banners salvos"
js/vendor/               fflate (zip) e supabase-js (embutidos, sem CDN)
migrate-curated.js       Migra os prontos de banners/ para o Supabase (uma vez)
.github/workflows/       keep-alive do Supabase (evita pausa por inatividade)
banners/ + banners.json  Fonte da migração inicial (WebP dos prontos)
build.js                 (legado) gerou os WebP em banners/ a partir de uma pasta de origem
```

## Rodar localmente

Precisa de um servidor HTTP (o app usa `fetch` e OAuth de sessão):

```bash
npx serve      # ou: python -m http.server 8000
```

Abra o endereço mostrado. Deep-link das abas: `#criar` e `#salvos`.

## Deploy

Frontend estático — publique em **GitHub Pages**, **Netlify** ou **Vercel**. O backend é o Supabase.
Lembre de adicionar a URL de produção nas origens permitidas do Supabase (Authentication → URL
Configuration) e configurar o keep-alive (ver SUPABASE-SETUP.md).

## Observações técnicas

- **Criador → WebP**: o banner é composto como SVG (imagem + camadas do Figma) e rasterizado no navegador via `<canvas>` + `toBlob('image/webp')`. Como o SVG é auto-contido (sem recursos externos nem `foreignObject`), o canvas não fica *tainted*.
- **Fidelidade ao Figma**: logo com blend modes (`color-dodge`, `plus-lighter`), textura com `mix-blend-mode: overlay`, rodapé aproximando o *backdrop blur* progressivo com `feGaussianBlur` + máscara.
- **Re-extrair do Figma**: se o componente Template mudar, regenere `js/templates.js` re-exportando as variantes como SVG e re-rodando o extrator.
