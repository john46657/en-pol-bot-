import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { ApiError } from './lib/api';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={client}><AuthProvider><App /></AuthProvider></QueryClientProvider></StrictMode>,
);
