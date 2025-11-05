# Deploy na Vercel

Este projeto está configurado para deploy automático na Vercel.

## Configuração Automática

O arquivo `vercel.json` já está configurado com:
- Build command: `npm run build`
- Output directory: `dist`
- Framework: Vite
- Rewrites para SPA (Single Page Application)

## Deploy Manual

1. Instale a Vercel CLI (se ainda não tiver):
```bash
npm i -g vercel
```

2. Faça login:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

## Deploy via GitHub

1. Conecte seu repositório GitHub à Vercel
2. A Vercel detectará automaticamente as configurações do `vercel.json`
3. O deploy será feito automaticamente a cada push

## Verificações

Após o deploy, verifique:
- ✅ A página inicial carrega corretamente
- ✅ Navegação entre rotas funciona
- ✅ Service Worker está registrado
- ✅ Manifest está acessível em `/manifest.webmanifest`

## Solução de Problemas

### 404 na raiz
- Verifique se o `outputDirectory` está como `dist`
- Confirme que o build gerou o `index.html` na pasta `dist`

### Rotas não funcionam
- Verifique se os rewrites estão configurados no `vercel.json`
- Confirme que o React Router está usando `BrowserRouter`
