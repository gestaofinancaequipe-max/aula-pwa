# Setup do PWA

Este projeto está configurado como um Progressive Web App (PWA) usando `vite-plugin-pwa`.

## O que está configurado

✅ **Manifest.json** - Gerado automaticamente pelo plugin
✅ **Service Worker** - Gerado automaticamente com Workbox
✅ **Cache Strategy** - Configurado para cache de assets e YouTube
✅ **Auto Update** - Service Worker atualiza automaticamente

## Configuração no vite.config.ts

O PWA está configurado no arquivo `vite.config.ts` com:
- Tema roxo (#7c3aed)
- Display standalone
- Ícones configurados (precisam ser adicionados na pasta `public/icons/`)
- Cache de assets estáticos
- Cache de vídeos do YouTube

## Gerando Ícones

Para gerar os ícones necessários:

1. Crie uma imagem 512x512px com tema roxo
2. Use ferramentas online para gerar os tamanhos:
   - https://www.pwabuilder.com/imageGenerator
   - https://tools.crawlink.com/tools/pwa-icon-generator/

3. Coloque os ícones na pasta `public/icons/`

## Testando o PWA

1. Execute `npm run build` para gerar a versão de produção
2. Execute `npm run preview` para testar localmente
3. Abra no navegador e verifique:
   - Console do navegador (Service Worker registrado)
   - DevTools > Application > Manifest
   - DevTools > Application > Service Workers

## Instalação

O PWA pode ser instalado em:
- **Chrome/Edge Desktop**: Ícone de instalação na barra de endereço
- **Chrome Android**: Menu > "Adicionar à tela inicial"
- **Safari iOS**: Compartilhar > "Adicionar à Tela de Início"

## Desenvolvimento

Durante o desenvolvimento (`npm run dev`), o Service Worker é registrado automaticamente, mas algumas funcionalidades PWA podem não estar totalmente ativas. Para testes completos, use `npm run build` e `npm run preview`.
