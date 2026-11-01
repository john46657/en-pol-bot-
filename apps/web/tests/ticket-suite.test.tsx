import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../src/lib/auth';
import { SupportTickets } from '../src/pages/tickets/SupportTickets';
import { TicketDetail } from '../src/pages/tickets/TicketDetail';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
const me = { id: 'u1', username: 'lead', displayName: 'Lead', robloxUserId: null, robloxUsername: null, roles: ['Ticket Leitung'], permissions: ['dashboard.view', 'dashboard.tickets.view', 'ticket.view', 'ticket.claim', 'ticket.close', 'ticket.forward', 'ticket.remind', 'ticket.automation', 'ticket.internal_notes', 'ticket.settings'], lastLogin: null };
const ratings = { scale: 10, count: 2, average: 7.5, positive: 1, negative: 0, perStaff: [], perCategory: [], trend: [{ month: '2026-10', count: 2, average: 7.5 }] };
const stats = {
  total: 3, open: 2, closed: 1, archived: 0, inProgress: 1, unassigned: 1, today: 1, week: 2, month: 3, escalations: 0,
  avgFirstResponseMinutes: 12, medianFirstResponseMinutes: 10, p90FirstResponseMinutes: 30, avgCloseMinutes: 90, medianCloseMinutes: 80, p90CloseMinutes: 150,
  perCategory: [{ id: 'c1', name: 'Technik', emoji: '🛠️', total: 3, open: 2, capacity: 2, capacityAction: 'BLOCK', load: 100, level: 'full' }],
  perStaff: [{ discordId: '111111111111111111', tickets: 2, closed: 1, closedBy: 1, avgFirstResponseMinutes: 10, medianFirstResponseMinutes: 10 }],
  perDay: Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, created: i % 3, closed: 0 })), perWeek: [{ week: '2026-10-26', created: 3, closed: 1 }],
  heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)), timezone: 'Europe/Berlin',
  leaderboards: { handled: [{ discordId: '111111111111111111', value: 2 }], closed: [], fastest: [{ discordId: '111111111111111111', value: 10 }], rated: [] },
  ratings, names: { '111111111111111111': 'Anna' },
};
const detail = {
  id: 't1', number: '0001', ref: 'EMD-000001', name: 'ticket-max', subject: null, guildId: '100000000000000001', channelId: '200000000000000001', creatorId: '300000000000000001', creatorName: 'Max', claimers: [], locked: false,
  createdAt: '2026-11-01T10:00:00Z', closedAt: null, deletedAt: null, escalatedAt: null, closeReason: null, closedByName: null, closedById: null, firstResponseAt: null, lastActivityAt: '2026-11-01T10:00:00Z', deleteAt: null,
  answers: [], closeAnswers: [], closeForm: [{ id: 'reason', label: 'Was wurde gelöst?', type: 'SHORT', required: true, options: [] }],
  category: { id: 'c1', name: 'Technik', emoji: null, claimMode: 'SINGLE', closeReasonMode: 'OPTIONAL', closeReasonSource: 'BOTH', allowReopen: true, confidential: false, active: true },
  department: null, transcriptUrl: '', formVersion: null, archivedAt: null, resolvedAt: null, waitingSeconds: 0, waitingSince: null,
  sla: { firstDueAt: null, resolveDueAt: null, firstOverdue: false, resolveOverdue: false, paused: false },
  automation: { autoCloseMinutes: 0, autoCloseWarnMinutes: 0, creatorReminderMinutes: 0, teamReminderMinutes: 0, staffAlertMinutes: 0, autoUnclaimMinutes: 0, autoClaimOnMessage: false, closeRequestCloses: true, closeRequestTimeoutMinutes: 0, noResponseMinutes: 0, active: false, disabled: false, pausedUntil: '2026-11-02T10:00:00Z', source: 'PANEL' },
  panel: { id: 'p1', name: 'Hilfe' }, closeRequest: { at: '2026-11-01T11:00:00Z', by: '111111111111111111', approvals: ['creator:300000000000000001'], approvers: 'BOTH' },
  status: { id: 's', name: 'Offen', emoji: '🟢', color: 0x22c55e, kind: 'OPEN' }, priority: null, access: [], messages: [], notes: [], logs: [{ id: 'l1', action: 'forwarded', actorName: 'Lead', detail: { from: 'A', to: 'B' }, createdAt: '2026-11-01T10:30:00Z' }],
  transcripts: [], rating: null, ratingScale: 10, names: {},
};
const config = { categories: [{ id: 'c1', name: 'Technik', emoji: null, active: true }], panels: [], statuses: [], priorities: [], reasons: [], departments: [], settings: { ratingScale: 10 } };
const route = (u: string) => (u.includes('/auth/me') ? me : u.includes('/support-tickets/config') ? config : u.includes('/support-tickets/stats') ? stats : u.includes('/support-tickets/ratings') ? { total: 0, items: [], summary: ratings, names: {} } : u.includes('/options') ? { closed: false, statuses: [], priorities: [], categories: [{ id: 'c2', name: 'Support', emoji: null }], departments: [], reasons: [], close: { mode: 'OPTIONAL', source: 'BOTH' } } : u.match(/\/support-tickets\/t1$/) ? detail : u.includes('/discord/guilds') ? [] : {});
const wrap = (path: string, el: React.ReactNode, pattern = '*') => render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider><Routes><Route path={pattern} element={el} /></Routes></AuthProvider></QueryClientProvider></MemoryRouter>);
afterEach(() => vi.restoreAllMocks());

