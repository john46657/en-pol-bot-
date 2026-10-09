import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../src/lib/auth';
import { Settings } from '../src/pages/admin/Settings';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const me = { id: 'u1', username: 'admin', displayName: 'Admin', robloxUserId: null, robloxUsername: null, roles: ['System Administrator'], permissions: ['dashboard.view', 'settings.view', 'settings.manage'], lastLogin: null };
const guilds = [{ id: '100000000000000001', name: 'EN Polizei', icon: null, channels: [{ id: '200000000000000002', name: 'x', type: 'text', parentId: null, position: 1 }], roles: [{ id: '300000000000000001', name: 'B', color: 0, position: 2 }] }];
const settings = { settings: { 'org.name': 'EN', 'discord.channels': { dispatch: '200000000000000002', dutyRole: '300000000000000001', guildId: '100000000000000001' }, 'team.structure': { teams: ['A'] }, 'auth.discord': { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [] } }, allowedKeys: [], serverScoped: ['team.structure'] };
afterEach(() => vi.restoreAllMocks());

describe('settings page', () => {
  // Speichern unter „Personal“ legte team.structure früher ohne `offices` an – die Seite stürzte dann ab (weiße Seite)
  it('renders with a team structure without offices', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => { const u = String(url); return u.includes('/auth/me') ? json(200, me) : u.includes('/discord/guilds') ? json(200, guilds) : u.includes('/admin/settings') ? json(200, settings) : u.includes('/roles') ? json(200, []) : json(200, {}); });
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider><Settings /></AuthProvider></QueryClientProvider></MemoryRouter>);
    await screen.findByText('Discord-Bot-Kanäle');
    expect(screen.getByRole('button', { name: 'A entfernen' })).toBeTruthy();
  });
});
