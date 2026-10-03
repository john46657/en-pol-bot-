import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ErrorBoundary } from './components/QueryState';
import { AuthCallback } from './pages/AuthCallback';
import { Channels } from './pages/Channels';
import { Guild } from './pages/Guild';
import { GuildLayout } from './pages/GuildLayout';
import { Login } from './pages/Login';
import { Logs } from './pages/Logs';
import { PanelEditor } from './pages/PanelEditor';
import { Panels } from './pages/Panels';
import { Permissions } from './pages/Permissions';
import { RequireAuth } from './pages/RequireAuth';
import { Roles } from './pages/Roles';
import { Servers } from './pages/Servers';
import { Settings } from './pages/Settings';
import { applyInitialTheme } from './theme';
import { ToastProvider } from './toast';
import './styles.css';

applyInitialTheme();
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route element={<RequireAuth />}>
                <Route path="/servers" element={<Servers />} />
                <Route path="/guilds/:guildId" element={<GuildLayout />}>
                  <Route index element={<Guild />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="roles" element={<Roles />} />
                  <Route path="channels" element={<Channels />} />
                  <Route path="panels" element={<Panels />} />
                  <Route path="panels/:panelId" element={<PanelEditor />} />
                  <Route path="permissions" element={<Permissions />} />
                  <Route path="logs" element={<Logs />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/servers" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
