import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthCallback } from './pages/AuthCallback';
import { Guild } from './pages/Guild';
import { Login } from './pages/Login';
import { RequireAuth } from './pages/RequireAuth';
import { Servers } from './pages/Servers';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<RequireAuth />}>
            <Route path="/servers" element={<Servers />} />
            <Route path="/guilds/:guildId" element={<Guild />} />
          </Route>
          <Route path="*" element={<Navigate to="/servers" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
