import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { defaultServerConfig } from '@enrp/shared';
import { AuthProvider } from '../src/lib/auth';
import { ServerSettings } from '../src/pages/admin/ServerSettings';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const me = { id: 'u1', username: 'admin', displayName: 'Admin', robloxUserId: null, robloxUsername: null, roles: [], permissions: ['dashboard.view', 'servers.view', 'servers.manage'], lastLogin: null };
const GUILD = '100000000000000001';
const SID = '11111111-1111-4111-8111-111111111111';
const config = (canManage: boolean) => ({
  server: { id: SID, guildId: GUILD, name: 'Server A', status: 'ACTIVE', archivedAt: null },
  config: { data: defaultServerConfig('Server A'), version: 0, setupStep: 0, setupCompletedAt: null, saved: false, updatedAt: null },
  assets: [],
  bot: { present: true, guildName: 'Server A', icon: null, channels: 3, roles: 2, permissions: { viewChannel: true }, missing: ['sendMessages'] },
  canManage,
});
afterEach(() => vi.restoreAllMocks());
window.scrollTo = () => undefined;

function mount(path: string, canManage = true, brandingStatus = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    const u = String(url); calls.push({ url: u, init });
    if (u.includes('/auth/me')) return json(200, me);
    if (u.includes(`/servers/branding/`)) return brandingStatus === 200 ? json(200, { serverId: SID }) : json(brandingStatus, { error: { code: 'NOT_FOUND', message: 'Server nicht gefunden.' } });
    if (u.endsWith(`/servers/${SID}/config`) && init?.method === 'PUT') return json(200, { version: 1 });
    if (u.endsWith(`/servers/${SID}/config`)) return json(200, config(canManage));
    return json(200, []);
  });
  render(
    <MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider>
      <Routes><Route path="/servers/:guildId/settings" element={<ServerSettings />} /><Route path="/servers/:guildId/setup" element={<ServerSettings setup />} /></Routes>
    </AuthProvider></QueryClientProvider></MemoryRouter>,
  );
  return calls;
}

describe('server settings', () => {
  it('shows a live preview of unsaved changes and saves with the loaded version', async () => {
    const calls = mount(`/servers/${GUILD}/settings`);
    const name = await screen.findByLabelText('Servername (Anzeige)');
    fireEvent.change(screen.getByLabelText('Dashboard-Titel'), { target: { value: 'Willkommen in Emden' } });
    expect(screen.getByText('Willkommen in Emden')).toBeTruthy(); // Vorschau
    fireEvent.change(name, { target: { value: '' } });
    expect((screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Bitte einen Namen angeben.')).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Stadt Emden' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await vi.waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.init?.method === 'PUT')!;
    const body = JSON.parse(String(put.init!.body)) as { version: number; data: { general: { displayName: string; dashboardTitle: string } } };
    expect(body.version).toBe(0);
    expect(body.data.general).toMatchObject({ displayName: 'Stadt Emden', dashboardTitle: 'Willkommen in Emden' });
    // Gespeichert wird über die vom Server ermittelte Server-ID, nicht über die Guild-ID aus der Adresse
    expect(put.url).toContain(`/servers/${SID}/config`);
  });

  it('is read-only without servers.manage', async () => {
    mount(`/servers/${GUILD}/settings`, false);
    await screen.findByText(/Nur Ansicht/);
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
  });

  it('a foreign or unknown server reveals nothing', async () => {
    mount(`/servers/999999999999999999/settings`, true, 404);
    await screen.findByText('Server nicht gefunden oder kein Zugriff.');
  });

  it('wizard shows progress and the missing bot permissions', async () => {
    mount(`/servers/${GUILD}/setup`);
    await screen.findByText(/Schritt 1 von 8/);
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    await screen.findByText(/Dem Bot fehlen Rechte: Nachrichten senden/);
    expect(screen.getByText(/Schritt 2 von 8/)).toBeTruthy();
  });
});
