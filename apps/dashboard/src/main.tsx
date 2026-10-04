import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ErrorBoundary } from './components/QueryState';
import { ApplicationBuilder } from './pages/ApplicationBuilder';
import { Applications } from './pages/Applications';
import { AuthCallback } from './pages/AuthCallback';
import { Channels } from './pages/Channels';
import { Guild } from './pages/Guild';
import { GuildLayout } from './pages/GuildLayout';
import { Login } from './pages/Login';
import { Logs } from './pages/Logs';
import { Personnel } from './pages/Personnel';
import { PersonnelDetail } from './pages/PersonnelDetail';
import { PersonnelStructure } from './pages/PersonnelStructure';
import { Fleet } from './pages/Fleet';
import { Penalties } from './pages/Penalties';
import { Sek } from './pages/Sek';
import { Promotions } from './pages/Promotions';
import { Qualifications } from './pages/Qualifications';
import { Training } from './pages/Training';
import { Wanted } from './pages/Wanted';
import { Danger } from './pages/Danger';
import { Duty } from './pages/Duty';
import { Operations } from './pages/Operations';
import { Radio } from './pages/Radio';
import { Shifts } from './pages/Shifts';
import { ProfileEditor, Profiles } from './pages/Profiles';
import { SubmissionDetail } from './pages/SubmissionDetail';
import { Submissions } from './pages/Submissions';
import { UserDetail, Users } from './pages/Users';
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
                  <Route path="applications" element={<Applications />} />
                  <Route path="applications/:applicationId" element={<ApplicationBuilder />} />
                  <Route path="submissions" element={<Submissions />} />
                  <Route path="submissions/:submissionId" element={<SubmissionDetail />} />
                  <Route path="personnel" element={<Personnel />} />
                  <Route path="personnel/:recordId" element={<PersonnelDetail />} />
                  <Route path="personnel-structure" element={<PersonnelStructure />} />
                  <Route path="shifts" element={<Shifts />} />
                  <Route path="duty" element={<Duty />} />
                  <Route path="radio" element={<Radio />} />
                  <Route path="operations" element={<Operations />} />
                  <Route path="danger" element={<Danger />} />
                  <Route path="wanted" element={<Wanted />} />
                  <Route path="training" element={<Training />} />
                  <Route path="qualifications" element={<Qualifications />} />
                  <Route path="promotions" element={<Promotions />} />
                  <Route path="sek" element={<Sek />} />
                  <Route path="fleet" element={<Fleet />} />
                  <Route path="penalties" element={<Penalties />} />
                  <Route path="panels" element={<Panels />} />
                  <Route path="panels/:panelId" element={<PanelEditor />} />
                  <Route path="profiles" element={<Profiles />} />
                  <Route path="profiles/:profileId" element={<ProfileEditor />} />
                  <Route path="users" element={<Users />} />
                  <Route path="users/:userId" element={<UserDetail />} />
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
