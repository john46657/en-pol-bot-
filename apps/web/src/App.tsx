import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { Forbidden, SkeletonRows } from './components/ui';
import { ResourcePage } from './components/ResourcePage';
import { RecordPage } from './components/RecordPage';
import { Login } from './pages/Login';
import { Apply } from './pages/Apply';
import { Dashboard } from './pages/Dashboard';
import { Mdt } from './pages/Mdt';
import { Dispatch } from './pages/Dispatch';
import { Team } from './pages/Team';
const Communication = lazy(() => import('./pages/Communication').then((m) => ({ default: m.Communication })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const Qualifications = lazy(() => import('./pages/Qualifications').then((m) => ({ default: m.Qualifications })));
const Sek = lazy(() => import('./pages/Sek').then((m) => ({ default: m.Sek })));
const SupportTickets = lazy(() => import('./pages/tickets/SupportTickets').then((m) => ({ default: m.SupportTickets })));
const TicketDetail = lazy(() => import('./pages/tickets/TicketDetail').then((m) => ({ default: m.TicketDetail })));
const Academy = lazy(() => import('./pages/Academy').then((m) => ({ default: m.Academy })));
import { PersonDetail } from './pages/PersonDetail';
import { ReportDetail } from './pages/ReportDetail';
const Users = lazy(() => import('./pages/admin/Users').then((m) => ({ default: m.Users })));
const Roles = lazy(() => import('./pages/admin/Roles').then((m) => ({ default: m.Roles })));
const Audit = lazy(() => import('./pages/admin/Audit').then((m) => ({ default: m.Audit })));
const Settings = lazy(() => import('./pages/admin/Settings').then((m) => ({ default: m.Settings })));
const LegalCodes = lazy(() => import('./pages/admin/LegalCodes').then((m) => ({ default: m.LegalCodes })));
const Studio = lazy(() => import('./pages/admin/Studio').then((m) => ({ default: m.Studio })));
import * as R from './pages/resources';

/** UI-seitige Routenprüfung (Komfort). Das Backend erzwingt dieselben Rechte unabhängig davon. */
function Guard({ perm, children }: { perm?: string; children: ReactNode }) {
  const { user, loading, can } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-6"><SkeletonRows /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (perm && !can(perm)) return <Forbidden />;
  return <Suspense fallback={<SkeletonRows />}>{children}</Suspense>;
}

const list = (cfg: Parameters<typeof ResourcePage>[0]['cfg'], perm: string) => <Guard perm={perm}><ResourcePage cfg={cfg} /></Guard>;
const rec = (key: keyof typeof R.records, perm: string) => <Guard perm={perm}><RecordPage cfg={R.records[key]!} /></Guard>;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/apply" element={<Apply />} />
        <Route element={<Guard><AppShell /></Guard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="mdt" element={<Guard perm="dashboard.view"><Mdt /></Guard>} />
          <Route path="dashboard" element={<Guard perm="dashboard.view"><Dashboard /></Guard>} />
          <Route path="team" element={<Guard perm="team.view"><Team /></Guard>} />
          <Route path="dispatch" element={<Guard perm="dispatch.view"><Dispatch /></Guard>} />
          <Route path="support-tickets" element={<Guard perm="ticket.view"><SupportTickets /></Guard>} />
          <Route path="support-tickets/:id" element={<Guard perm="ticket.view"><TicketDetail /></Guard>} />
          <Route path="incidents" element={list(R.incidents as never, 'incidents.view')} />
          <Route path="incidents/:id" element={rec('incidents', 'incidents.view')} />
          <Route path="persons" element={list(R.persons as never, 'persons.view')} />
          <Route path="persons/:id" element={<Guard perm="persons.view"><PersonDetail /></Guard>} />
          <Route path="vehicles" element={list(R.vehicles as never, 'vehicles.view')} />
          <Route path="vehicles/:id" element={rec('vehicles', 'vehicles.view')} />
          <Route path="reports" element={list(R.reports as never, 'reports.view')} />
          <Route path="reports/:id" element={<Guard perm="reports.view"><ReportDetail /></Guard>} />
          <Route path="tickets" element={list(R.tickets as never, 'tickets.view')} />
          <Route path="tickets/:id" element={rec('tickets', 'tickets.view')} />
          <Route path="complaints" element={list(R.complaints as never, 'complaints.view')} />
          <Route path="complaints/:id" element={rec('complaints', 'complaints.view')} />
          <Route path="investigations" element={list(R.investigations as never, 'investigations.view')} />
          <Route path="investigations/:id" element={rec('investigations', 'investigations.view')} />
          <Route path="wanted" element={list(R.wanted as never, 'wanted.view')} />
          <Route path="wanted/:id" element={rec('wanted', 'wanted.view')} />
          <Route path="evidence" element={list(R.evidence as never, 'evidence.view')} />
          <Route path="evidence/:id" element={rec('evidence', 'evidence.view')} />
          <Route path="personnel" element={list(R.personnel as never, 'personnel.view')} />
          <Route path="personnel/:id" element={rec('personnel', 'personnel.view')} />
          <Route path="applications" element={list(R.applications as never, 'applications.view')} />
          <Route path="applications/:id" element={rec('applications', 'applications.view')} />
          <Route path="qualifications" element={<Guard perm="qualifications.view"><Qualifications /></Guard>} />
          <Route path="sek" element={<Guard perm="team.view"><Sek /></Guard>} />
          <Route path="academy" element={<Guard perm="academy.view"><Academy /></Guard>} />
          <Route path="communication" element={<Guard perm="communication.view"><Communication /></Guard>} />
          <Route path="analytics" element={<Guard perm="analytics.view"><Analytics /></Guard>} />
          <Route path="admin/users" element={<Guard perm="users.view"><Users /></Guard>} />
          <Route path="admin/roles" element={<Guard perm="roles.view"><Roles /></Guard>} />
          <Route path="admin/overrides" element={<Navigate to="/admin/users" replace />} />
          <Route path="admin/permissions" element={<Navigate to="/admin/roles" replace />} />
          <Route path="admin/audit" element={<Guard perm="audit.view"><Audit /></Guard>} />
          <Route path="admin/legal-codes" element={<Guard perm="settings.view"><LegalCodes /></Guard>} />
          <Route path="admin/settings" element={<Guard perm="settings.view"><Settings /></Guard>} />
          <Route path="admin/studio" element={<Guard perm="studio.view"><Studio /></Guard>} />
          <Route path="*" element={<div className="py-16 text-center text-muted">404 — page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
