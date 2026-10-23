import { describe, expect, it } from 'vitest';
import { AI_REVIEW_CRITERIA } from '@enrp/shared';
import { BotApiError, type Api } from '../src/api';
import { aiPoll, aiReviewReply } from '../src/commands/ai-review';
import { QUALI_INTERACTION } from '../src/commands/qualifications';
import type { Ctx } from '../src/commands/types';
import { outboxButtons } from '../src/format';

const ID = '3f1c2a4e-1111-4222-8333-944455556666';
const REVIEWER = '900000000000000010';
const result = {
  gesamt: { einstufung: 'solide', punkte: 6, begruendung: 'Nachvollziehbar, Verfügbarkeit unklar.' },
  kriterien: AI_REVIEW_CRITERIA.map((c) => ({ kriterium: c.key, bewertung: c.key === 'regelverstaendnis' ? 'nicht_beurteilbar' : 'gut', begruendung: 'x' })),
  staerken: ['Klare Motivation'], schwaechen: ['Wenig Erfahrung'], fehlende_angaben: ['Aktivitätszeiten'], widersprueche: [], rueckfragen: ['Wann bist du aktiv?'], unsicherheiten: [],
  empfehlung: 'rueckfragen_noetig', empfehlung_begruendung: 'Klären.',
};
const view = (status: string, o: Record<string, unknown> = {}) => ({ id: 'r1', status, result: status === 'DONE' ? result : null, error: status === 'FAILED' ? 'Das Nutzungslimit des KI-Dienstes ist erreicht.' : null, provider: 'gemini', model: 'gemini-test', requestedByName: 'Prüfer', via: 'DISCORD', createdAt: new Date().toISOString(), finishedAt: status === 'RUNNING' ? null : new Date().toISOString(), truncated: false, ...o });
const state = (review: unknown, o: Record<string, unknown> = {}) => ({ number: 'APP-1', dashboardUrl: 'https://dash.example/applications?q=APP-1', available: true, reason: null, review, lastDone: (review as { status?: string } | null)?.status === 'DONE' ? review : null, stale: false, ...o });

function fakeApi(handler: (method: string, path: string, body: unknown) => unknown) {
  const calls: { discordId: string; method: string; path: string; body: unknown }[] = [];
  const api: Api = {
    async asUser(discordId, method, path, body) { calls.push({ discordId, method, path, body }); const r = handler(method, path, body); if (r instanceof Error) throw r; return r as never; },
    async service() { throw new Error('not used'); },
  };
  return { api, calls };
}
const ctx = (api: Api, args: string[]): Ctx & { args: string[] } => ({ discordId: REVIEWER, opts: {}, api, args, guildId: '111111111111111111' });

describe('KI-Prüfung in Discord', () => {
  it('shows the button only when the API says a key is configured', () => {
    const p = { id: ID, discordId: '300000000000000001', dashboardUrl: 'https://x.example/applications/abc' };
    expect(outboxButtons('application.submitted', p)?.some((b) => b.id.startsWith('quali:ai:'))).toBe(false);
    expect(outboxButtons('application.submitted', { ...p, aiReview: true })?.find((b) => b.id === `quali:ai:p:${ID}`)).toMatchObject({ label: 'KI-Prüfung', emoji: '🤖' });
    expect(outboxButtons('qualification.submitted', { ...p, aiReview: true })?.some((b) => b.id === `quali:ai:q:${ID}`)).toBe(true);
  });

  it('starts the analysis as the clicking reviewer, waits and answers privately', async () => {
    aiPoll.intervalMs = 1;
    let polls = 0;
    const { api, calls } = fakeApi((m) => (m === 'POST' ? state(view('RUNNING'), { started: true }) : ++polls < 2 ? state(view('RUNNING')) : state(view('DONE'))));
    const r = await QUALI_INTERACTION.run(ctx(api, ['ai', 'p', ID]));
    expect(calls[0]).toMatchObject({ discordId: REVIEWER, method: 'POST', path: `/applications/${ID}/ai-review`, body: {} });
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
    expect(r.ephemeral).toBe(true); // nie öffentlich
    const e = r.embeds![0]!;
    expect(e.title).toBe('🤖 KI-Prüfung · APP-1');
    expect(e.description).toContain('Rückfragen nötig');
    expect(e.description).toContain('Richtwert 6/10');
    expect(e.description).toContain('kein Urteil');
    expect(e.fields?.find((f) => f.name === 'Kriterien')?.value).toContain('⚪ Verständnis der Roleplay-Regeln: nicht beurteilbar');
    expect(r.buttons?.map((b) => b.url ?? b.id)).toEqual(['https://dash.example/applications?q=APP-1']);
  });

  it('unit applications use their own route; "Neu analysieren" forces a new run', async () => {
    const { api, calls } = fakeApi(() => state(view('DONE')));
    await QUALI_INTERACTION.run(ctx(api, ['aiforce', 'q', ID]));
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/qualifications/applications/${ID}/ai-review`, body: { force: true } });
  });

  it('stale or failed results offer a new analysis and keep the last good result', () => {
    const r = aiReviewReply(state(view('FAILED'), { lastDone: view('DONE'), stale: true }) as never, 'p', ID);
    expect(r.embeds![0]!.description).toContain('möglicherweise veraltet');
    expect(r.embeds![0]!.description).toContain('Letzte Analyse fehlgeschlagen: Das Nutzungslimit');
    expect(r.buttons?.[0]).toMatchObject({ id: `quali:aiforce:p:${ID}`, label: 'Neu analysieren' });
  });

  it('still running after the wait → hint, no second start', async () => {
    aiPoll.maxMs = 0;
    const { api, calls } = fakeApi(() => state(view('RUNNING')));
    const r = await QUALI_INTERACTION.run(ctx(api, ['ai', 'p', ID]));
    expect(calls).toHaveLength(1);
    expect(r.embeds![0]!.description).toContain('läuft noch');
    aiPoll.maxMs = 60_000;
  });

  it('shows clear messages for a missing key, limits and missing rights', async () => {
    const msg = async (err: Error) => (await QUALI_INTERACTION.run(ctx(fakeApi(() => err).api, ['ai', 'p', ID]))).content;
    expect(await msg(new BotApiError(503, 'CAPABILITY_UNAVAILABLE', 'Die KI-Prüfung ist nicht eingerichtet: Auf dem Server ist kein GEMINI_API_KEY hinterlegt.'))).toContain('kein GEMINI_API_KEY');
    expect(await msg(new BotApiError(429, 'RATE_LIMITED', 'Das eingestellte Tageslimit von 50 KI-Prüfungen ist erreicht.'))).toContain('Tageslimit');
    expect(await msg(new BotApiError(403, 'PERMISSION_DENIED', 'x', undefined, 'PERMISSION', 'applications.review'))).toContain('applications.review');
    expect((await QUALI_INTERACTION.run(ctx(fakeApi(() => ({})).api, ['ai', 'x', ID]))).content).toContain('Unbekannte Aktion');
  });
});
