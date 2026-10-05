import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Client, Message } from 'discord.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@nexus/database';
import { addQuestion } from '@nexus/validation';
import type { Question } from '@nexus/types';
import { startApplication } from '../src/applications/application-service.js';
import { sendIntro } from '../src/applications/dm-flow.js';
import { handleDMMessage } from '../src/events/dm-answer.js';
import { handleInteraction } from '../src/interactions/handlers.js';
import { recoverActiveApplications } from '../src/bot.js';
import { connectRedis, redis } from '../src/utils/lock.js';
import { buildCustomId, CustomIdAction } from '../src/discord/custom-ids.js';

/**
 * Abnahme Phase 9: Eine Bewerbung mit 23 Fragen wird komplett per (simulierter) DM durchgeführt –
 * gegen echte Datenbank und echtes Redis; nur Discord selbst ist durch Attrappen ersetzt.
 */
const G = 'dmtest-guild';
const USER = 'dmtest-user-1';
const OTHER = 'dmtest-user-2';

const defs = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../scripts/fixtures/application-23.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, unknown>[];
const questions: Question[] = defs.reduce<Question[]>((list, d) => addQuestion(list, d).list, []);

const ANSWER: Record<string, string> = {
  rpname: 'Max Mustermann',
  discord: 'max_rp',
  alter: '25',
  geburt: '01.02.2000',
  erfahrung: 'Ja',
  'erfahrung-wo': 'Drei Jahre auf mehreren Servern als Streifenbeamter.',
  abteilung: '1',
  faehigkeiten: '1, 3',
  verfuegbar: '18:30',
  start: '01.11.2026 19:00',
  motivation:
    'Ich möchte Verantwortung übernehmen und das Team auf dem Server langfristig unterstützen.',
  stunden: '12,5',
  fahrzeug: 'Nein',
  regelwerk: '4',
  teamarbeit: '7',
  lebenslauf: 'https://example.com/cv',
  mail: 'Max@Example.com',
  tel: '+49 171 1234567',
  bewerter: '<@123456789012345678>',
  regeln: 'ja',
};

// --- Discord-Attrappen -----------------------------------------------------

interface Sent {
  content: string;
  components?: any[];
}
function makeDm() {
  const sent: Sent[] = [];
  const dm: any = {
    id: 'dm-1',
    isDMBased: () => true,
    send: vi.fn(async (o: Sent | string) => {
      sent.push(typeof o === 'string' ? { content: o } : o);
      return { id: `m${sent.length}` };
    }),
  };
  return {
    dm,
    sent,
    last: () => sent.at(-1)!,
    lastQuestion: () => [...sent].reverse().find((s) => s.content.includes('Frage ')),
  };
}
const client = (dm: any): Client =>
  ({ user: { id: 'bot' }, users: { createDM: vi.fn(async () => dm) } }) as unknown as Client;

function message(dm: any, userId: string, content: string): Message & { replies: string[] } {
  const replies: string[] = [];
  return {
    channel: dm,
    author: { id: userId, bot: false },
    content,
    replies,
    reply: vi.fn(async (t: string) => {
      replies.push(t);
    }),
  } as never;
}

/** Findet in der letzten Nachricht mit Komponenten die Schaltfläche/Auswahl mit dieser Aktion. */
function component(sent: Sent[], action: string) {
  for (const s of [...sent].reverse()) {
    for (const row of s.components ?? []) {
      for (const c of row.components ?? []) {
        const json = c.toJSON ? c.toJSON() : c;
        if (String(json.custom_id).startsWith(`nexus:${action}:`)) return json;
      }
    }
  }
  return null;
}

function click(dm: any, userId: string, customId: string, values?: string[]) {
  const replies: string[] = [];
  const edit = vi.fn(async () => undefined);
  const i: any = {
    customId,
    user: { id: userId },
    channel: dm,
    guild: null,
    guildId: null,
    replied: false,
    deferred: false,
    values,
    message: { edit },
    replies,
    isMessageComponent: () => true,
    isModalSubmit: () => false,
    isButton: () => !values,
    isStringSelectMenu: () => !!values,
    isRepliable: () => true,
    reply: vi.fn(async (o: { content: string }) => {
      replies.push(o.content);
    }),
  };
  return i;
}

