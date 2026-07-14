# Banners AFFEMG

Site estático (HTML/CSS/JS puro, sem backend) para **criar** e **baixar** banners no formato do app AFFEMG (1024×640). Duas abas:

- **Criar banner** — escolher modelo de fundo (só imagem, ou imagem + textura), elemento de marca (logo AFFEMG em 4 versões ou Vila Mares), enviar imagem, ligar/desligar escurecimento (40%) e rodapé (blur), ver o preview ao vivo e **baixar em WebP**.
- **Baixar prontos** — galeria dos banners finalizados, organizada por **assunto**, com a **opção recomendada em destaque** e **conjuntos (.zip)** para baixar de uma vez.

Baseado no componente **Template** do Figma (`SzMp2fHogj7U2MwpLrbTJU`, node `32:2965`).

## Estrutura do projeto

```
index.html            Página única (abas Criar / Baixar)
css/styles.css
js/templates.js       Vetores extraídos do Figma (AUTO-GERADO)
js/svg-builder.js     Compositor: monta o banner como SVG 1024×640
js/webp.js            Rasteriza o SVG para WebP (canvas.toBlob)
js/creator.js         UI do criador
js/gallery.js         Galeria: seções, recomendado, sets, download .zip, lightbox
js/webp.js            Rasteriza o SVG para WebP (canvas.toBlob)
js/vendor/fflate.min.js   Lib de ZIP (embutida, sem CDN)
build.js              Gera banners.json a partir da pasta de origem
banners/              WebP dos banners prontos (ficam no projeto)
banners.json          Manifesto gerado (NÃO editar à mão)
```

> **Login + salvar (em construção):** o site vai ganhar login por e-mail/senha e a possibilidade
> de o usuário salvar os banners que cria, com um backend **Supabase**. Regras: o admin master
> (`gapz.visual@gmail.com`) remove qualquer banner; os demais removem só os que criaram.
> Passos de configuração em **[SUPABASE-SETUP.md](SUPABASE-SETUP.md)**.

## Galeria de banners prontos

Os banners finalizados ficam numa pasta de origem (Google Drive), organizada assim:

```
Sets/
  Set Convênios/            -> vira a seção "Convênios"
    Convênios 01.jpg
    Convênios 02.jpg
  Set Vila Mares/
    Vila Mares 01.jpg  02  03
  Set recomendado/          -> marca as recomendadas e vira o conjunto "Recomendados"
    Convênios 02.jpg        (mesmo nome do arquivo recomendado de cada assunto)
    Vila Mares 01.jpg
    ...
```

Regras:
- **Cada pasta `Set X`** = um assunto (seção) na galeria. O `Set ` do nome é removido no título.
- **`Set recomendado`** não vira seção: um banner é marcado como recomendado quando um arquivo **com o mesmo nome** existe nessa pasta. Ela também vira o conjunto **"Recomendados"** (baixar todas as recomendadas de uma vez).
- **Texto/descrição de um assunto** (opcional): crie um `_secao.json` dentro da pasta:
  ```json
  { "titulo": "Convênios", "descricao": "Texto de apoio…", "ordem": 2 }
  ```
  Use `titulo` também para corrigir acentos quando o nome da pasta não tiver (ex.: pasta "Set Convenios").
- **Ordem das seções**: por `ordem` no `_secao.json`, ou prefixe as pastas com número (`01 ...`).
- **Conjuntos extras** que você define (opcional): um `sets.json` na raiz de `Sets/`:
  ```json
  [ { "titulo": "Campanha X", "descricao": "…", "banners": ["convenios/convenios-02.webp", "vila-mares/vila-mares-01.webp"] } ]
  ```

### Gerar/atualizar a galeria

Sempre que mudar os banners na pasta de origem, rode:

```bash
node build.js
# opções:
node build.js --src "H:/Meu Drive/.../Sets" --quality 80
node build.js --skip      # não reconverte o que já existe (mais rápido)
```

O `build.js` converte cada imagem para **WebP** (codec libwebp, via `sharp`) dentro de `banners/` e gera o `banners.json`. Requer o `sharp` instalado (reutiliza o de `C:\Users\rogue\.image-optimizer`).

## Rodar localmente

Precisa de um servidor HTTP (a galeria usa `fetch`):

```bash
npx serve      # ou: python -m http.server 8000
```

Abra o endereço mostrado. Deep-link das abas: `#criar` e `#baixar`.

## Deploy

100% estático — publique a pasta em **GitHub Pages**, **Netlify** ou **Vercel** (sem build no servidor; o `build.js` roda na sua máquina antes de publicar). Garanta que `banners/` e `banners.json` estejam commitados/enviados.

## Observações técnicas

- **Criador → WebP**: o banner é composto como SVG (imagem + camadas do Figma) e rasterizado no navegador via `<canvas>` + `toBlob('image/webp')`. Como o SVG é auto-contido (sem recursos externos nem `foreignObject`), o canvas não fica *tainted*.
- **Fidelidade ao Figma**: logo com blend modes (`color-dodge`, `plus-lighter`), textura com `mix-blend-mode: overlay`, rodapé aproximando o *backdrop blur* progressivo com `feGaussianBlur` + máscara.
- **Re-extrair do Figma**: se o componente Template mudar, regenere `js/templates.js` re-exportando as variantes como SVG e re-rodando o extrator.
