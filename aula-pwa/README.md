# Aula PWA

Um Progressive Web App (PWA) moderno construído com React + Vite para exibição de aulas em vídeo do YouTube.

## 🚀 Características

- ✅ PWA totalmente funcional e instalável
- ✅ Design moderno com tema roxo
- ✅ Responsivo para mobile
- ✅ Navegação com React Router
- ✅ Service Worker com Workbox
- ✅ Animações suaves
- ✅ Layout mobile-first

## 📋 Pré-requisitos

- Node.js 18+ e npm (ou yarn/pnpm)

## 🔧 Instalação

1. Instale as dependências:

```bash
npm install
```

2. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

3. Para build de produção:

```bash
npm run build
```

4. Para preview do build:

```bash
npm run preview
```

## 📱 Instalando como PWA

### Chrome/Edge Desktop:
1. Abra o aplicativo no navegador
2. Clique no ícone de instalação na barra de endereço
3. Ou vá em Menu > Instalar Aula PWA

### Chrome Android:
1. Abra o aplicativo no navegador
2. Toque no menu (3 pontos)
3. Selecione "Adicionar à tela inicial" ou "Instalar app"

### Safari iOS:
1. Abra o aplicativo no Safari
2. Toque no botão de compartilhar
3. Selecione "Adicionar à Tela de Início"

## 🏗️ Estrutura do Projeto

```
aula-pwa/
├── public/
│   └── icons/          # Ícones do PWA
├── src/
│   ├── components/     # Componentes React
│   ├── pages/          # Páginas
│   ├── styles/         # Estilos CSS
│   ├── types/          # Tipos TypeScript
│   ├── utils/          # Utilitários
│   ├── App.tsx         # Componente principal
│   └── main.tsx        # Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts      # Configuração Vite + PWA
```

## 🎨 Personalização

### Cores
As cores podem ser personalizadas no arquivo `src/styles/global.css` através das variáveis CSS:

```css
:root {
  --primary-purple: #7c3aed;
  --primary-purple-dark: #6d28d9;
  --primary-purple-light: #8b5cf6;
  /* ... */
}
```

### Dados das Aulas
Os dados mock das aulas estão em `src/utils/mockData.ts`. Você pode adicionar ou modificar aulas lá.

## 📝 Tecnologias Utilizadas

- React 18
- Vite 5
- React Router DOM 6
- TypeScript
- Vite PWA Plugin (Workbox)
- CSS Modules

## 📄 Licença

MIT