describe('ticket center tabs', () => {
  it('overview shows open/closed/in progress/unassigned, response times, rating and load per category', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => json(route(String(u))));
    wrap('/support-tickets?tab=overview', <SupportTickets />);
    await screen.findByText('Nicht zugewiesen');
    expect(screen.getByText('7.5 / 10')).toBeTruthy();
    expect(screen.getByText(/100% · voll ausgelastet/)).toBeTruthy();
  });
  it('statistics show median/p90, per day/week, heatmap and leaderboards', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => json(route(String(u))));
    wrap('/support-tickets?tab=stats', <SupportTickets />);
    await screen.findByText('p90 erste Antwort');
    expect(screen.getByText('Median Bearbeitungszeit')).toBeTruthy();
    expect(screen.getByLabelText('Neue Tickets nach Wochentag und Uhrzeit')).toBeTruthy();
    expect(screen.getByText('🏆 Meiste Tickets')).toBeTruthy();
    expect(screen.getAllByText(/Anna/).length).toBeGreaterThan(0);
  });
  it('ratings tab shows the average on the configured scale and the trend', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => json(route(String(u))));
    wrap('/support-tickets?tab=ratings', <SupportTickets />);
    await screen.findByText('Bewertungsverlauf (je Monat)');
    expect(screen.getByText(/Skala 1–10/)).toBeTruthy();
  });
});

describe('ticket detail', () => {
  it('shows close request state, paused automation and the new actions; close dialog contains the close form', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => json(route(String(u))));
    wrap('/support-tickets/t1', <TicketDetail />, '/support-tickets/:id');
    await screen.findByText(/Schließungsanfrage seit/);
    expect(screen.getByText(/bisher bestätigt: Ersteller/)).toBeTruthy();
    expect(screen.getByText(/Automatik für dieses Ticket pausiert/)).toBeTruthy();
    for (const b of ['📨 Weiterleiten', '⏰ Ersteller erinnern', '⚙️ Automatik']) expect(screen.getByRole('button', { name: b })).toBeTruthy();
    expect(screen.getByText('Weitergeleitet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '🔒 Schließen' }));
    expect(await screen.findByLabelText('Was wurde gelöst? *')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    fireEvent.click(screen.getByRole('button', { name: '📨 Weiterleiten' }));
    expect(await screen.findByText('Ticket weiterleiten')).toBeTruthy();
  });
});
