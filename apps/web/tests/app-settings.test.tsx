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
    const pending = screen.getByLabelText('Kanal für offene Einsendungen');
    await u.selectOptions(pending, '200000000000000002');
    await u.selectOptions(screen.getByLabelText('Kanal für angenommene Einsendungen'), '200000000000000003');
    expect(latest).toMatchObject({ channelId: '200000000000000002', acceptedChannelId: '200000000000000003' });
    // Rollen: Auswahl nach Namen, Anzeige als Chip, entfernen
    await u.selectOptions(screen.getByLabelText('Erforderliche Rollen'), '300000000000000001');
    await u.click(within(screen.getByRole('radiogroup', { name: 'Erforderliche Rollen Abgleich' })).getByRole('radio', { name: 'Hat alle Rollen' }));
    expect(latest!.settings.roles.required).toEqual({ ids: ['300000000000000001'], mode: 'ALL' });
    expect(screen.getByRole('button', { name: 'Rolle Bürger entfernen' })).toBeTruthy(); // als Chip angezeigt
    await u.selectOptions(screen.getByLabelText('Ping-Rollen'), '300000000000000002');
    expect(latest!.pingRoleIds).toEqual(['300000000000000002']);
    await u.click(screen.getByRole('button', { name: 'Rolle Bürger entfernen' }));
    expect(latest!.settings.roles.required.ids).toEqual([]);
    // Nachricht mit Variable
    const accepted = screen.getByLabelText('Nachricht bei Annahme');
    await u.clear(accepted);
    await u.type(accepted, 'Willkommen ');
    await u.click(screen.getAllByRole('button', { name: 'Variablen anzeigen' })[0]!);
    await u.click(screen.getByRole('button', { name: '{applicationName}' }));
    expect(latest!.settings.messages.accepted).toBe('Willkommen {applicationName}');
    // Enabled, Staff Threads, Cooldown 14 Tage, Zeitlimit 1 Std.
    await u.click(screen.getByRole('switch', { name: 'Aktiviert' }));
    await u.click(screen.getByRole('switch', { name: 'Team-Threads' }));
    await u.clear(screen.getByLabelText('Wartezeit Tage'));
    await u.type(screen.getByLabelText('Wartezeit Tage'), '14');
    await u.clear(screen.getByLabelText('Zeitlimit Stunden'));
    await u.type(screen.getByLabelText('Zeitlimit Stunden'), '1');
    expect(latest).toMatchObject({ enabled: false, settings: { staffThreads: true, cooldownMinutes: 14 * 1440, timeLimitMinutes: 60 } });
  });
});
