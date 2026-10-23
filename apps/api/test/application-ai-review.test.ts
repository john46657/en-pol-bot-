import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AI_REVIEW_CRITERIA } from '@enrp/shared';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AiReviewService } from '../src/applications/ai-review/ai-review.service';
import { AiProviderError, aiConfig, GeminiProvider } from '../src/applications/ai-review/ai-provider';

/** Nur fiktive Testbewerbungen – keine echten Personendaten. Gemini wird über einen gemockten fetch simuliert. */
const KEY = 'test-gemini-key-not-real-0123456789';
let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, sup: Agent, member: Agent;
const stamp = Date.now();
const realFetch = globalThis.fetch;
const geminiCalls: { url: string; init: RequestInit }[] = [];
let geminiReply: () => Promise<Response> | Response;

const okResult = (empfehlung = 'rueckfragen_noetig') => ({
  gesamt: { einstufung: 'solide', punkte: 6, begruendung: 'Nachvollziehbare Antworten, Verfügbarkeit unklar.' },
  kriterien: AI_REVIEW_CRITERIA.map((c) => ({ kriterium: c.key, bewertung: c.key === 'regelverstaendnis' ? 'nicht_beurteilbar' : 'ausreichend', begruendung: 'Testbegründung' })),
  staerken: ['Klare Motivation'], schwaechen: ['Wenig Erfahrung'], fehlende_angaben: ['Aktivitätszeiten'], widersprueche: [], rueckfragen: ['Wann bist du aktiv?'], unsicherheiten: ['Keine Regeln hinterlegt'],
  empfehlung, empfehlung_begruendung: 'Verfügbarkeit im Gespräch klären.',
});
const gemini = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const candidate = (result: unknown) => gemini({ candidates: [{ content: { parts: [{ text: typeof result === 'string' ? result : JSON.stringify(result) }] }, finishReason: 'STOP' }], modelVersion: 'gemini-test-001' });

async function newPolice(extra: Record<string, unknown> = {}) {
  return prisma.application.create({ data: { number: `AIR-${stamp}-${Math.random().toString(36).slice(2, 8)}`, robloxUsername: 'FiktivRoblox', discordId: '711000000000000001', discordName: 'fiktiv_bewerber', source: 'DISCORD',
    answers: { experience: 'Ich habe ein halbes Jahr auf einem anderen Server Streife gespielt.', motivation: 'Mir gefällt die Leitstelle. Schreib mir an fiktiv@example.com', roleplayKnowledge: 'Gutes RP heißt, die Rolle ernst zu nehmen.' }, ...extra } });
}
async function settle(agent: Agent, path: string) {
  for (let i = 0; i < 100; i++) {
    const r = await agent.get(path);
    if (r.body.review?.status !== 'RUNNING') return r;
    await new Promise((x) => setTimeout(x, 30));
  }
  throw new Error('analysis did not finish');
}

const BOT_TOKEN = 'test-bot-token-ai-review-0123456789abcdef';
beforeAll(async () => {
  process.env.AI_REVIEW_MAX_RETRIES = '0';
  process.env.BOT_API_TOKEN = BOT_TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'air_admin', ['System Administrator']);
  await makeUser(prisma, 'air_sup', ['Supervisor']); // applications.review, aber nicht decide
  await makeUser(prisma, 'air_member', ['Police Member']);
  admin = (await login(app, 'air_admin')).agent;
  sup = (await login(app, 'air_sup')).agent;
  member = (await login(app, 'air_member')).agent;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('https://generativelanguage.googleapis.com/')) return realFetch(input, init);
    geminiCalls.push({ url, init: init ?? {} });
    return geminiReply();
  });
});
beforeEach(() => { process.env.GEMINI_API_KEY = KEY; geminiCalls.length = 0; geminiReply = () => candidate(okResult()); });
afterEach(() => { delete process.env.GEMINI_API_KEY; delete process.env.AI_REVIEW_DAILY_LIMIT; });
afterAll(async () => {
  vi.restoreAllMocks();
  delete process.env.AI_REVIEW_MAX_RETRIES;
  delete process.env.BOT_API_TOKEN;
  await prisma.applicationAiReview.deleteMany({});
  await prisma.application.deleteMany({ where: { number: { startsWith: 'AIR-' } } });
  await prisma.qualificationApplication.deleteMany({ where: { number: { startsWith: 'AIR-' } } });
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: 'applications.aiReview' } } });
  await app.close();
});