async function press(
  env: ReturnType<typeof makeDm>,
  userId: string,
  action: string,
  ...extra: string[]
) {
  const c = component(env.sent, action);
  if (!c) throw new Error(`Schaltfläche ${action} nicht gefunden`);
  const i = click(env.dm, userId, c.custom_id, extra.length ? extra : undefined);
  await handleInteraction(client(env.dm), i);
  return i;
}
const say = async (env: ReturnType<typeof makeDm>, text: string, userId = USER) => {
  const m = message(env.dm, userId, text);
  await handleDMMessage(client(env.dm), m);
  return m;
};

// --- Datenbank -----------------------------------------------------------

async function reset() {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'DM-Test', settings: { create: {} } } });
  const config = { requirements: { enabled: false }, messages: {}, questions };
  const app = await prisma.application.create({
    data: {
      guildId: G,
      name: 'Polizei-Bewerbung',
      slug: 'polizei',
      status: 'PUBLISHED',
      enabled: true,
      config: config as never,
      createdBy: 'x',
      updatedBy: 'x',
    },
  });
  await prisma.applicationVersion.create({
    data: { applicationId: app.id, version: 1, questions: config as never, publishedById: 'x' },
  });
  return app.id;
}

async function begin(appId: string, userId = USER) {
  const env = makeDm();
  const started = await startApplication({
    guildId: G,
    applicationId: appId,
    userId,
    memberRoleIds: [],
    username: 'max',
    displayName: 'Max',
  });
  expect(started.ok, started.message).toBe(true);
  await sendIntro(
    env.dm,
    {
      applicationId: appId,
      applicationName: 'Polizei-Bewerbung',
      versionQuestions: [],
      messages: {},
    },
    started.submissionId!,
  );
  return { env, submissionId: started.submissionId! };
}

let appId = '';
beforeAll(async () => {
  await connectRedis();
});
beforeEach(async () => {
  appId = await reset();
  const keys = await redis.keys('nexus-test:lock:*');
  if (keys.length) await redis.del(...keys);
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  redis.disconnect();
  await prisma.$disconnect();
});

const status = async (id: string) =>
  (await prisma.applicationSubmission.findUniqueOrThrow({ where: { id } })).status;
const answers = async (id: string) =>
  Object.fromEntries(
    (await prisma.applicationAnswer.findMany({ where: { submissionId: id } })).map((a) => [
      a.questionId,
      a.value,
    ]),
  );

const summaryReady = (env: ReturnType<typeof makeDm>) =>
  (env.last().components ?? []).some((row: any) =>
    JSON.stringify(row).includes('nexus:dm:submit:'),
  );

/** Beantwortet die Bewerbung bis zur Zusammenfassung; `skip` = optionale Fragen, die übersprungen werden. */
async function answerAll(env: ReturnType<typeof makeDm>, skip: string[] = []) {
  for (let guard = 0; guard < 40; guard++) {
    if (summaryReady(env)) return;
    const text = env.lastQuestion()!.content;
    const current = questions.find((q) => text.includes(`**${q.title}**`));
    if (!current) throw new Error('Frage nicht erkannt: ' + text);
    if (skip.includes(current.id)) await press(env, USER, CustomIdAction.DM_SKIP);
    else await say(env, ANSWER[current.id] ?? 'x');
  }
  throw new Error('Zusammenfassung wurde nicht erreicht');
}

