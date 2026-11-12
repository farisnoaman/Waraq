import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './index.css';
import App from './App.tsx';
import { handleGoogleRedirect } from './lib/googleAuth';
import { registerServiceWorker } from './lib/pwa';

// Deep links that reached the static 404 page are handed back to the router.
const params = new URLSearchParams(window.location.search);
const restored = params.get('__path');
if (restored && restored.startsWith('/') && !restored.startsWith('//')) {
  window.history.replaceState(null, '', restored);
}

// Must run synchronously at startup, before anything awaits.
void handleGoogleRedirect();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