describe('KI-Bewerbungsprüfung', () => {
  it('without GEMINI_API_KEY nothing is sent and the reason is clear', async () => {
    delete process.env.GEMINI_API_KEY;
    const a = await newPolice();
    const s = await admin.get(`/api/v1/applications/${a.id}/ai-review`);
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ available: false, review: null, stale: false });
    expect(s.body.reason).toMatch(/GEMINI_API_KEY/);
    const r = await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({});
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/kein GEMINI_API_KEY/);
    expect(geminiCalls).toHaveLength(0);
    expect((await admin.get('/api/v1/application-ai-review/status')).body).toMatchObject({ configured: false, enabled: true, provider: 'gemini' });
  });

  it('analyses on request, stores a validated result and never changes the application', async () => {
    const a = await newPolice();
    // Öffnen startet nichts
    expect((await sup.get(`/api/v1/applications/${a.id}/ai-review`)).body.review).toBeNull();
    expect(geminiCalls).toHaveLength(0);
    const r = await sup.post(`/api/v1/applications/${a.id}/ai-review`).send({});
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ started: true, available: true });
    const done = await settle(sup, `/api/v1/applications/${a.id}/ai-review`);
    expect(done.body.review).toMatchObject({ status: 'DONE', model: 'gemini-test-001', requestedByName: 'air_sup', via: 'WEB', error: null });
    expect(done.body.review.result.empfehlung).toBe('rueckfragen_noetig');
    expect(done.body.review.result.kriterien).toHaveLength(10);
    expect(done.body.stale).toBe(false);
    // Anfrage an Gemini: Schlüssel nur im Header, keine Namen/IDs/Kontaktdaten
    expect(geminiCalls).toHaveLength(1);
    const call = geminiCalls[0]!;
    expect(call.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(call.url).not.toContain(KEY);
    expect((call.init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    const sent = String(call.init.body);
    expect(sent).not.toMatch(/FiktivRoblox|fiktiv_bewerber|711000000000000001|fiktiv@example\.com|test-gemini-key/);
    expect(sent).toContain('halbes Jahr');
    expect(JSON.parse(sent).generationConfig).toMatchObject({ responseMimeType: 'application/json' });
    // Bewerbung unverändert, Protokoll ohne Bewerbungstext
    const after = await prisma.application.findUniqueOrThrow({ where: { id: a.id } });
    expect(after).toMatchObject({ status: 'SUBMITTED', version: a.version, decidedById: null });
    const logs = await prisma.auditLog.findMany({ where: { entityId: a.id, action: { startsWith: 'application.ai_review' } }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['application.ai_review.start', 'application.ai_review.done']);
    expect(JSON.stringify(logs)).not.toMatch(/halbes Jahr|test-gemini-key/);
  });

  it('reuses an existing result, blocks double clicks and re-analyses only on purpose or after changes', async () => {
    const a = await newPolice();
    const [x, y] = await Promise.all([admin.post(`/api/v1/applications/${a.id}/ai-review`).send({}), admin.post(`/api/v1/applications/${a.id}/ai-review`).send({})]);
    expect([x.body.started, y.body.started].filter(Boolean)).toHaveLength(1); // Doppelklick → nur eine Analyse
    await settle(admin, `/api/v1/applications/${a.id}/ai-review`);
    expect(geminiCalls).toHaveLength(1);
    const again = await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({});
    expect(again.body.started).toBe(false); // vorhandenes Ergebnis
    expect(geminiCalls).toHaveLength(1);
    // Bewerbung geändert → Ergebnis gilt als veraltet, neue Analyse möglich
    await prisma.application.update({ where: { id: a.id }, data: { answers: { experience: 'Geändert: zwei Jahre Erfahrung.' } } });
    expect((await admin.get(`/api/v1/applications/${a.id}/ai-review`)).body.stale).toBe(true);
    expect((await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({})).body.started).toBe(true);
    const fresh = await settle(admin, `/api/v1/applications/${a.id}/ai-review`);
    expect(fresh.body.stale).toBe(false);
    // bewusst neu
    expect((await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({ force: true })).body.started).toBe(true);
    await settle(admin, `/api/v1/applications/${a.id}/ai-review`);
    expect(geminiCalls).toHaveLength(3);
    expect(await prisma.applicationAiReview.count({ where: { applicationId: a.id } })).toBe(3);
  });

  it('invalid AI output, limits and API errors fail safely and keep the last good result', async () => {
    const a = await newPolice();
    await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({});
    await settle(admin, `/api/v1/applications/${a.id}/ai-review`);
    const cases: [() => Response, RegExp][] = [
      [() => candidate('Gerne! Hier ist meine Einschätzung …'), /kein gültiges JSON/],
      [() => candidate({ ...okResult(), empfehlung: 'annehmen' }), /unvollständig/],
      [() => gemini({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }, 429), /Nutzungslimit/],
      [() => gemini({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } }, 400), /Schlüssel ist ungültig/],
      [() => gemini({ error: { code: 404, message: 'models/x is not found' } }, 404), /GEMINI_MODEL/],
      [() => gemini({ error: { code: 503, message: 'overloaded' } }, 503), /überlastet/],
      [() => gemini({ promptFeedback: { blockReason: 'SAFETY' } }), /Sicherheitsgründen/],
      [() => gemini({ candidates: [{ content: { parts: [{ text: '{"gesamt":' }] }, finishReason: 'MAX_TOKENS' }] }), /abgeschnitten/],
    ];
    for (const [reply, msg] of cases) {
      geminiReply = reply;
      expect((await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({ force: true })).status).toBe(202);
      const s = await settle(admin, `/api/v1/applications/${a.id}/ai-review`);
      expect(s.body.review.status).toBe('FAILED');
      expect(s.body.review.error).toMatch(msg);
      expect(s.body.review.error).not.toMatch(/Quota exceeded|API key not valid/); // Rohmeldung des Anbieters bleibt intern
      expect(s.body.lastDone.status).toBe('DONE');
    }
    expect((await prisma.application.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('SUBMITTED');
    expect(await prisma.auditLog.count({ where: { entityId: a.id, action: 'application.ai_review.failed', result: 'FAILED' } })).toBe(cases.length);
  });

  it('enforces the configured daily limit', async () => {
    const a = await newPolice();
    const used = await prisma.applicationAiReview.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    process.env.AI_REVIEW_DAILY_LIMIT = String(Math.max(1, used));
    const r = await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({});
    expect(r.status).toBe(429);
    expect(r.body.message).toMatch(/Tageslimit/);
    expect(geminiCalls).toHaveLength(0);
  });

  it('only reviewers may view or start it', async () => {
    const a = await newPolice();
    expect((await member.get(`/api/v1/applications/${a.id}/ai-review`)).status).toBe(403);
    expect((await member.post(`/api/v1/applications/${a.id}/ai-review`).send({})).status).toBe(403);
    expect((await member.put('/api/v1/application-ai-review/settings').send({ enabled: false, rules: '', criteria: '' })).status).toBe(403);
    expect(geminiCalls).toHaveLength(0);
  });

  it('works for unit applications and is removed together with the application', async () => {
    const q = await prisma.qualificationApplication.create({ data: { number: `AIR-Q-${stamp}`, unit: 'flugstaffel', unitName: 'Flugstaffel', discordId: '711000000000000002', discordName: 'fiktiv_pilot', answers: [{ question: 'Warum Flugstaffel?', answer: 'Ich fliege gern Hubschrauber und kenne die Karte.' }] } });
    expect((await admin.post(`/api/v1/qualifications/applications/${q.id}/ai-review`).send({})).body.started).toBe(true);
    const s = await settle(admin, `/api/v1/qualifications/applications/${q.id}/ai-review`);
    expect(s.body.review.status).toBe('DONE');
    expect(String(geminiCalls[0]!.init.body)).toContain('Flugstaffel');
    expect((await admin.delete(`/api/v1/qualifications/applications/${q.id}`)).status).toBe(204);
    expect(await prisma.applicationAiReview.count({ where: { applicationId: q.id } })).toBe(0);
  });

  it('rules and criteria are configurable per server, sent along and can switch the review off', async () => {
    const a = await newPolice();
    const put = await admin.put('/api/v1/application-ai-review/settings').send({ enabled: true, rules: 'Kein Fail-RP, kein Powergaming.', criteria: 'Mindestens 2 Stunden pro Woche aktiv.' });
    expect(put.status).toBe(200);
    await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({});
    await settle(admin, `/api/v1/applications/${a.id}/ai-review`);
    const sent = String(geminiCalls[0]!.init.body);
    expect(sent).toContain('Kein Fail-RP');
    expect(sent).toContain('Mindestens 2 Stunden');
    // Regeln geändert → Ergebnis evtl. veraltet
    await admin.put('/api/v1/application-ai-review/settings').send({ enabled: true, rules: 'Neue Regel.', criteria: '' });
    expect((await admin.get(`/api/v1/applications/${a.id}/ai-review`)).body.stale).toBe(true);
    await admin.put('/api/v1/application-ai-review/settings').send({ enabled: false, rules: '', criteria: '' });
    const off = await admin.post(`/api/v1/applications/${a.id}/ai-review`).send({ force: true });
    expect(off.status).toBe(503);
    expect(off.body.message).toMatch(/ausgeschaltet/);
    await admin.put('/api/v1/application-ai-review/settings').send({ enabled: true, rules: '', criteria: '' });
  });

  it('after a restart, interrupted analyses are marked failed and not sent again', async () => {
    const a = await newPolice();
    await prisma.applicationAiReview.create({ data: { kind: 'POLICE', applicationId: a.id, inputHash: 'x', provider: 'gemini', model: 'm' } });
    await app.get(AiReviewService).onModuleInit();
    const s = await admin.get(`/api/v1/applications/${a.id}/ai-review`);
    expect(s.body.review).toMatchObject({ status: 'FAILED' });
    expect(s.body.review.error).toMatch(/Neustart/);
    expect(geminiCalls).toHaveLength(0);
  });
});

describe('Gemini-Anbindung', () => {
  it('reports a timeout when the request is aborted', async () => {
    const p = new GeminiProvider('k'.repeat(20), 'gemini-3.8-flash');
    const ctl = new AbortController();
    geminiReply = () => { ctl.abort(); throw new DOMException('aborted', 'AbortError'); };
    await expect(p.generate({ system: 's', user: 'u' }, ctl.signal)).rejects.toMatchObject({ kind: 'TIMEOUT', retryable: true });
    expect(new AiProviderError('TIMEOUT', 'x')).toBeInstanceOf(Error);
  });
  it('reads limits from the environment with safe fallbacks', () => {
    expect(aiConfig({ GEMINI_API_KEY: '  ', AI_REVIEW_DAILY_LIMIT: 'viele', AI_REVIEW_TIMEOUT_MS: '999999', GEMINI_MODEL: 'x y' })).toMatchObject({ apiKey: null, dailyLimit: 50, timeoutMs: 120_000, model: 'gemini-3.8-flash' });
    expect(aiConfig({ GEMINI_API_KEY: KEY, GEMINI_MODEL: 'gemini-3.5-flash-lite', AI_REVIEW_MAX_CONCURRENT: '3' })).toMatchObject({ apiKey: KEY, model: 'gemini-3.5-flash-lite', maxConcurrent: 3 });
  });
});

describe('KI-Prüfung über Discord', () => {
  it('the bot starts it as the linked reviewer and gets the same stored result', async () => {
    {
      const u = await prisma.user.findUniqueOrThrow({ where: { username: 'air_sup' } });
      await prisma.discordLink.create({ data: { userId: u.id, discordId: '711000000000000099' } });
      const a = await newPolice();
      const http = () => request(app.getHttpServer());
      const bot = { Authorization: `Bot ${BOT_TOKEN}`, 'X-Discord-User': '711000000000000099' };
      const r = await http().post(`/api/v1/applications/${a.id}/ai-review`).set(bot).send({});
      expect(r.status).toBe(202);
      const done = await settle(sup, `/api/v1/applications/${a.id}/ai-review`); // Dashboard sieht dasselbe Ergebnis
      expect(done.body.review).toMatchObject({ status: 'DONE', via: 'DISCORD' });
      const viaBot = await http().get(`/api/v1/applications/${a.id}/ai-review`).set(bot);
      expect(viaBot.body.review.id).toBe(done.body.review.id);
      // Diagnose für /system integrations: Status ohne Schlüssel
      const st = await http().get('/api/v1/bot/ai-review/status').set({ Authorization: `Bot ${BOT_TOKEN}` });
      expect(st.status).toBe(200);
      expect(st.body).toMatchObject({ configured: true, model: 'gemini-3.8-flash' });
      expect(JSON.stringify(st.body)).not.toContain(KEY);
    }
  });
});