describe('Abnahme Phase 9 – komplette DM-Bewerbung mit 23 Fragen', () => {
  it('Start → 22 Fragen beantworten → Zusammenfassung → Absenden', async () => {
    const { env, submissionId } = await begin(appId);
    expect(env.sent[0]!.content).toContain('Willkommen');

    await press(env, USER, CustomIdAction.DM_RESUME);
    expect(await status(submissionId)).toBe('IN_PROGRESS');
    // Der erste Inhalt ist die Info-Frage (Anzeige), danach die erste echte Frage
    expect(env.sent.some((s) => s.content.includes('Willkommen zur Bewerbung'))).toBe(true);
    expect(env.lastQuestion()!.content).toContain('Frage 1 von 19');
    expect(env.lastQuestion()!.content).toContain('RP-Name');

    await answerAll(env);

    const a = await answers(submissionId);
    expect(a['alter']).toBe(25);
    expect(a['geburt']).toBe('2000-02-01');
    expect(a['abteilung']).toBe('streife'); // per Nummer „1“
    expect(a['faehigkeiten']).toEqual(['funk', 'erste hilfe']);
    expect(a['stunden']).toBe(12.5);
    expect(a['mail']).toBe('max@example.com');
    expect(a['sek-grund']).toBeUndefined(); // bedingte Frage nicht gestellt
    expect(Object.keys(a)).toHaveLength(20); // 23 Fragen − Info − Hinweis − SEK-Frage

    // Zusammenfassung enthält alle Antworten, jede Nachricht < 2000 Zeichen
    const summary = env.sent.filter(
      (s) => s.content.includes('DEINE BEWERBUNG') || s.content.includes('. '),
    );
    expect(env.sent.every((s) => s.content.length <= 2000)).toBe(true);
    expect(summary.some((s) => s.content.includes('Max Mustermann'))).toBe(true);
    expect(env.sent.map((s) => s.content).join('\n')).toContain('Streife');

    const submit = await press(env, USER, CustomIdAction.DM_SUBMIT);
    expect(submit.replies[0]).toContain('eingereicht');
    expect(await status(submissionId)).toBe('SUBMITTED');
    const row = await prisma.applicationSubmission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { dmState: true },
    });
    expect(row.submittedAt).not.toBeNull();
    expect(row.dmState?.phase).toBe('CONFIRMED');
    expect(
      await prisma.applicationAuditEvent.count({
        where: { submissionId, action: 'submission.submitted' },
      }),
    ).toBe(1);

    // Nach dem Absenden werden weitere Nachrichten ignoriert (kein Spam, keine Änderung)
    const late = await say(env, 'noch was');
    expect(late.replies).toEqual([]);
    expect(await status(submissionId)).toBe('SUBMITTED');
  });

  it('Auswahlfragen zeigen ihre Optionen nummeriert; Hinweise je Typ', async () => {
    const { env } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    const texts: Record<string, string> = {};
    for (const id of [
      'rpname',
      'discord',
      'alter',
      'geburt',
      'erfahrung',
      'erfahrung-wo',
      'abteilung',
    ]) {
      texts[id] = env.lastQuestion()!.content;
      await say(env, ANSWER[id]!);
    }
    expect(texts['abteilung']).toMatch(
      /\*\*1\.\*\* Streife[\s\S]*\*\*2\.\*\* Leitstelle[\s\S]*\*\*3\.\*\* SEK[\s\S]*\*\*4\.\*\* Verkehr/,
    );
    expect(texts['abteilung']).toContain('Nummer oder dem Namen');
    expect(texts['geburt']).toContain('TT.MM.JJJJ');
    expect(texts['alter']).toContain('16 bis 99');
    expect(texts['rpname']).toContain('Pflichtfrage');
    expect(env.lastQuestion()!.content).toContain('Fähigkeiten'); // nächste Frage
  });

  it('ungültige Antwort: Fehlermeldung, nichts gespeichert, Frage bleibt offen', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    await say(env, 'Max Mustermann');
    await say(env, 'max_rp');
    const bad = await say(env, 'zwölf');
    expect(bad.replies[0]).toContain('gültige Zahl');
    expect((await answers(submissionId))['alter']).toBeUndefined();
    const young = await say(env, '12');
    expect(young.replies[0]).toContain('Mindestens 16');
    expect(env.lastQuestion()!.content).toContain('Alter');
    await say(env, '25');
    expect((await answers(submissionId))['alter']).toBe(25);
  });

  it('Zurück geht zur vorherigen gestellten Frage, ohne Antworten zu verlieren', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    await say(env, 'Max Mustermann');
    await say(env, 'max_rp');
    await say(env, '25'); // jetzt bei „Geburtsdatum“
    expect(env.lastQuestion()!.content).toContain('Geburtsdatum');
    const back = await press(env, USER, CustomIdAction.DM_BACK);
    expect(back.replies[0]).toContain('Zurück');
    expect(env.lastQuestion()!.content).toContain('Alter'); // nicht „zuletzt gespeicherte“, sondern die vorherige
    expect((await answers(submissionId))['alter']).toBe(25);
    await say(env, '30');
    expect((await answers(submissionId))['alter']).toBe(30);
    expect(env.lastQuestion()!.content).toContain('Geburtsdatum');
  });

  it('Zurück bei der ersten Frage meldet das, ohne etwas zu ändern', async () => {
    const { env } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    const back = await press(env, USER, CustomIdAction.DM_BACK);
    expect(back.replies[0]).toContain('ersten Frage');
  });

  it('Optionale Fragen lassen sich überspringen, Pflichtfragen nicht', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    expect(component(env.sent, CustomIdAction.DM_SKIP)).toBeNull(); // RP-Name ist Pflicht → kein Überspringen-Button
    const direct = click(env.dm, USER, buildCustomId(CustomIdAction.DM_SKIP, submissionId));
    await handleInteraction(client(env.dm), direct);
    expect(direct.replies[0]).toMatch(/verpflichtend|nicht möglich/);
    expect((await answers(submissionId))['rpname']).toBeUndefined();
    for (const id of [
      'rpname',
      'discord',
      'alter',
      'geburt',
      'erfahrung',
      'erfahrung-wo',
      'abteilung',
    ])
      await say(env, ANSWER[id]!);
    expect(component(env.sent, CustomIdAction.DM_SKIP)).not.toBeNull(); // Fähigkeiten sind optional
    await press(env, USER, CustomIdAction.DM_SKIP);
    expect((await answers(submissionId))['faehigkeiten']).toBeNull();
    expect(env.lastQuestion()!.content).toContain('abends online'); // weiter, nicht erneut gefragt
  });

  it('Pausieren und Fortsetzen – auch nach einem Bot-Neustart genau an derselben Stelle', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    await say(env, 'Max Mustermann');
    await press(env, USER, CustomIdAction.DM_PAUSE);
    expect(await status(submissionId)).toBe('PAUSED');
    const ignored = await say(env, 'max_rp');
    expect(ignored.replies[0]).toContain('pausiert');
    expect((await answers(submissionId))['discord']).toBeUndefined();

    // Bot-Neustart: pausierte Bewerbungen bleiben ruhig
    const before = env.sent.length;
    await recoverActiveApplications(client(env.dm));
    expect(env.sent.length).toBe(before);

    await press(env, USER, CustomIdAction.DM_RESUME);
    expect(await status(submissionId)).toBe('IN_PROGRESS');
    expect(env.lastQuestion()!.content).toContain('Discord-Name');

    // Neustart mit laufender Bewerbung: Hinweis + die offene Frage wird erneut gestellt
    const n = env.sent.length;
    await recoverActiveApplications(client(env.dm));
    const after = env.sent
      .slice(n)
      .map((s) => s.content)
      .join('\n');
    expect(after).toContain('neu gestartet');
    expect(after).toContain('Discord-Name');
    await say(env, 'max_rp');
    expect((await answers(submissionId))['discord']).toBe('max_rp');
  });

  it('Abbrechen beendet die Bewerbung; weitere Nachrichten und Schaltflächen haben keine Wirkung', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    await say(env, 'Max Mustermann');
    const cancel = await press(env, USER, CustomIdAction.DM_CANCEL);
    expect(cancel.replies[0]).toContain('abgebrochen');
    expect(cancel.message.edit).toHaveBeenCalled(); // Schaltflächen entfernt
    expect(await status(submissionId)).toBe('CANCELLED');
    const m = await say(env, 'max_rp');
    expect(m.replies).toEqual([]);
    const again = click(env.dm, USER, buildCustomId(CustomIdAction.DM_SUBMIT, submissionId));
    await handleInteraction(client(env.dm), again);
    expect(again.replies[0]).toContain('nicht');
    expect(await status(submissionId)).toBe('CANCELLED');
    // Eine neue Bewerbung ist danach wieder möglich
    expect(
      (
        await startApplication({
          guildId: G,
          applicationId: appId,
          userId: USER,
          memberRoleIds: [],
          username: 'm',
          displayName: 'M',
        })
      ).ok,
    ).toBe(true);
  });

  it('Fremde Nutzer können weder abbrechen noch absenden noch zurückgehen', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    for (const action of [
      CustomIdAction.DM_CANCEL,
      CustomIdAction.DM_SUBMIT,
      CustomIdAction.DM_PAUSE,
      CustomIdAction.DM_BACK,
      CustomIdAction.DM_SKIP,
    ]) {
      await handleInteraction(
        client(env.dm),
        click(env.dm, OTHER, buildCustomId(action, submissionId)),
      );
    }
    expect(await status(submissionId)).toBe('IN_PROGRESS');
    const m = await say(env, 'Fremde Antwort', OTHER);
    expect(m.replies).toEqual([]);
    expect(Object.keys(await answers(submissionId))).toEqual([]);
  });

  it('Antworten bearbeiten: gezielt eine Antwort ändern und direkt zur Zusammenfassung zurückkehren', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    await answerAll(env);
    const select = component(env.sent, CustomIdAction.DM_EDIT_SELECT);
    expect(select).not.toBeNull();
    expect(select.options.length).toBeLessThanOrEqual(25);
    const n = env.sent.length;
    await press(env, USER, CustomIdAction.DM_EDIT_SELECT, 'alter');
    expect(env.lastQuestion()!.content).toContain('Du bearbeitest');
    expect(env.lastQuestion()!.content).toContain('Aktuell: 25');
    await say(env, '40');
    expect((await answers(submissionId))['alter']).toBe(40);
    // sofort wieder Zusammenfassung – nicht erneut durch alle Folgefragen
    const afterEdit = env.sent
      .slice(n)
      .map((s) => s.content)
      .join('\n');
    expect(afterEdit).toContain('DEINE BEWERBUNG');
    expect(afterEdit).toContain('40');
    const sub = await press(env, USER, CustomIdAction.DM_SUBMIT);
    expect(sub.replies[0]).toContain('eingereicht');
  });

  it('Bearbeiten ändert den Verlauf: neue bedingte Frage wird gefragt, nicht mehr sichtbare Antwort wird verworfen', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    await answerAll(env);
    expect((await answers(submissionId))['erfahrung-wo']).toBeDefined();

    // „Erfahrung“ auf Nein: Detailantwort entfällt
    await press(env, USER, CustomIdAction.DM_EDIT_SELECT, 'erfahrung');
    await say(env, 'Nein');
    expect((await answers(submissionId))['erfahrung-wo']).toBeUndefined();
    expect(env.sent.at(-1)!.content).toContain('DEINE BEWERBUNG');

    // Abteilung auf SEK: Zusatzfrage „Warum SEK?“ erscheint im Bearbeiten-Ablauf
    await press(env, USER, CustomIdAction.DM_EDIT_SELECT, 'abteilung');
    await say(env, '3');
    expect(env.lastQuestion()!.content).toContain('Warum SEK?');
    await say(env, 'Ich bringe Erfahrung mit.');
    expect((await answers(submissionId))['sek-grund']).toBe('Ich bringe Erfahrung mit.');
    expect(env.sent.at(-1)!.content).toContain('DEINE BEWERBUNG');
  });

  it('Absenden prüft Pflichtfragen und fragt Fehlendes erneut ab', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    await answerAll(env);
    await prisma.applicationAnswer.deleteMany({
      where: { submissionId, questionId: 'motivation' },
    });
    const refused = await press(env, USER, CustomIdAction.DM_SUBMIT);
    expect(refused.replies[0]).toContain('Pflichtantworten');
    expect(refused.replies[0]).toContain('Warum möchtest du zur Polizei?');
    expect(await status(submissionId)).toBe('IN_PROGRESS');
    expect(env.lastQuestion()!.content).toContain('Warum möchtest du zur Polizei?');
  });

  it('doppeltes Absenden erzeugt keine zweite Einreichung', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    await answerAll(env);
    const customId = component(env.sent, CustomIdAction.DM_SUBMIT).custom_id;
    const [a, b] = await Promise.all([
      handleInteraction(client(env.dm), click(env.dm, USER, customId)),
      handleInteraction(client(env.dm), click(env.dm, USER, customId)),
    ]);
    void a;
    void b;
    expect(
      await prisma.applicationAuditEvent.count({
        where: { submissionId, action: 'submission.submitted' },
      }),
    ).toBe(1);
    expect(await status(submissionId)).toBe('SUBMITTED');
  });

  it('Nachricht vor dem Start und am Ende der Bewerbung wird freundlich eingeordnet', async () => {
    const { env } = await begin(appId);
    const early = await say(env, 'hallo?');
    expect(early.replies[0]).toContain('Bewerbung starten');
    await press(env, USER, CustomIdAction.DM_RESUME);
    await answerAll(env);
    const atEnd = await say(env, 'noch eine Antwort');
    expect(atEnd.replies[0]).toContain('Ende der Bewerbung');
  });

  it('gleichzeitige Nachrichten: nichts geht verloren oder wird überschrieben (Lock + frischer Zustand)', async () => {
    const { env, submissionId } = await begin(appId);
    await press(env, USER, CustomIdAction.DM_RESUME);
    const [m1, m2] = await Promise.all([say(env, 'Max Mustermann'), say(env, 'Anna Beispiel')]);
    const a = await answers(submissionId);
    // Entweder wurden beide nacheinander verarbeitet (zwei aufeinanderfolgende Fragen) oder die zweite abgewiesen –
    // niemals dieselbe Frage doppelt/überschrieben.
    const values = [a['rpname'], a['discord']].filter(Boolean);
    expect(values.length).toBeGreaterThanOrEqual(1);
    expect(new Set(values).size).toBe(values.length);
    expect(['Max Mustermann', 'Anna Beispiel']).toContain(a['rpname']);
    if (!a['discord']) expect([...m1.replies, ...m2.replies].join()).toContain('warte');
    expect(await status(submissionId)).toBe('IN_PROGRESS');
  });

  it('alte Snapshot-Version bleibt maßgeblich: später geänderte Fragen beeinflussen die laufende Bewerbung nicht', async () => {
    const { env, submissionId } = await begin(appId);
    await prisma.application.updateMany({
      where: { id: appId },
      data: { config: { questions: [] } as never },
    });
    await press(env, USER, CustomIdAction.DM_RESUME);
    expect(env.lastQuestion()!.content).toContain('RP-Name');
    await say(env, 'Max Mustermann');
    expect((await answers(submissionId))['rpname']).toBe('Max Mustermann');
  });
});

