import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const stale = registrations.filter((registration) => registration.scope === `${window.location.origin}/`);
    if (stale.length && !sessionStorage.getItem('aero-worker-cleaned')) {
      sessionStorage.setItem('aero-worker-cleaned', '1');
      Promise.all(stale.map((registration) => registration.unregister())).then(() => window.location.reload());
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
