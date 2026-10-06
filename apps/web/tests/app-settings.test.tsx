import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/lib/auth';
import { ApplicationSettingsEditor, defaultAppSettings, type AppCommon } from '../src/components/ApplicationSettings';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const me = { id: 'u1', username: 'admin', displayName: 'Admin', robloxUserId: null, robloxUsername: null, roles: ['System Administrator'], permissions: ['dashboard.view'], lastLogin: null };
const guilds = [{ id: '100000000000000001', name: 'EN Polizei', icon: null, channels: [
  { id: '200000000000000001', name: 'bewerbungen', type: 'category', parentId: null, position: 0 },
  { id: '200000000000000002', name: 'streifen-bewerbung', type: 'text', parentId: '200000000000000001', position: 1 },
  { id: '200000000000000003', name: 'angenommen', type: 'text', parentId: '200000000000000001', position: 2 },
], roles: [{ id: '300000000000000001', name: 'Bürger', color: 0x3b82f6, position: 2 }, { id: '300000000000000002', name: 'Polizei-Anwärter', color: 0, position: 3 }] }];
afterEach(() => vi.restoreAllMocks());

let latest: AppCommon | undefined;
function Host() {
  const [v, setV] = useState<AppCommon>({ enabled: true, channelId: '', acceptedChannelId: '', deniedChannelId: '', pingRoleIds: [], settings: defaultAppSettings() });
  const [name, setName] = useState('Polizeianwärter');
  latest = v;
  return <ApplicationSettingsEditor value={v} onChange={(p) => setV({ ...v, ...p })} name={name} onName={setName} pendingHint="x" />;
}

describe('application settings like Appy', () => {
  it('channels and roles are picked by name; match mode, messages with variables, cooldown and time limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => (String(url).includes('/auth/me') ? json(200, me) : String(url).includes('/discord/guilds') ? json(200, guilds) : json(404, {})));
    const u = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider><Host /></AuthProvider></QueryClientProvider>);
    await screen.findAllByRole('option', { name: /streifen-bewerbung/ }); // Server-Liste geladen
    const pending = screen.getByLabelText('Pending submission channel');
    await u.selectOptions(pending, '200000000000000002');
    await u.selectOptions(screen.getByLabelText('Accepted submission channel'), '200000000000000003');
    expect(latest).toMatchObject({ channelId: '200000000000000002', acceptedChannelId: '200000000000000003' });
    // Rollen: Auswahl nach Namen, Anzeige als Chip, entfernen
    await u.selectOptions(screen.getByLabelText('Required Roles'), '300000000000000001');
    await u.click(within(screen.getByRole('radiogroup', { name: 'Required Roles match mode' })).getByRole('radio', { name: 'Has all roles' }));
    expect(latest!.settings.roles.required).toEqual({ ids: ['300000000000000001'], mode: 'ALL' });
    expect(screen.getByRole('button', { name: 'Remove role Bürger' })).toBeTruthy(); // als Chip angezeigt
    await u.selectOptions(screen.getByLabelText('Ping Roles'), '300000000000000002');
    expect(latest!.pingRoleIds).toEqual(['300000000000000002']);
    await u.click(screen.getByRole('button', { name: 'Remove role Bürger' }));
    expect(latest!.settings.roles.required.ids).toEqual([]);
    // Nachricht mit Variable
    const accepted = screen.getByLabelText('Accepted Message');
    await u.clear(accepted);
    await u.type(accepted, 'Willkommen ');
    await u.click(screen.getAllByRole('button', { name: 'Show variables' })[0]!);
    await u.click(screen.getByRole('button', { name: '{applicationName}' }));
    expect(latest!.settings.messages.accepted).toBe('Willkommen {applicationName}');
    // Enabled, Staff Threads, Cooldown 14 Tage, Zeitlimit 1 Std.
    await u.click(screen.getByRole('switch', { name: 'Enabled' }));
    await u.click(screen.getByRole('switch', { name: 'Staff Threads' }));
    await u.clear(screen.getByLabelText('Cooldown days'));
    await u.type(screen.getByLabelText('Cooldown days'), '14');
    await u.clear(screen.getByLabelText('Time limit hours'));
    await u.type(screen.getByLabelText('Time limit hours'), '1');
    expect(latest).toMatchObject({ enabled: false, settings: { staffThreads: true, cooldownMinutes: 14 * 1440, timeLimitMinutes: 60 } });
  });
});
