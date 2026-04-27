import React from 'react';
import ReactDOM from 'react-dom/client';
import { FamilyHubApp } from './FamilyHubApp';
import { SessionProvider } from './lib/auth/SessionProvider';
import { registerServiceWorker } from './lib/pwa/registerServiceWorker';
import './styles.css';
import './theme.css';
import './fun.css';

// Best-effort SW registration — never blocks render, never throws.
if (typeof window !== 'undefined') {
  registerServiceWorker().catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionProvider>
      <FamilyHubApp />
    </SessionProvider>
  </React.StrictMode>
);
