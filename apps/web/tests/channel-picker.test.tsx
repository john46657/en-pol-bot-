import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/lib/auth';
import { ChannelPicker } from '../src/components/DiscordPickers';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const me = { id: 'u1', username: 'admin', displayName: 'Admin', robloxUserId: null, robloxUsername: null, roles: [], permissions: ['dashboard.view'], lastLogin: null };
const guilds = [{ id: '100000000000000001', name: 'EN Polizei', icon: null, roles: [], channels: [{ id: '200000000000000002', name: 'systemprotokolle', type: 'text', parentId: null, position: 1 }] }];
afterEach(() => vi.restoreAllMocks());

describe('ChannelPicker', () => {
  it('a chosen channel can be removed again with one click', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => (String(url).includes('/auth/me') ? json(200, me) : String(url).includes('/discord/guilds') ? json(200, guilds) : json(404, {})));
    const onChange = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider><ChannelPicker ariaLabel="Kanal" value="200000000000000002" onChange={onChange} /></AuthProvider></QueryClientProvider>);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Kanal entfernen' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