describe('Bewerbungssperre (Phase 47)', () => {
  const tryStart = (userId: string) => startApplication({ guildId: G, applicationId: appId, userId, memberRoleIds: [], username: 'max', displayName: 'Max' });
  it('gesperrter Benutzer kann keine Bewerbung starten – verständliche Meldung, nichts angelegt; nach Ablauf wieder möglich', async () => {
    const r = await prisma.restriction.create({ data: { guildId: G, userId: USER, type: 'APPLICATION', reason: 'Trollbewerbung', createdBy: 'admin' } }); // Test-Benutzer-ID ist keine echte Discord-ID
    const before = await prisma.applicationSubmission.count({ where: { guildId: G } });
    const res = await tryStart(USER);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('für Bewerbungen gesperrt');
    expect(res.message).toContain('Trollbewerbung');
    expect(await prisma.applicationSubmission.count({ where: { guildId: G } })).toBe(before);
    expect((await tryStart('900000000000999999')).ok).toBe(true); // andere Person
    await prisma.restriction.update({ where: { id: r.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect((await tryStart(USER)).ok).toBe(true);
  });
});

describe('Offene Bewerbung (Phase 54)', () => {
  it('zweiter Start nennt den Status der offenen Bewerbung', async () => {
    const first = await startApplication({ guildId: G, applicationId: appId, userId: USER, memberRoleIds: [], username: 'max', displayName: 'Max' });
    expect(first.ok).toBe(true);
    const again = await startApplication({ guildId: G, applicationId: appId, userId: USER, memberRoleIds: [], username: 'max', displayName: 'Max' });
    expect(again.ok).toBe(false);
    expect(again.message).toContain('bereits eine offene Bewerbung');
    expect(again.message).toContain('Status');
    await prisma.applicationSubmission.update({ where: { id: first.submissionId! }, data: { status: 'UNDER_REVIEW', submissionNumber: 'POL-00152' } });
    const review = await startApplication({ guildId: G, applicationId: appId, userId: USER, memberRoleIds: [], username: 'max', displayName: 'Max' });
    expect(review.message).toContain('IN REVIEW');
    expect(review.message).toContain('#POL-00152');
    // eigener Statusname der Bewerbungsart (Team-Chance)
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    const config = (app.config ?? {}) as Record<string, unknown>;
    await prisma.application.update({ where: { id: appId }, data: { config: { ...config, statusLabels: { UNDER_REVIEW: { label: '🟣 Wird geprüft' } } } as never } });
    try {
      const own = await startApplication({ guildId: G, applicationId: appId, userId: USER, memberRoleIds: [], username: 'max', displayName: 'Max' });
      expect(own.message).toContain('🟣 Wird geprüft');
    } finally {
      await prisma.application.update({ where: { id: appId }, data: { config: config as never } });
    }
  });
});

describe('Voraussetzungen der Bewerbungsart (Team-Chance, Phase 60e)', () => {
  const DAY = 86_400_000;
  const setReq = async (requirements: Record<string, unknown>) => {
    const a = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    await prisma.application.update({ where: { id: appId }, data: { config: { ...(a.config as object), requirements } as never } });
  };
  const start = (o: Partial<Parameters<typeof startApplication>[0]> = {}) =>
    startApplication({ guildId: G, applicationId: appId, userId: USER, memberRoleIds: [], username: 'max', displayName: 'Max', ...o });
  const past = async (status: 'DENIED' | 'ACCEPTED' | 'SUBMITTED', daysAgo: number, opts: { userId?: string; applicationId?: string } = {}) => {
    const applicationId = opts.applicationId ?? appId;
    const v = await prisma.applicationVersion.findFirstOrThrow({ where: { applicationId } });
    const at = new Date(Date.now() - daysAgo * DAY);
    return prisma.applicationSubmission.create({
      data: { guildId: G, applicationId, versionId: v.id, userId: opts.userId ?? USER, usernameSnapshot: 'max', displayNameSnapshot: 'Max', status, submittedAt: at, ...(status === 'DENIED' ? { deniedAt: at } : status === 'ACCEPTED' ? { acceptedAt: at } : {}) },
    });
  };
  const count = () => prisma.applicationSubmission.count({ where: { guildId: G, applicationId: appId, status: 'STARTED' } });

  it('Wartezeit nach jeder Bewerbung (vorher wirkungslos) – nach Ablauf wieder möglich', async () => {
    await setReq({ cooldown: { days: 3 } });
    const s = await past('DENIED', 1);
    const r = await start();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('erneut bewerben');
    expect(await count()).toBe(0);
    await prisma.applicationSubmission.update({ where: { id: s.id }, data: { submittedAt: new Date(Date.now() - 4 * DAY) } });
    expect((await start()).ok).toBe(true);
  });

  it('getrennte Wartezeit nach Ablehnung; eine Annahme löst sie nicht aus', async () => {
    await setReq({ denyCooldown: { days: 14 } });
    await past('ACCEPTED', 1);
    await past('DENIED', 2);
    const r = await start();
    expect(r.message).toContain('letzten Ablehnung');
    await prisma.applicationSubmission.updateMany({ where: { guildId: G, status: 'DENIED' }, data: { deniedAt: new Date(Date.now() - 15 * DAY) } });
    expect((await start()).ok).toBe(true);
  });

  it('Rollen, Mitgliedsdauer und eigener Hinweis – alle Gründe auf einmal', async () => {
    await setReq({ requiredRoleIds: ['900000000000600001'], restrictedRoleIds: ['900000000000600002'], minGuildMembershipDays: 30, failMessage: '❌ Du erfüllst derzeit nicht die Voraussetzungen für diese Team-Chance.' });
    const r = await start({ memberRoleIds: ['900000000000600002'], joinedAt: new Date(Date.now() - 10 * DAY) });
    expect(r.ok).toBe(false);
    expect(r.message.split('\n')[0]).toBe('❌ Du erfüllst derzeit nicht die Voraussetzungen für diese Team-Chance.');
    expect(r.message).toContain('<@&900000000000600001>');
    expect(r.message).toContain('<@&900000000000600002>');
    expect(r.message).toContain('30 Tage auf dem Server');
    expect((await start({ memberRoleIds: ['900000000000600001'], joinedAt: new Date(Date.now() - 40 * DAY) })).ok).toBe(true);
  });

  it('vorherige Annahme nötig bzw. ausgeschlossen (mit Namen der Bewerbungsart)', async () => {
    const support = await prisma.application.create({ data: { guildId: G, name: 'Support', slug: 'support', status: 'PUBLISHED', enabled: true, config: {}, createdBy: 'x', updatedBy: 'x' } });
    await prisma.applicationVersion.create({ data: { applicationId: support.id, version: 1, questions: [], publishedById: 'x' } });
    await setReq({ requirePreviousApproval: [support.id] });
    expect((await start()).message).toContain('„Support“ angenommen');
    await past('ACCEPTED', 5, { applicationId: support.id });
    await setReq({ forbidPreviousApproval: [support.id] });
    expect((await start()).message).toContain('Annahme bei „Support“');
    await setReq({ requirePreviousApproval: [support.id] });
    expect((await start()).ok).toBe(true);
  });

  it('Höchstzahl je Person und freie Plätze', async () => {
    await setReq({ maxSubmissionsPerUser: 1 });
    await past('DENIED', 30);
    expect((await start()).message).toContain('Höchstzahl von 1 Bewerbung');
    await setReq({ maxOpenSubmissions: 1 });
    await past('SUBMITTED', 0, { userId: OTHER });
    expect((await start()).message).toContain('alle Plätze belegt');
    await prisma.applicationSubmission.updateMany({ where: { guildId: G, userId: OTHER }, data: { status: 'ACCEPTED' } });
    expect((await start()).ok).toBe(true);
  });

  it('Dienstgrad aus der Personalakte und Mindest-Dienststunden', async () => {
    const rank = await prisma.rank.create({ data: { guildId: G, name: 'Kommissar', order: 3 } });
    await setReq({ requiredRankIds: [rank.id] });
    expect((await start()).message).toContain('Personalakte');
    await prisma.personnelRecord.create({ data: { guildId: G, userId: USER, rpName: 'Max', rankId: null } });
    expect((await start()).message).toContain('„Kommissar“');
    await prisma.personnelRecord.update({ where: { guildId_userId: { guildId: G, userId: USER } }, data: { rankId: rank.id } });
    await setReq({ requiredRankIds: [rank.id], minDutyHours: 5, dutyWindowDays: 7 });
    const type = await prisma.shiftType.create({ data: { guildId: G, name: 'Streife' } });
    await prisma.shift.create({ data: { guildId: G, userId: USER, typeId: type.id, status: 'ENDED', startedAt: new Date(Date.now() - 2 * DAY), endedAt: new Date(Date.now() - 2 * DAY + 3 * 3600_000), durationSeconds: 3 * 3600 } });
    await prisma.shift.create({ data: { guildId: G, userId: USER, typeId: type.id, status: 'ENDED', startedAt: new Date(Date.now() - 20 * DAY), endedAt: new Date(Date.now() - 20 * DAY + 4 * 3600_000), durationSeconds: 4 * 3600 } }); // außerhalb des Zeitraums
    expect((await start()).message).toContain('mindestens 5 Dienststunden in den letzten 7 Tagen (bisher 3)');
    await prisma.shift.create({ data: { guildId: G, userId: USER, typeId: type.id, status: 'ENDED', startedAt: new Date(Date.now() - 1 * DAY), endedAt: new Date(Date.now() - 1 * DAY + 2 * 3600_000), durationSeconds: 2 * 3600 } });
    expect((await start()).ok).toBe(true);
  });
});
