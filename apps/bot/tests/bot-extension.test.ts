import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PermissionFlagsBits as P } from 'discord.js';
import { afterAll, describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { allowed, authorize, levelOf, policyFor, type MemberAccess } from '../src/access';
import { BotBackupService, checksumOf, fsBackupFiles, insideProduction, memoryBackupFiles } from '../src/bot-backup';
import { brandReply, visibleCommands } from '../src/branding';
import { byName, COMMANDS } from '../src/commands';
import { _plansForTests, BACKUP_INTERACTION } from '../src/commands/backup';
import { answerText, criteriaText, EXAM_INTERACTION, examBodyWithActive, parseGrade, parseModalAnswer } from '../src/commands/exams';
import { interactionFor, INTERACTIONS } from '../src/commands/features';
import { patchFromModal, SETUP_INTERACTION } from '../src/commands/setup';
import type { BotRuntime, Ctx } from '../src/commands/types';
import { diagnoseGuild, findingsText, type GuildSnapshot } from '../src/diagnostics';
import { apiKeyValue, configKey, GuildConfigStore, memoryKeyValue, parseGuildConfig, setupWelcome } from '../src/guild-config';
import { containsSecret, redact, registerSecrets, scrubSecrets, withRetry } from '../src/safety';
import { createWelcome } from '../src/welcome';

const G1 = '111111111111111111', G2 = '222222222222222222';
const ADMIN = '900000000000000001', USER = '900000000000000002', INSTR = '900000000000000003';
const ROLE_INSTR = '700000000000000001', ROLE_OFFICER = '700000000000000002', ROLE_ADMIN = '700000000000000003';

type Call = { kind: 'user' | 'service'; method: string; path: string; body?: unknown };
function fakeApi(routes: Record<string, unknown | ((b: unknown, path: string) => unknown)> = {}) {
  const calls: Call[] = [];
  const state = new Map<string, unknown>();
  const resolve = (method: string, p: string, body: unknown) => {
    // vorhandene API-Route /bot/state (wie SystemSetting in der Datenbank)
    const st = /^\/bot\/state\/(.+)$/.exec(p);
    if (st) { if (method === 'GET') return { value: state.has(st[1]!) ? structuredClone(state.get(st[1]!)) : null }; state.set(st[1]!, structuredClone((body as { value: unknown }).value)); return undefined; }
    const key = Object.keys(routes).find((k) => `${method} ${p}`.startsWith(k));
    if (!key) throw new BotApiError(404, 'NOT_FOUND', `no route ${method} ${p}`);
    const r = routes[key];
    if (r instanceof BotApiError) throw r;
    return typeof r === 'function' ? (r as (b: unknown, path: string) => unknown)(body, p) : structuredClone(r);
  };
  const api: Api = {
    async asUser(_d, method, p, body) { calls.push({ kind: 'user', method, path: p, body }); return resolve(method, p, body) as never; },
    async service(method, p, body) { calls.push({ kind: 'service', method, path: p, body }); return resolve(method, p, body) as never; },
  };
  return { api, calls, state };
}

const member = (userId: string, o: Partial<MemberAccess> = {}): MemberAccess => ({ userId, roleIds: [], isOwner: false, administrator: false, manageGuild: false, ...o });

function fakeRuntime(api: Api, members: Record<string, MemberAccess | null> = {}, o: { snapshot?: GuildSnapshot | null; failMember?: boolean } = {}) {
  const store = new GuildConfigStore(apiKeyValue(api), 0);
  const files = memoryBackupFiles();
  const backups = new BotBackupService(store, files, apiKeyValue(api));
  const reregistered: string[] = [];
  const runtime: BotRuntime = {
    guildConfig: store, backups, backupDirWarning: null,
    access: { async member(_g, u) { if (o.failMember) throw new Error('discord down'); return members[u] ?? null; }, config: (g) => store.get(g) },
    status: () => ({ ready: true, wsPing: 42, uptimeSec: 3600, guilds: 2, intents: { content: true, members: true, presences: true } }),
    snapshot: async () => (o.snapshot === undefined ? snapshot() : o.snapshot),
    apiHealth: async () => ({ reachable: true, status: 200, ms: 5, authOk: true }),
    robloxReachable: async () => true,
    setNickname: async () => null,
    reregister: async (g) => { reregistered.push(g); },
  };
  return { runtime, store, files, backups, reregistered };
}

const ctx = (runtime: BotRuntime, api: Api, userId: string, guildId = G1, extra: Partial<Ctx> & Record<string, unknown> = {}) => ({ discordId: userId, api, guildId, runtime, opts: {}, ...extra }) as Ctx & { args: string[]; values?: string[]; fields?: Record<string, string> };
const text = (r: { content?: string; embeds?: { title: string; description?: string; fields?: { name: string; value: string }[] }[] }) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''} ${e.fields?.map((f) => `${f.name} ${f.value}`).join(' ') ?? ''}`).join(' ') ?? ''}`;

