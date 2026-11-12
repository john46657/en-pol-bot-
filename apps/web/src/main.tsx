import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Schriften lokal ausliefern (die Content-Security-Policy erlaubt nur 'self', kein Google Fonts)
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { ApiError } from './lib/api';
import { ErrorBoundary, reloadOnceForNewVersion } from './components/ErrorBoundary';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 4_000, refetchInterval: 5_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
});

// Vite meldet fehlende Seiten-Dateien nach einem Update hier – einmal neu laden statt leerer Seite
window.addEventListener('vite:preloadError', (e) => { if (reloadOnceForNewVersion()) e.preventDefault(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary><QueryClientProvider client={client}><AuthProvider><App /></AuthProvider></QueryClientProvider></ErrorBoundary></StrictMode>,
);
