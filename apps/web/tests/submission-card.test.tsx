import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/lib/auth';
import { ago, SubmissionCard } from '../src/components/Submission';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
const me = { id: 'u1', username: 'admin', displayName: 'Admin', robloxUserId: null, robloxUsername: null, roles: [], permissions: ['dashboard.view', 'qualifications.view'], lastLogin: null };
afterEach(() => vi.restoreAllMocks());

describe('Einsendung wie bei Appy', () => {
  it('relative time in German', () => {
    const now = Date.parse('2026-10-09T12:00:00Z');
    expect(ago('2026-10-04T10:00:00Z', now)).toBe('vor 5 Tagen');
    expect(ago('2026-07-15T10:00:00Z', now)).toBe('vor 2 Monaten');
    expect(ago('2026-10-09T11:59:30Z', now)).toBe('gerade eben');
  });

  it('collapsed row with name, application and status; expands to answers and earlier applications', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => (String(url).includes('/auth/me') ? json(me) : String(url).includes('/qualifications/history')
      ? json([{ id: 'a1', number: 'Q-1', status: 'OPEN', createdAt: '2026-10-04T10:15:00Z', decisionReason: null, unitName: 'Flugstaffel' }, { id: 'a0', number: 'Q-0', status: 'REJECTED', createdAt: '2026-10-04T10:06:00Z', decisionReason: 'zu früh', unitName: 'Flugstaffel' }])
      : json({})));
    const u = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider>
      <SubmissionCard id="a1" name="john45346" appName="Flugstaffel" status="OPEN" discordId="1105652647068971028" createdAt="2026-10-04T10:15:26Z"
        answers={[{ question: 'Welchen Rang hast du?', answer: 'Kommissar' }]} actions={<button type="button">Annehmen</button>} />
    </AuthProvider></QueryClientProvider>);
    const head = screen.getByRole('button', { expanded: false });
    expect(head.textContent).toContain('john45346s Bewerbung für „Flugstaffel“');
    expect(head.textContent).toContain('1105652647068971028');
    expect(screen.queryByText('Kommissar')).toBeNull();
    await u.click(head);
    expect(screen.getByText('1. Welchen Rang hast du?')).toBeTruthy();
    expect(screen.getByText('Kommissar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annehmen' })).toBeTruthy();
    // Verlauf: frühere Bewerbung, die aktuelle wird nicht doppelt gezeigt
    expect(await screen.findByText('↳ zu früh')).toBeTruthy();
    expect(screen.queryByText(/Q-1 ·/)).toBeNull();
  });
});