const ALL = P.ViewChannel | P.SendMessages | P.EmbedLinks | P.ReadMessageHistory | P.ManageRoles | P.ManageChannels | P.ManageNicknames | P.ChangeNickname | P.MoveMembers | P.CreatePublicThreads;
function snapshot(o: Partial<GuildSnapshot> = {}): GuildSnapshot {
  return {
    id: G1, name: 'Test', botPermissions: ALL, botTopRolePosition: 10,
    channels: [{ id: '800000000000000001', name: 'willkommen', kind: 'text', perms: ALL }, { id: '800000000000000002', name: 'pruefungen', kind: 'text', perms: P.ViewChannel }],
    roles: [{ id: ROLE_INSTR, name: 'Ausbilder', position: 3, managed: false }, { id: ROLE_OFFICER, name: 'Beamter', position: 2, managed: false }, { id: ROLE_ADMIN, name: 'Leitung', position: 5, managed: false }, { id: '700000000000000009', name: 'Im Dienst', position: 12, managed: false }],
    ...o,
  };
}
const RT = { ready: true, wsPing: 40, uptimeSec: 10, guilds: 1, intents: { content: true, members: true, presences: true } };

// ─────────────────────────────────────────────────────────────────────────────
describe('Pflichttest 1: Serverkonfigurationen bleiben nach einem Neustart erhalten', () => {
  it('über die vorhandene API-Route /bot/state – neuer Store (= neuer Prozess) liest denselben Stand', async () => {
    const { api, state } = fakeApi();
    const before = new GuildConfigStore(apiKeyValue(api));
    await before.update(G1, { branding: { serverName: 'Revier Nord', logoUrl: 'https://cdn.example.org/logo.png' }, colors: { primary: '#112233' }, roles: { instructor: [ROLE_INSTR] }, welcome: { enabled: true } }, { by: ADMIN });
    expect(state.has(configKey(G1))).toBe(true);
    const after = new GuildConfigStore(apiKeyValue(api)); // „Neustart“: nichts im Speicher
    const cfg = await after.get(G1);
    expect(cfg.branding.serverName).toBe('Revier Nord');
    expect(cfg.colors.primary).toBe('#112233');
    expect(cfg.roles.instructor).toEqual([ROLE_INSTR]);
    expect(cfg.welcome.enabled).toBe(true);
    expect(cfg.updatedBy).toBe(ADMIN);
  });
  it('Updates löschen nichts: Teiländerungen behalten übrige und unbekannte (neuere) Felder', async () => {
    const kv = memoryKeyValue({ [configKey(G1)]: { branding: { serverName: 'Alt', futureFlag: 1 }, futureSection: { keep: true }, roles: { admin: [ROLE_ADMIN] } } });
    const s = new GuildConfigStore(kv, 0);
    await s.update(G1, { colors: { danger: '#aa0000' } });
    const raw = kv.data.get(configKey(G1)) as Record<string, Record<string, unknown>>;
    expect(raw.futureSection).toEqual({ keep: true });
    expect(raw.branding!.futureFlag).toBe(1);
    expect(raw.branding!.serverName).toBe('Alt');
    expect((raw.roles as { admin: string[] }).admin).toEqual([ROLE_ADMIN]);
  });
  it('kaputte Teile führen zu Standardwerten statt zum Verlust aller Einstellungen', () => {
    const cfg = parseGuildConfig({ revision: 'x', colors: { primary: 'rot' }, branding: { serverName: 'Bleibt' } });
    expect(cfg.branding.serverName).toBe('Bleibt');
    expect(cfg.colors.primary).toBe('#3b82f6');
    expect(cfg.revision).toBe(0);
  });
  it('ungültige Werte werden abgelehnt statt still einen Abschnitt zurückzusetzen', async () => {
    const s = new GuildConfigStore(memoryKeyValue(), 0);
    await s.update(G1, { colors: { success: '#00ff00' } });
    await expect(s.update(G1, { colors: { primary: 'rot' } })).rejects.toThrow(/colors.primary/);
    expect((await s.get(G1)).colors.success).toBe('#00ff00');
  });
  it('gleichzeitige Änderung wird erkannt (Revision)', async () => {
    const s = new GuildConfigStore(memoryKeyValue(), 0);
    const a = await s.update(G1, { setupDone: true });
    await s.update(G1, { setupDone: false });
    await expect(s.update(G1, { setupDone: true }, { expectRevision: a.revision })).rejects.toThrow(/inzwischen geändert/);
  });
});

describe('Pflichttest 2: unterschiedliche Discord-Server haben getrennte Einstellungen', () => {
  it('Schlüssel je Server-ID, Änderungen an Server A ändern Server B nicht', async () => {
    const { api, state } = fakeApi();
    const s = new GuildConfigStore(apiKeyValue(api), 0);
    await s.update(G1, { branding: { serverName: 'Server A' }, modules: { disabled: ['cad'] } });
    await s.update(G2, { branding: { serverName: 'Server B' } });
    expect((await s.get(G1)).branding.serverName).toBe('Server A');
    expect((await s.get(G2)).branding.serverName).toBe('Server B');
    expect((await s.get(G2)).modules.disabled).toEqual([]);
    expect([...state.keys()].sort()).toEqual([`guildcfg:${G1}`, `guildcfg:${G2}`]);
    expect(() => configKey('../etc')).toThrow();
  });
  it('Sicherungen eines Servers lassen sich nicht auf einem anderen einspielen', async () => {
    const { api } = fakeApi();
    const { backups, store } = fakeRuntime(api);
    await store.update(G1, { branding: { serverName: 'A' } });
    const { meta } = await backups.create(G1, { reason: 'manuell' });
    const s = await backups.load(G1, meta.name);
    expect(backups.verify(s, G2)).toContain('Die Sicherung gehört zu einem anderen Discord-Server.');
  });
  it('Module im Bot je Server ausblenden: nur Befehle verschwinden', () => {
    const list = visibleCommands(COMMANDS, ['cad', 'personnel']);
    expect(list.some((c) => c.name === 'cad')).toBe(false);
    expect(list.some((c) => c.name === 'pruefung')).toBe(false);
    expect(list.some((c) => c.name === 'setup')).toBe(true); // Grundsystem bleibt immer
  });
});

