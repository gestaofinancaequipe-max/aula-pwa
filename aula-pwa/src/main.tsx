import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// O vite-plugin-pwa registra o service worker automaticamente via Workbox
// Não é necessário registro manual, mas podemos adicionar listeners para atualizações
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Workbox gerencia o registro automaticamente
    // Este código é apenas para logs e notificações de atualização
    navigator.serviceWorker.ready.then((registration) => {
      console.log('Service Worker ready:', registration);
      
      // Verificar atualizações periodicamente
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000); // Verificar a cada hora
    });
  });
}
