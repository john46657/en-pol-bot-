import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AI_REVIEW_CRITERIA } from '@enrp/shared';
import { AiReviewPanel } from '../src/components/AiReviewPanel';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const ID = '3f1c2a4e-1111-4222-8333-944455556666';
const result = {
  gesamt: { einstufung: 'solide', punkte: 6, begruendung: 'Nachvollziehbare Antworten.' },
  kriterien: AI_REVIEW_CRITERIA.map((c) => ({ kriterium: c.key, bewertung: 'gut', begruendung: 'passt' })),
  staerken: ['Klare Motivation'], schwaechen: ['Wenig Erfahrung'], fehlende_angaben: [], widersprueche: [], rueckfragen: ['Wann bist du aktiv?'], unsicherheiten: [],
  empfehlung: 'rueckfragen_noetig', empfehlung_begruendung: 'Verfügbarkeit klären.',
};
const review = (status: string) => ({ id: 'r1', status, result: status === 'DONE' ? result : null, error: null, provider: 'gemini', model: 'gemini-test', requestedByName: 'Prüferin', via: 'WEB', createdAt: '2026-10-23T10:00:00.000Z', finishedAt: status === 'DONE' ? '2026-10-23T10:00:10.000Z' : null, truncated: false });
const state = (r: ReturnType<typeof review> | null, o: Record<string, unknown> = {}) => ({ number: 'APP-1', available: true, reason: null, review: r, lastDone: r?.status === 'DONE' ? r : null, stale: false, ...o });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
afterEach(() => vi.restoreAllMocks());

describe('KI-Bewerbungsprüfung im Dashboard', () => {
  it('opening only loads the stored state; the analysis starts on click, shows progress and the result', async () => {
    let done = false;
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (init?.method === 'POST') return json(202, state(review('RUNNING'), { started: true }));
      return json(200, done ? state(review('DONE')) : calls.some((c) => c.startsWith('POST')) ? (done = true, state(review('RUNNING'))) : state(null));
    });
    const u = userEvent.setup();
    wrap(<AiReviewPanel kind="police" id={ID} />);
    const btn = await screen.findByRole('button', { name: 'KI-Bewerbung prüfen' });
    expect(calls).toEqual([`GET /api/v1/applications/${ID}/ai-review`]); // kein automatischer Start
    await u.click(btn);
    expect(await screen.findByRole('status')).toHaveTextContent('Die KI prüft die Bewerbung');
    expect(calls).toContain(`POST /api/v1/applications/${ID}/ai-review`);
    expect(await screen.findByText(/Empfehlung: Rückfragen nötig/, {}, { timeout: 6000 })).toBeTruthy();
    expect(screen.getByText(/Richtwert 6\/10/)).toBeTruthy();
    expect(screen.getByText('Klare Motivation')).toBeTruthy();
    expect(screen.getByText(/Modell gemini-test/)).toBeTruthy();
    expect(screen.getByText(/kein Urteil/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Erneut analysieren' })).toBeTruthy();
  }, 10_000);

  it('explains when no key is configured and marks stale results', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(200, state(null, { available: false, reason: 'Die KI-Prüfung ist nicht eingerichtet: Auf dem Server ist kein GEMINI_API_KEY hinterlegt.' })));
    const { unmount } = wrap(<AiReviewPanel kind="qualification" id={ID} />);
    expect(await screen.findByText(/kein GEMINI_API_KEY/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'KI-Bewerbung prüfen' })).toBeNull();
    unmount();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(200, state(review('DONE'), { stale: true })));
    wrap(<AiReviewPanel kind="police" id={ID} />);
    expect(await screen.findByText(/möglicherweise veraltet/)).toBeTruthy();
  });
});
