import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { Forbidden, SkeletonRows } from './components/ui';
import { ResourcePage } from './components/ResourcePage';
import { RecordPage } from './components/RecordPage';
import { Login } from './pages/Login';
import { Apply } from './pages/Apply';
import { Privacy, Terms } from './pages/Legal';
import { Dashboard } from './pages/Dashboard';
import { Mdt } from './pages/Mdt';
import { Dispatch } from './pages/Dispatch';
import { Team } from './pages/Team';
const Communication = lazy(() => import('./pages/Communication').then((m) => ({ default: m.Communication })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const Applications = lazy(() => import('./pages/Applications').then((m) => ({ default: m.Applications })));
const Qualifications = lazy(() => import('./pages/Qualifications').then((m) => ({ default: m.Qualifications })));
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
const Shifts = lazy(() => import('./pages/admin/Shifts').then((m) => ({ default: m.Shifts })));
const ServerLinks = lazy(() => import('./pages/admin/ServerLinks').then((m) => ({ default: m.ServerLinks })));
const Embeds = lazy(() => import('./pages/admin/Embeds').then((m) => ({ default: m.Embeds })));
const WelcomeSettings = lazy(() => import('./pages/admin/WelcomeSettings').then((m) => ({ default: m.WelcomeSettings })));
const LeaveSettings = lazy(() => import('./pages/admin/LeaveSettings').then((m) => ({ default: m.LeaveSettings })));
const Leave = lazy(() => import('./pages/Leave').then((m) => ({ default: m.Leave })));
const TeamList = lazy(() => import('./pages/TeamList').then((m) => ({ default: m.TeamList })));
const RadioCodes = lazy(() => import('./pages/RadioCodes').then((m) => ({ default: m.RadioCodes })));
const TeamChance = lazy(() => import('./pages/TeamChance').then((m) => ({ default: m.TeamChance })));
const StaffLists = lazy(() => import('./pages/DiscordPanels').then((m) => ({ default: m.StaffLists })));
const FormPanels = lazy(() => import('./pages/DiscordPanels').then((m) => ({ default: m.FormPanels })));
const PersonnelOverview = lazy(() => import('./pages/hr/PersonnelOverview').then((m) => ({ default: m.PersonnelOverview })));
const PersonnelFile = lazy(() => import('./pages/hr/PersonnelFile').then((m) => ({ default: m.PersonnelFile })));
const Promotions = lazy(() => import('./pages/hr/Promotions').then((m) => ({ default: m.Promotions })));
const HrSettings = lazy(() => import('./pages/hr/HrSettings').then((m) => ({ default: m.HrSettings })));
const Trainings = lazy(() => import('./pages/hr/Trainings').then((m) => ({ default: m.Trainings })));
const Certificate = lazy(() => import('./pages/hr/Trainings').then((m) => ({ default: m.Certificate })));
const HrComms = lazy(() => import('./pages/hr/HrComms').then((m) => ({ default: m.HrComms })));
const ServiceNumbers = lazy(() => import('./pages/hr/ServiceNumbers').then((m) => ({ default: m.ServiceNumbers })));
const DutyReports = lazy(() => import('./pages/DutyReports').then((m) => ({ default: m.DutyReports })));
const Offices = lazy(() => import('./pages/Offices').then((m) => ({ default: m.Offices })));
const PersonalSettings = lazy(() => import('./pages/PersonalSettings').then((m) => ({ default: m.PersonalSettings })));
const Studio = lazy(() => import('./pages/admin/Studio').then((m) => ({ default: m.Studio })));
import * as R from './pages/resources';
import { CadLayout } from './pages/cad/CadLayout';
const CadDashboard = lazy(() => import('./pages/cad/CadDashboard').then((m) => ({ default: m.CadDashboard })));
const CadIncidents = lazy(() => import('./pages/cad/CadIncidents').then((m) => ({ default: m.CadIncidents })));
const CadMapPage = lazy(() => import('./pages/cad/CadOps').then((m) => ({ default: m.CadMapPage })));
const CadCalls = lazy(() => import('./pages/cad/CadOps').then((m) => ({ default: m.CadCalls })));
const CadUnits = lazy(() => import('./pages/cad/CadOps').then((m) => ({ default: m.CadUnits })));
const CadRadio = lazy(() => import('./pages/cad/CadOps').then((m) => ({ default: m.CadRadio })));
const ErlcLive = lazy(() => import('./pages/cad/ErlcLive').then((m) => ({ default: m.ErlcLive })));
const CadSettings = lazy(() => import('./pages/cad/CadAdmin').then((m) => ({ default: m.CadSettings })));
const CadTeam = lazy(() => import('./pages/cad/CadAdmin').then((m) => ({ default: m.CadTeam })));
const CadCrossServer = lazy(() => import('./pages/cad/CadAdmin').then((m) => ({ default: m.CadCrossServer })));
const CadLogs = lazy(() => import('./pages/cad/CadAdmin').then((m) => ({ default: m.CadLogs })));

/** Statistik: allgemeine Statistik ODER Bewerbungs-Statistik genügt. */
function AnalyticsGate() {
  const { can } = useAuth();
  return can('analytics.view') || (can('applications.view') && can('dashboard.applications.view')) ? <Analytics /> : <Forbidden />;
}

/** UI-seitige Routenprüfung (Komfort). Das Backend erzwingt dieselben Rechte unabhängig davon. */
function Guard({ perm, area, children }: { perm?: string; area?: string; children: ReactNode }) {
  const { user, loading, can } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-6"><SkeletonRows /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if ((perm && !can(perm)) || (area && !can(area))) return <Forbidden />;
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
        <Route path="/datenschutz" element={<Privacy />} />
        <Route path="/nutzungsbedingungen" element={<Terms />} />
        <Route element={<Guard><AppShell /></Guard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="mdt" element={<Guard perm="dashboard.view"><Mdt /></Guard>} />
          <Route path="dashboard" element={<Guard perm="dashboard.view"><Dashboard /></Guard>} />
          <Route path="team" element={<Guard perm="team.view" area="dashboard.team.view"><Team /></Guard>} />
          <Route path="teamlist" element={<Guard perm="team.view" area="dashboard.team.view"><TeamList /></Guard>} />
          <Route path="staff-lists" element={<Guard perm="team.view" area="dashboard.team.view"><StaffLists /></Guard>} />
          <Route path="admin/form-panels" element={<Guard perm="settings.view" area="dashboard.settings.view"><FormPanels /></Guard>} />
          <Route path="duty-reports" element={<Guard perm="dutyreports.view"><DutyReports /></Guard>} />
          <Route path="offices" element={<Guard perm="team.view" area="dashboard.offices.view"><Offices /></Guard>} />
          <Route path="radio-codes" element={<Guard perm="radio.view" area="dashboard.radio.view"><RadioCodes /></Guard>} />
          <Route path="teamchance" element={<Guard perm="teamchance.view" area="dashboard.teamchance.view"><TeamChance /></Guard>} />
          <Route path="me/settings" element={<Guard perm="dashboard.view"><PersonalSettings /></Guard>} />
          <Route path="cad" element={<Guard perm="cad.view" area="dashboard.cad.view"><CadLayout /></Guard>}>
            <Route index element={<Guard perm="cad.view"><CadDashboard /></Guard>} />
            <Route path="incidents" element={<Guard perm="cad.view"><CadIncidents /></Guard>} />
            <Route path="map" element={<Guard perm="cad.view"><CadMapPage /></Guard>} />
            <Route path="units" element={<Guard perm="cad.view"><CadUnits /></Guard>} />
            <Route path="radio" element={<Guard perm="cad.view"><CadRadio /></Guard>} />
            <Route path="calls" element={<Guard perm="cad.view"><CadCalls /></Guard>} />
            <Route path="erlc" element={<Guard perm="cad.view_erlc"><ErlcLive /></Guard>} />
            <Route path="team" element={<Guard perm="cad.view"><CadTeam /></Guard>} />
            <Route path="cross-server" element={<Guard perm="cad.view"><CadCrossServer /></Guard>} />
            <Route path="logs" element={<Guard perm="cad.view_logs"><CadLogs /></Guard>} />
            <Route path="settings" element={<Guard perm="cad.view"><CadSettings /></Guard>} />
          </Route>
          <Route path="dispatch" element={<Guard perm="dispatch.view"><Dispatch /></Guard>} />
          <Route path="support-tickets" element={<Guard perm="ticket.view" area="dashboard.tickets.view"><SupportTickets /></Guard>} />
          <Route path="voice-support" element={<Navigate to="/offices#support" replace />} />
          <Route path="support-tickets/:id" element={<Guard perm="ticket.view" area="dashboard.tickets.view"><TicketDetail /></Guard>} />
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
          <Route path="evidence/*" element={<Navigate to="/dashboard" replace />} />
          <Route path="personnel" element={<Guard perm="personnel.view"><PersonnelOverview /></Guard>} />
          <Route path="personnel/:id" element={<Guard perm="personnel.view"><PersonnelFile /></Guard>} />
          <Route path="promotions" element={<Guard perm="promotion.view"><Promotions /></Guard>} />
          <Route path="trainings" element={<Guard perm="training.view"><Trainings /></Guard>} />
          <Route path="certificates/:no" element={<Guard perm="dashboard.view"><Certificate /></Guard>} />
          <Route path="announcements" element={<Guard perm="announcements.view"><HrComms /></Guard>} />
          <Route path="service-numbers" element={<Guard perm="dienstnummer.view"><ServiceNumbers /></Guard>} />
          <Route path="admin/personnel" element={<Guard perm="personnel.view" area="dashboard.settings.view"><HrSettings /></Guard>} />
          <Route path="applications" element={<Guard perm="applications.view" area="dashboard.applications.view"><Applications /></Guard>} />
          <Route path="applications/analytics" element={<Navigate to="/analytics?tab=bewerbungen" replace />} />
          <Route path="applications/:id" element={rec('applications', 'applications.view')} />
          <Route path="qualifications" element={<Guard perm="qualifications.view" area="dashboard.applications.view"><Qualifications /></Guard>} />
          <Route path="academy" element={<Guard perm="academy.view"><Academy /></Guard>} />
          <Route path="communication" element={<Guard perm="communication.view"><Communication /></Guard>} />
          <Route path="analytics" element={<Guard><AnalyticsGate /></Guard>} />
          <Route path="admin/users" element={<Guard perm="users.view" area="dashboard.settings.view"><Users /></Guard>} />
          <Route path="admin/roles" element={<Guard perm="roles.view" area="dashboard.settings.view"><Roles /></Guard>} />
          <Route path="admin/overrides" element={<Navigate to="/admin/users" replace />} />
          <Route path="admin/permissions" element={<Navigate to="/admin/roles" replace />} />
          <Route path="admin/audit" element={<Guard perm="audit.view" area="dashboard.logs.view"><Audit /></Guard>} />
          <Route path="admin/shifts" element={<Guard perm="settings.view"><Shifts /></Guard>} />
          <Route path="admin/servers" element={<Guard perm="settings.view"><ServerLinks /></Guard>} />
          <Route path="admin/embeds" element={<Guard perm="settings.view"><Embeds /></Guard>} />
          <Route path="admin/welcome" element={<Guard perm="settings.view"><WelcomeSettings /></Guard>} />
          <Route path="admin/leave" element={<Guard perm="settings.view"><LeaveSettings /></Guard>} />
          <Route path="leave" element={<Guard perm="leave.request"><Leave /></Guard>} />
          <Route path="admin/legal-codes" element={<Guard perm="settings.view"><LegalCodes /></Guard>} />
          <Route path="admin/settings" element={<Guard perm="settings.view" area="dashboard.settings.view"><Settings /></Guard>} />
          <Route path="admin/studio" element={<Guard perm="studio.view" area="dashboard.settings.view"><Studio /></Guard>} />
          <Route path="*" element={<div className="py-16 text-center text-muted">404 – Seite nicht gefunden</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
