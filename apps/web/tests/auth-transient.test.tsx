import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthProvider, useAuth } from '../src/lib/auth';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const profile = { id: 'u1', username: 'admin', displayName: 'Admin', robloxUserId: null, robloxUsername: null, roles: [], permissions: ['dashboard.view'], lastLogin: null, servers: [] };
function Who() { const { user } = useAuth(); return <p>Hallo {user?.displayName ?? 'niemand'}</p>; }
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AuthProvider><Who /></AuthProvider></MemoryRouter></QueryClientProvider>);

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Anmeldestatus bei kurzen Serverstörungen', () => {
  for (const [label, fail] of [['502 (Panel-Proxy/Neustart)', () => json(502, {})], ['429 (Anfragelimit)', () => json(429, { code: 'RATE_LIMITED', message: 'x' })], ['Netzwerkfehler', () => Promise.reject(new TypeError('Failed to fetch'))]] as const) {
    it(`zeigt die Oberfläche weiter, wenn eine Abfrage von /auth/me fehlschlägt: ${label}`, async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let failing = false;
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => (failing ? fail() : json(200, profile)));
      mount();
      expect(await screen.findByText('Hallo Admin')).toBeInTheDocument();
      failing = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(screen.queryByText(/Server nicht erreichbar/)).toBeNull();
      expect(screen.getByText('Hallo Admin')).toBeInTheDocument();
    });
  }

  it('zeigt „Server nicht erreichbar“ nur, wenn der erste Abruf dauerhaft scheitert, und erholt sich danach selbst', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let failing = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => (failing ? json(502, {}) : json(200, profile)));
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByRole('alert').textContent).toContain('Server nicht erreichbar');
    failing = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText('Hallo Admin')).toBeInTheDocument();
  });
});
