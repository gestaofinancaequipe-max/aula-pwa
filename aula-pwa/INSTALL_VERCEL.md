# Configuração na Vercel Dashboard

## ⚠️ IMPORTANTE: Configurar Root Directory

Se seu projeto está na pasta `aula-pwa` dentro do repositório, você **DEVE** configurar o Root Directory no dashboard da Vercel:

### Passos:

1. **Acesse o projeto na Vercel**
   - Vá para https://vercel.com/dashboard
   - Selecione seu projeto

2. **Vá em Settings → General**

3. **Encontre "Root Directory"**
   - Clique em "Edit"
   - Selecione ou digite: `aula-pwa`
   - Salve

4. **Configure também as opções de Build**:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build` (ou deixe em branco para usar o padrão)
   - **Output Directory**: `dist` (ou deixe em branco para usar o padrão)
   - **Install Command**: `npm install` (ou deixe em branco)

5. **Salve todas as alterações**

6. **Faça um novo deploy**:
   - Vá em Deployments
   - Clique em "Redeploy" no último deployment
   - Ou faça um novo commit e push

## ✅ Verificação

Após configurar, o build deve:
- Instalar as dependências (node_modules)
- Executar `npm run build`
- Gerar arquivos na pasta `dist`
- Fazer deploy desses arquivos

O build deve levar alguns segundos (não apenas 38ms) e você deve ver logs como:
- "Running npm install"
- "Running npm run build"
- "Build Completed"

## 🔧 Se ainda não funcionar

1. Verifique se o `package.json` está na pasta `aula-pwa/`
2. Verifique se o `vercel.json` está na pasta `aula-pwa/`
3. Verifique os logs de build na Vercel para ver erros específicos
4. Teste o build localmente: `cd aula-pwa && npm run build`