describe('Pflichttest 3: Unberechtigte können keine administrativen Befehle ausführen', () => {
  const setupAll = async (members: Record<string, MemberAccess | null>, o?: Parameters<typeof fakeRuntime>[2]) => {
    const f = fakeApi({ 'POST /backups/data': { name: 'manuell-x.json.gz', rows: 1, size: 1 }, 'GET /backups/data': [] });
    return { ...f, ...fakeRuntime(f.api, members, o) };
  };
  it('/setup, /system diagnose, /backup erstellen werden für normale Mitglieder abgelehnt – ohne Schreibzugriff', async () => {
    const { api, runtime, calls, state } = await setupAll({ [USER]: member(USER) });
    for (const [name, sub] of [['setup', undefined], ['system', 'diagnose'], ['system', 'status'], ['backup', 'erstellen'], ['backup', 'wiederherstellen']] as const) {
      const r = await byName(name)!.run(ctx(runtime, api, USER, G1, { opts: sub ? { _sub: sub } : {} }));
      expect(r.content).toMatch(/^⛔/);
      expect(r.ephemeral).toBe(true); // nur für den Aufrufer sichtbar
    }
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(state.size).toBe(0);
  });
  it('Buttons/Menüs/Formulare des Assistenten und der Wiederherstellung prüfen ebenfalls', async () => {
    const { api, runtime, state } = await setupAll({ [USER]: member(USER) });
    const r1 = await SETUP_INTERACTION.run(ctx(runtime, api, USER, G1, { args: ['role', 'admin'], values: [USER] }));
    expect(r1.content).toMatch(/^⛔.*Serveradministrator/s);
    const r2 = await SETUP_INTERACTION.run(ctx(runtime, api, USER, G1, { args: ['save', 'general'], fields: { serverName: 'Hack' } }));
    expect(r2.content).toMatch(/^⛔/);
    const r3 = await BACKUP_INTERACTION.run(ctx(runtime, api, USER, G1, { args: ['apply', 'abc'], fields: { confirm: 'WIEDERHERSTELLEN' } }));
    expect(r3.content).toMatch(/^⛔/);
    expect(state.size).toBe(0);
  });
  it('Discord-Admin („Server verwalten“) darf, auch bevor Rollen zugeordnet sind', async () => {
    const { api, runtime } = await setupAll({ [ADMIN]: member(ADMIN, { manageGuild: true }) });
    const r = await byName('setup')!.run(ctx(runtime, api, ADMIN));
    expect(r.content ?? '').not.toMatch(/⛔/);
    expect(text(r)).toContain('Einrichtung dieses Servers');
  });
  it('Stufen über zugeordnete Rollen: Beamter darf keine Prüfungen verwalten, Ausbilder schon; Rolle „Serveradministrator“ darf /setup', async () => {
    const { runtime, store } = await setupAll({ [USER]: member(USER, { roleIds: [ROLE_OFFICER] }), [INSTR]: member(INSTR, { roleIds: [ROLE_INSTR] }), [ADMIN]: member(ADMIN, { roleIds: [ROLE_ADMIN] }) });
    await store.update(G1, { roles: { officer: [ROLE_OFFICER], instructor: [ROLE_INSTR], admin: [ROLE_ADMIN] } });
    expect(await authorize(runtime.access, { guildId: G1, userId: USER }, 'pruefung verwalten')).not.toBeNull();
    expect(await authorize(runtime.access, { guildId: G1, userId: INSTR }, 'pruefung verwalten')).toBeNull();
    expect(await authorize(runtime.access, { guildId: G1, userId: INSTR }, 'setup')).not.toBeNull();
    expect(await authorize(runtime.access, { guildId: G1, userId: ADMIN }, 'setup')).toBeNull();
    expect(await authorize(runtime.access, { guildId: G1, userId: USER }, 'exam:start')).toBeNull();
    expect(await authorize(runtime.access, { guildId: G1, userId: USER }, 'exam:gm')).not.toBeNull();
    // ohne zugeordnete Rolle nach der Einrichtung: keine Stufe → kein Ablegen
    expect(await authorize(runtime.access, { guildId: G1, userId: '900000000000000099' }, 'exam:start')).not.toBeNull();
  });
  it('Rollen aus derselben Stufe auf einem ANDEREN Server zählen nicht', async () => {
    const { runtime, store } = await setupAll({ [ADMIN]: member(ADMIN, { roleIds: [ROLE_ADMIN] }) });
    await store.update(G2, { roles: { admin: [ROLE_ADMIN] } });
    expect(await authorize(runtime.access, { guildId: G1, userId: ADMIN }, 'setup')).not.toBeNull();
    expect(await authorize(runtime.access, { guildId: G2, userId: ADMIN }, 'setup')).toBeNull();
  });
  it('kann Discord die Rollen nicht liefern, wird abgelehnt (fail closed); per DM geht nichts', async () => {
    const { runtime } = await setupAll({}, { failMember: true });
    expect((await authorize(runtime.access, { guildId: G1, userId: ADMIN }, 'setup'))?.content).toMatch(/Sicherheitsgründen/);
    expect((await authorize(runtime.access, { userId: ADMIN }, 'setup'))?.content).toMatch(/Direktnachricht/);
    expect((await authorize(undefined, { guildId: G1, userId: ADMIN }, 'backup'))?.content).toMatch(/abgelehnt/);
  });
  it('Richtlinien: Wildcards und unbekannte Befehle', () => {
    expect(policyFor('bak:plan')?.level).toBe('admin');
    expect(policyFor('backup status')?.level).toBe('admin');
    expect(policyFor('exam:vm')).toEqual({ level: 'instructor', sensitive: true });
    expect(policyFor('person')).toBeUndefined(); // bestehende Befehle: Rechte prüft weiterhin die API
    expect(levelOf(member(ADMIN, { isOwner: true }), parseGuildConfig({}))).toBe('admin');
    expect(allowed(member(USER), parseGuildConfig({}), 'officer')).toBe(true);
    expect(allowed(member(USER), parseGuildConfig({}), 'instructor')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
const EXAM_ID = '11111111-1111-4111-8111-111111111111';
const ATT_OLD = '22222222-2222-4222-8222-222222222222';
const ATT_NEW = '33333333-3333-4333-8333-333333333333';
function examWorld() {
  const attempts: Record<string, { id: string; status: string; answers: Record<string, unknown>; passed: boolean | null; percent: number | null }> = {
    [ATT_OLD]: { id: ATT_OLD, status: 'GRADED', answers: { q1: '1' }, passed: false, percent: 40 },
  };
  const questions = [
    { id: 'q1', type: 'SINGLE', text: 'Höchstgeschwindigkeit innerorts?', image: null, points: 2, partial: false, options: [{ i: 1, text: '30' }, { i: 0, text: '50' }], matches: [] },
    { id: 'q2', type: 'ORDER', text: 'Reihenfolge Festnahme', image: null, points: 3, partial: true, options: [{ i: 2, text: 'Belehren' }, { i: 0, text: 'Ansprechen' }, { i: 1, text: 'Durchsuchen' }], matches: [] },
  ];
  const view = (id: string) => { const a = attempts[id]!; return { id, examId: EXAM_ID, title: 'Grundprüfung', instructions: null, status: a.status, startedAt: '2026-10-01T10:00:00Z', deadline: null, passPercent: 70, reviewMode: 'ANSWERS', name: 'Max', owner: true, grader: false, answers: a.answers, flagged: [], questions, result: a.status === 'GRADED' ? { passed: a.passed, percent: a.percent, score: 2, maxScore: 5, feedback: null } : null, voided: null }; };
  const list = () => [{ id: EXAM_ID, title: 'Grundprüfung', description: null, instructions: null, category: null, active: true, questionTotal: 2, questionsPerAttempt: 2, passPercent: 70, timeLimitMin: null, maxAttempts: 3, retryHours: 0, reviewMode: 'ANSWERS', showResult: true, trainingName: null, requiredExamTitle: null, canEdit: false, canGrade: false,
    me: { state: Object.values(attempts).some((a) => a.passed) ? 'PASSED' : 'AVAILABLE', reason: null, attemptsUsed: Object.values(attempts).filter((a) => a.status !== 'IN_PROGRESS').length, attemptsLeft: 2, openAttemptId: null, bestPercent: Math.max(...Object.values(attempts).map((a) => a.percent ?? 0)), last: { status: 'GRADED', passed: false, percent: 40, at: '2026-10-01T10:30:00Z' } }, stats: null }];
  const f = fakeApi({
    'GET /hr/exams': () => list(),
    [`POST /hr/exams/${EXAM_ID}/start`]: () => { attempts[ATT_NEW] = { id: ATT_NEW, status: 'IN_PROGRESS', answers: {}, passed: null, percent: null }; return view(ATT_NEW); },
    'GET /hr/attempts/': (_b: unknown, p: string) => view(p.split('/').pop()!),
    'PUT /hr/attempts/': (b: unknown, p: string) => { attempts[p.split('/')[3]!]!.answers = (b as { answers: Record<string, unknown> }).answers; return { saved: true }; },
    'POST /hr/attempts/': (b: unknown, p: string) => { const id = p.split('/')[3]!; Object.assign(attempts[id]!, { status: 'GRADED', answers: (b as { answers: Record<string, unknown> }).answers, passed: true, percent: 100 }); return view(id); },
  });
  return { ...f, attempts };
}

describe('Pflichttest 4: frühere Prüfungsergebnisse bleiben erhalten', () => {
  it('neuer Versuch über Discord (Start → Antworten → Abgabe) – alter Versuch bleibt unverändert, nichts wird gelöscht', async () => {
    const { api, calls, attempts } = examWorld();
    const { runtime } = fakeRuntime(api, { [USER]: member(USER) });
    const run = (args: string[], extra: Record<string, unknown> = {}) => EXAM_INTERACTION.run(ctx(runtime, api, USER, G1, { args, ...extra }));
    const q1 = await run(['start', EXAM_ID]);
    expect(q1.panel).toBe(true);
    expect(text(q1)).toContain('volle Punkte nur für die richtige Antwort'); // Kriterien vor der Antwort sichtbar
    await run(['a', ATT_NEW, '0'], { values: ['0'] });
    await run(['m', ATT_NEW, '1'], { fields: { a: 'B, C, A' } });
    expect(attempts[ATT_NEW]!.answers).toEqual({ q1: '0', q2: ['0', '1', '2'] });
    const done = await run(['submit', ATT_NEW]);
    expect(text(done)).toContain('Bestanden');
    expect(attempts[ATT_OLD]).toEqual({ id: ATT_OLD, status: 'GRADED', answers: { q1: '1' }, passed: false, percent: 40 });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    const res = await byName('pruefung')!.run(ctx(runtime, api, USER, G1, { opts: { _sub: 'ergebnisse' } }));
    expect(text(res)).toContain('Grundprüfung');
    expect(res.embeds![0]!.footer).toContain('Versuche bleiben im System erhalten');
  });
  it('das Prüfungszentrum ruft nie Lösch-Routen auf (auch nicht beim Annullieren)', async () => {
    const src = await readFile(path.join(__dirname, '../src/commands/exams.ts'), 'utf8');
    expect(src).not.toMatch(/'DELETE'/);
    expect(src).toMatch(/\/void`/);
  });
  it('Annullieren und Bewerten nur für Ausbilder; Beamte werden abgelehnt', async () => {
    const { api, calls } = examWorld();
    const { runtime, store } = fakeRuntime(api, { [USER]: member(USER, { roleIds: [ROLE_OFFICER] }) });
    await store.update(G1, { roles: { officer: [ROLE_OFFICER] } });
    const r = await EXAM_INTERACTION.run(ctx(runtime, api, USER, G1, { args: ['vm', ATT_OLD], fields: { reason: 'Täuschung' } }));
    expect(r.content).toMatch(/^⛔/);
    expect(calls.some((c) => c.path.includes('/void'))).toBe(false);
  });
});

describe('Prüfungszentrum: transparente Bewertung und Antwortformate', () => {
  const q = (type: string, o: Record<string, unknown> = {}) => ({ id: 'x', type, text: 'T', image: null, points: 2, partial: false, options: [], matches: [], ...o }) as never;
  it('Reihenfolge und Zuordnung werden ins Format des Systems übersetzt', () => {
    const order = q('ORDER', { options: [{ i: 2, text: 'c' }, { i: 0, text: 'a' }, { i: 1, text: 'b' }] });
    expect(parseModalAnswer(order, { a: 'B C A' }).value).toEqual(['0', '1', '2']);
    expect(parseModalAnswer(order, { a: 'A, A, B' }).error).toMatch(/genau einmal/);
    const match = q('MATCH', { options: [{ i: 1, text: 'Rot' }, { i: 0, text: 'Grün' }], matches: [{ i: 0, text: 'fahren' }, { i: 1, text: 'halten' }] });
    expect(parseModalAnswer(match, { r0: 'B', r1: 'a' }).value).toEqual(['0', '1']); // Grün(0)→fahren(0), Rot(1)→halten(1)
    expect(answerText(match, ['0', '1'])).toContain('Rot → B) halten');
    expect(parseModalAnswer(q('NUMBER'), { a: '2,5' }).value).toBe('2,5');
    expect(parseModalAnswer(q('NUMBER'), { a: 'zwei' }).error).toBeTruthy();
  });
  it('Kriterien werden offen benannt (mit/ohne Teilpunkte)', () => {
    expect(criteriaText({ type: 'MULTI', points: 3, partial: true })).toContain('Teilpunkte');
    expect(criteriaText({ type: 'MULTI', points: 1, partial: false })).toMatch(/1 Punkt ·.*genau alle/);
  });
  it('Bewertung durch Prüfer: nur Fragen ohne Automatik, Bereich geprüft', () => {
    const v = { questions: [{ id: 'a', points: 2, auto: 2 }, { id: 'b', points: 4, auto: null }] } as never;
    expect(parseGrade(v, { s1: '3,5', feedback: ' gut ' })).toEqual({ scores: { b: 3.5 }, feedback: 'gut' });
    expect(parseGrade(v, { s1: '5' }).error).toMatch(/0 bis 4/);
  });
  it('Aktivieren/Deaktivieren übernimmt alle Felder der Prüfung (Fragen gehen nicht verloren)', () => {
    const detail = { title: 'P', questions: [{ id: 'q', type: 'YESNO', text: 'Ja?', correct: ['ja'] }], passPercent: 80, availableFrom: '2026-10-01T00:00:00.000Z', availableUntil: null, extra: 'x', active: true };
    const body = examBodyWithActive(detail, false)!;
    expect(body.active).toBe(false);
    expect(body.questions).toHaveLength(1);
    expect(body.passPercent).toBe(80);
    expect('extra' in body).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Pflichttest 5: Backups können in einer Testumgebung wiederhergestellt werden', () => {
  it('Sichern → ändern → Plan (Prüfung + Testlauf) → bestätigen → Stand wiederhergestellt, vorher automatisch gesichert', async () => {
    const { api, state } = fakeApi();
    const { backups, store, files } = fakeRuntime(api);
    await store.update(G1, { branding: { serverName: 'Original' }, roles: { admin: [ROLE_ADMIN] } });
    const { meta } = await backups.create(G1, { reason: 'manuell', by: ADMIN, database: { name: 'manuell-20261021-120000.json.gz', rows: 10 } });
    expect(meta.locations).toEqual(['Datei', 'Datenbank']); // zwei Ablageorte
    expect(state.has(`botbak:${G1}`)).toBe(true);
    await store.update(G1, { branding: { serverName: 'Kaputt' }, roles: { admin: [] } });

    const plan = await backups.plan(G1, meta.name, { channelIds: [], roleIds: [ROLE_ADMIN] });
    expect(plan.problems).toEqual([]);
    expect(plan.sandboxOk).toBe(true);
    expect(plan.changes.join('\n')).toContain('branding.serverName: "Kaputt" → "Original"');
    expect((await store.get(G1)).branding.serverName).toBe('Kaputt'); // der Plan ändert nichts

    const { safety, config } = await backups.apply(plan, { by: ADMIN });
    expect(config.branding.serverName).toBe('Original');
    expect(config.roles.admin).toEqual([ROLE_ADMIN]);
    expect(safety.reason).toBe('vor-wiederherstellung');
    const before = await backups.load(G1, safety.name);
    expect(before?.contents.guildConfig.branding.serverName).toBe('Kaputt'); // Rückweg möglich
    expect([...files.data.keys()]).toHaveLength(2);
  });
  it('veränderte Datei (Prüfsumme) und zwischenzeitliche Änderungen werden abgelehnt', async () => {
    const { api } = fakeApi();
    const { backups, store, files } = fakeRuntime(api);
    await store.update(G1, { branding: { serverName: 'A' } });
    const { meta } = await backups.create(G1, { reason: 'manuell' });
    await store.update(G1, { branding: { serverName: 'B' } });
    const plan = await backups.plan(G1, meta.name);
    await store.update(G1, { branding: { serverName: 'C' } }); // jemand ändert während des Plans
    await expect(backups.apply(plan, { by: ADMIN })).rejects.toThrow(/seit der Prüfung geändert/);
    expect((await store.get(G1)).branding.serverName).toBe('C');

    const key = `${G1}/${meta.name}`;
    const tampered = JSON.parse(files.data.get(key)!); tampered.contents.guildConfig.branding.serverName = 'Evil';
    files.data.set(key, JSON.stringify(tampered));
    const p2 = await backups.plan(G1, meta.name);
    expect(p2.problems.join(' ')).toMatch(/Prüfsumme/);
    await expect(backups.apply(p2, { by: ADMIN })).rejects.toThrow(/nicht geprüft/);
  });
  it('Bestätigung über Discord: falscher Bestätigungstext ändert nichts; Plan ist an Person und Server gebunden', async () => {
    const { api } = fakeApi();
    const { runtime, store, backups } = fakeRuntime(api, { [ADMIN]: member(ADMIN, { administrator: true }), [INSTR]: member(INSTR, { administrator: true }) });
    await store.update(G1, { branding: { serverName: 'Gut' } });
    const { meta } = await backups.create(G1, { reason: 'manuell' });
    await store.update(G1, { branding: { serverName: 'Schlecht' } });
    const planR = await BACKUP_INTERACTION.run(ctx(runtime, api, ADMIN, G1, { args: ['plan'], values: [meta.name] }));
    expect(text(planR)).toContain('Testwiederherstellung erfolgreich');
    const token = planR.buttons!.find((b) => b.id.startsWith('bak:confirm:'))!.id.split(':')[2]!;
    expect((await BACKUP_INTERACTION.run(ctx(runtime, api, INSTR, G1, { args: ['apply', token], fields: { confirm: 'WIEDERHERSTELLEN' } }))).content).toMatch(/gehört nicht dir/);
    expect((await BACKUP_INTERACTION.run(ctx(runtime, api, ADMIN, G1, { args: ['apply', token], fields: { confirm: 'ja' } }))).content).toMatch(/Nicht bestätigt/);
    expect((await store.get(G1)).branding.serverName).toBe('Schlecht');
    const ok = await BACKUP_INTERACTION.run(ctx(runtime, api, ADMIN, G1, { args: ['apply', token], fields: { confirm: 'WIEDERHERSTELLEN' } }));
    expect(text(ok)).toContain('Wiederherstellung abgeschlossen');
    expect((await store.get(G1)).branding.serverName).toBe('Gut');
    expect(_plansForTests.has(token)).toBe(false); // nur einmal verwendbar
  });
  it('keine Geheimnisse in Sicherungen', async () => {
    registerSecrets(['SUPERGEHEIMER-BOT-API-TOKEN-1234567890']);
    const kv = memoryKeyValue({ [configKey(G1)]: { welcome: { text: 'Hallo SUPERGEHEIMER-BOT-API-TOKEN-1234567890' }, branding: { apiToken: 'x', serverName: 'S' } } });
    const store = new GuildConfigStore(kv, 0);
    const files = memoryBackupFiles();
    const b = new BotBackupService(store, files, memoryKeyValue());
    const { meta } = await b.create(G1, { reason: 'manuell' });
    const raw = files.data.get(`${G1}/${meta.name}`)!;
    expect(raw).not.toContain('SUPERGEHEIMER');
    expect(raw).not.toContain('apiToken');
    expect(containsSecret(JSON.parse(raw))).toBe(false);
    // Muster eines Bot-Tokens erst zur Laufzeit zusammensetzen (kein token-förmiger Text im Quellcode)
    const fakeToken = ['A'.repeat(24), 'B'.repeat(6), 'C'.repeat(27)].join('.');
    expect(redact(`token ${fakeToken}`)).toBe('token [geschwärzt]');
    expect(scrubSecrets({ password: 'x', a: 'b' })).toEqual({ a: 'b' });
  });
  const tmp: string[] = [];
  afterAll(async () => { for (const d of tmp) await rm(d, { recursive: true, force: true }); });
  it('echtes Dateisystem: Datei nur für den Bot-Benutzer lesbar, wird nie überschrieben; Warnung im Produktionsordner', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'enpol-bak-')); tmp.push(dir);
    const files = fsBackupFiles(path.join(dir, 'backups'));
    const store = new GuildConfigStore(memoryKeyValue(), 0);
    await store.update(G1, { branding: { serverName: 'FS' } });
    const b = new BotBackupService(store, files, memoryKeyValue());
    const { meta } = await b.create(G1, { reason: 'manuell' });
    const st = await stat(path.join(dir, 'backups', G1, meta.name));
    if (process.platform !== 'win32') expect(st.mode & 0o077).toBe(0);
    await expect(files.write(G1, meta.name, '{}')).rejects.toThrow();
    await expect(files.read(G1, '../../etc/passwd')).rejects.toThrow(/invalid backup name/);
    // Test-Wiederherstellung auf frischem Speicher (wie eine Testumgebung)
    const testStore = new GuildConfigStore(memoryKeyValue(), 0);
    const plan = await new BotBackupService(testStore, files, memoryKeyValue()).plan(G1, meta.name);
    expect(plan.sandboxOk).toBe(true);
    expect(insideProduction(path.join(dir, 'app', 'backups'), [path.join(dir, 'app')])).toBe(true);
    expect(insideProduction(path.join(dir, 'backups'), [path.join(dir, 'app')])).toBe(false);
    await writeFile(path.join(dir, 'x'), 'y');
  });
  it('Prüfsumme ist unabhängig von der Reihenfolge der Schlüssel', () => {
    expect(checksumOf({ a: 1, b: { c: 2, d: 3 } })).toBe(checksumOf({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Pflichttest 6: fehlende Discord-Berechtigungen werden verständlich gemeldet', () => {
  it('Server-Rechte, Kanal-Rechte, Rollen über der Bot-Rolle, gelöschte Kanäle und Intents', () => {
    const cfg = parseGuildConfig({ channels: { exams: '800000000000000002', log: '800000000000000077' }, roles: { instructor: ['700000000000000042'] } });
    const f = diagnoseGuild(snapshot({ botPermissions: P.ViewChannel | P.SendMessages | P.EmbedLinks }), cfg, { dutyRole: '700000000000000009' }, { ...RT, intents: { content: true, members: false, presences: false } });
    const t = findingsText(f);
    expect(t).toContain('„Rollen verwalten“');
    expect(t).toContain('Servereinstellungen → Rollen → Bot-Rolle'); // Lösungsweg
    expect(t).toMatch(/#pruefungen.*fehlt dem Bot: Nachrichten senden, Links einbetten/);
    expect(t).toContain('existiert aber nicht mehr');
    expect(t).toMatch(/Im Dienst.*steht über/);
    expect(t).toContain('Server Members');
    expect(t).toContain('Nicht konfiguriert: Begrüßung');
    expect(f[0]!.severity).toBe('error'); // Fehler zuerst
  });
  it('/system diagnose zeigt die Befunde – ohne Tokens', async () => {
    registerSecrets(['GEHEIM-TOKEN-WERT-0987654321']);
    const { api } = fakeApi({ 'GET /bot/config': {} });
    const { runtime } = fakeRuntime(api, { [ADMIN]: member(ADMIN, { manageGuild: true }) }, { snapshot: snapshot({ botPermissions: P.ViewChannel }) });
    runtime.apiHealth = async () => ({ reachable: true, status: 200, ms: 3, authOk: false });
    const r = await byName('system')!.run(ctx(runtime, api, ADMIN, G1, { opts: { _sub: 'diagnose' } }));
    const t = text(r);
    expect(t).toContain('Nachrichten senden');
    expect(t).toContain('lehnt den Bot-Zugang ab');
    expect(t).not.toContain('GEHEIM-TOKEN');
    expect(r.ephemeral).toBe(true);
  });
  it('/system status und integrations', async () => {
    const { api } = fakeApi({ 'GET /bot/servers/': { disabled: ['sek'] }, 'GET /bot/ai-review/status': { configured: false, enabled: true, model: 'gemini-3.8-flash', dailyLimit: 50, usedToday: 0 } });
    const { runtime } = fakeRuntime(api, { [ADMIN]: member(ADMIN, { manageGuild: true }) });
    expect(text(await byName('system')!.run(ctx(runtime, api, ADMIN, G1, { opts: { _sub: 'status' } })))).toContain('verbunden');
    const i = text(await byName('system')!.run(ctx(runtime, api, ADMIN, G1, { opts: { _sub: 'integrations' } })));
    expect(i).toContain('Roblox');
    expect(i).toContain('ausgeschaltet: sek');
    expect(i).toContain('kein GEMINI_API_KEY'); // nur ob eingerichtet – nie der Schlüssel
  });
  it('Wiederholung nur bei vorübergehenden Fehlern', async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; if (n < 3) throw new BotApiError(503, 'X', 'busy'); return 'ok'; }, { sleep: async () => undefined })).resolves.toBe('ok');
    let m = 0;
    await expect(withRetry(async () => { m++; throw new BotApiError(403, 'X', 'no'); }, { sleep: async () => undefined })).rejects.toThrow();
    expect(m).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Pflichttest 7: bestehende Bot-Befehle funktionieren weiterhin', () => {
  // Stand vor der Erweiterung (aus dem unveränderten Code erfasst)
  const BEFORE = ['funkcode', 'teamchance', 'dashboard', 'panel', 'hilfe', 'person', 'kennzeichen', 'fahndungen', 'dienst', 'dienststunden', 'einheiten', 'einheitstatus', 'einsaetze', 'einsatz', 'profil', 'entverknuepfen', 'team', 'einsatzinfo', 'einsatzstatus', 'einsatzzuweisen', 'bericht', 'beschwerde', 'fahndung', 'funk', 'benachrichtigungen', 'gefahrenstatus', 'teamliste', 'funkfreigabe', 'dienstpanel', 'roblox', 'bewerbung', 'bewerbungspanel', 'qualipanel', 'abmeldung', 'leave', 'cad', 'dienstbericht', 'verwarnen', 'funkantrag', 'funkstatus', 'ausbildung', 'shift', 'support'];
  const PREFIXES = ['duty', 'quali', 'rwreq', 'tk', 'vs', 'leave', 'cad', 'verify', 'danger', 'support', 'fpanel', 'ipnl', 'mb', 'drep', 'trn', 'shift'];
  it('alle bisherigen Befehle und Interaktionen sind noch da, neue kollidieren nicht', () => {
    const names = COMMANDS.map((c) => c.name);
    for (const n of BEFORE) expect(names).toContain(n);
    expect(names.slice(0, BEFORE.length)).toEqual(BEFORE);
    for (const p of PREFIXES) expect(INTERACTIONS.some((d) => d.prefix === p)).toBe(true);
    expect(new Set(INTERACTIONS.map((d) => d.prefix)).size).toBe(INTERACTIONS.length);
    for (const n of ['setup', 'system', 'backup', 'pruefung']) expect(names).toContain(n);
    for (const c of COMMANDS) {
      expect(c.description.length).toBeLessThanOrEqual(100);
      for (const s of c.subcommands ?? []) { expect(s.name).toMatch(/^[a-z0-9_-]{1,32}$/); expect(s.description.length).toBeLessThanOrEqual(100); }
    }
    expect(interactionFor('exam:q:x:1')?.def.prefix).toBe('exam');
  });
  it('ohne aktivierte Option „alle Antworten“ bleiben Farben bestehender Befehle unverändert', () => {
    const r = { embeds: [{ title: 'x', color: 0x3b82f6 }] };
    expect(brandReply(r, parseGuildConfig({}))).toBe(r);
    expect(brandReply(r, parseGuildConfig({ branding: { applyToAll: true }, colors: { primary: '#010203' } })).embeds![0]!.color).toBe(0x010203);
  });
  it('Begrüßung aus /setup nur als Rückfall – keine doppelte Begrüßung, wenn das Dashboard eine sendet', async () => {
    const posted: string[] = [];
    const cfg = parseGuildConfig({ welcome: { enabled: true, text: 'Hi {user}' }, channels: { welcome: '800000000000000001' } });
    const mk = (dashboardOn: boolean) => {
      const def = { enabled: dashboardOn, channelId: dashboardOn ? '800000000000000005' : null, title: 'D', message: 'Dashboard', color: '#000000', showAvatar: false, pingUser: false, image: '', imageMediaId: '' };
      const { api } = fakeApi({ 'GET /bot/welcome': { welcome: def, goodbye: { ...def, enabled: false }, dm: { enabled: false, message: '' }, autoRoleIds: [] } });
      return createWelcome(api, { post: async (ch) => { posted.push(ch); }, dm: async () => undefined, addRoles: async () => undefined }, () => undefined, async (_g, kind) => setupWelcome(cfg, kind));
    };
    const m = { id: USER, guildId: G1, bot: false, username: 'u', displayName: 'U', server: 'S', memberCount: 3 };
    await mk(true).joined(m);
    await mk(false).joined(m);
    expect(posted).toEqual(['800000000000000005', '800000000000000001']);
  });
  it('Formulareingaben im Assistenten werden geprüft (genaue Fehlermeldung)', () => {
    expect(patchFromModal('colors', { primary: 'blau', success: '#000000', warning: '#000000', danger: '#000000', applyToAll: 'nein' }).error).toBe('Ungültige Eingabe bei „Hauptfarbe“: Farbe bitte als #RRGGBB');
    expect(patchFromModal('general', { logoUrl: 'http://x.de/a.png' }).error).toMatch(/https/);
    expect(patchFromModal('welcome', { enabled: 'vielleicht', goodbyeEnabled: 'nein' }).error).toMatch(/ja oder nein/);
    expect(patchFromModal('general', { serverName: 'Revier', displayName: '', logoUrl: '', bannerUrl: '' }).patch).toEqual({ branding: { serverName: 'Revier', displayName: null, logoUrl: null, bannerUrl: null } });
  });
  it('Assistent: Admin speichert Rollen, Module (nur ausgeblendet) und es wird neu registriert', async () => {
    const { api } = fakeApi({ 'GET /bot/servers/': { disabled: [] } });
    const { runtime, store, reregistered } = fakeRuntime(api, { [ADMIN]: member(ADMIN, { manageGuild: true }) });
    const r = await SETUP_INTERACTION.run(ctx(runtime, api, ADMIN, G1, { args: ['role', 'instructor'], values: [ROLE_INSTR, G1] }));
    expect(r.panel).toBe(true);
    expect((await store.get(G1)).roles.instructor).toEqual([ROLE_INSTR]); // @everyone (= Server-ID) ist keine Stufe
    await SETUP_INTERACTION.run(ctx(runtime, api, ADMIN, G1, { args: ['mods'], values: ['mdt', 'personnel'] }));
    const cfg = await store.get(G1);
    expect(cfg.modules.disabled).toContain('cad');
    expect(cfg.modules.disabled).not.toContain('personnel');
    expect(reregistered).toEqual([G1]);
  });
});
