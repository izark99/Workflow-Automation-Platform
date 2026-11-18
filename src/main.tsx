import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/global.css';
import { App } from './ui/app';
import { readLocale, setLocale } from './ui/i18n';

setLocale(readLocale(typeof localStorage === 'undefined' ? undefined : localStorage, import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true'));

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root is missing. Check index.html.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
