import { DiscordApiError } from '@nexus/discord';
import { guildRepository, permissionRepository, prisma } from '@nexus/database';
import { addQuestion } from '@nexus/validation';
import { assignSubmission, decideSubmission, withdrawByStaff } from '@nexus/automation';
import type { Question } from '@nexus/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startApplication } from '../src/applications/application-service.js';
import { sendIntro } from '../src/applications/dm-flow.js';
import { setReviewPort } from '../src/applications/review-handlers.js';
import { handleDMMessage } from '../src/events/dm-answer.js';
import { handleInteraction } from '../src/interactions/handlers.js';
import { buildCustomId, CustomIdAction } from '../src/discord/custom-ids.js';
import { connectRedis, redis } from '../src/utils/lock.js';

/**
 * Abnahme Phase 10: Bewerbungsbearbeitung durch das Team – Annehmen (Pipeline, Rollen), Ablehnen (Grund),
 * Rückfrage, Gespräch, Zurückziehen, Berechtigungen, Rollenfehler. Gegen echte Datenbank + Redis; Discord ist
 * durch eine Attrappe ersetzt, die jeden Aufruf aufzeichnet.
 */
const G = 'revtest-guild';
const APPLICANT = 'revtest-applicant';
const OWNER = 'revtest-owner';
const ROLE = { accept: 'r-accept', deny: 'r-deny', viewer: 'r-viewer', review: 'r-review', lead: 'r-lead' };
const U = {
  acceptor: 'u-acceptor',
  denier: 'u-denier',
  viewer: 'u-viewer',
  reviewer: 'u-review',
  nobody: 'u-nobody',
};
const CH = 'channel-review';

// --- Discord-Attrappe ---------------------------------------------------------

function fakePort(opts: { rejectRoles?: Record<string, number>; dmFails?: string[] } = {}) {
  const dms: { userId: string; content: string }[] = [];
  const posts: { channelId: string; payload: any }[] = [];
  const edits: { channelId: string; messageId: string; payload: any }[] = [];
  const roles = new Map<string, string[]>();
  let n = 0;
  const port = {
    sendDm: vi.fn(async (userId: string, p: any) => {
      if (opts.dmFails?.includes(userId))
        throw new DiscordApiError(403, '/dm', 'Cannot send messages to this user');
      dms.push({ userId, content: String(p.content ?? '') });
    }),
    postMessage: vi.fn(async (channelId: string, payload: any) => {
      posts.push({ channelId, payload });
      return { id: `msg-${++n}` };
    }),
    editMessage: vi.fn(async (channelId: string, messageId: string, payload: any) => {
      edits.push({ channelId, messageId, payload });
    }),
    roleDriver: () => ({
      getRoleIds: async (u: string) => [...(roles.get(u) ?? [])],
      add: async (u: string, r: string) => {
        if (opts.rejectRoles?.[r])
          throw new DiscordApiError(opts.rejectRoles[r]!, '/role', 'Missing Permissions');
        roles.set(u, [...(roles.get(u) ?? []), r]);
      },
      remove: async (u: string, r: string) => {
        if (opts.rejectRoles?.[r])
          throw new DiscordApiError(opts.rejectRoles[r]!, '/role', 'Missing Permissions');
        roles.set(
          u,
          (roles.get(u) ?? []).filter((x) => x !== r),
        );
      },
    }),
  };
  return { port, dms, posts, edits, roles };
}

// --- Interaktions-Attrappen -------------------------------------------------------

function interaction(
  kind: 'button' | 'select' | 'modal',
  customId: string,
  o: {
    userId: string;
    roleIds?: string[];
    fields?: Record<string, string>;
    values?: string[];
    dm?: any;
  },
) {
  const out: { replies: string[]; shown: any[]; follow: string[]; deferred: boolean } = {
    replies: [],
    shown: [],
    follow: [],
    deferred: false,
  };
  const member = {
    id: o.userId,
    guild: { id: G, ownerId: OWNER },
    roles: { cache: new Map((o.roleIds ?? []).map((r) => [r, {}])) },
    permissions: { has: () => false },
  };
  const i: any = {
    customId,
    user: { id: o.userId },
    member,
    guildId: o.dm ? null : G,
    replied: false,
    deferred: false,
    values: o.values,
    out,
    guild: o.dm ? null : { id: G, ownerId: OWNER, members: { fetch: async () => member } },
    channel: o.dm ?? null,
    message: { edit: vi.fn(async () => undefined) },
    fields: { getTextInputValue: (k: string) => o.fields?.[k] ?? '' },
    isMessageComponent: () => kind !== 'modal',
    isModalSubmit: () => kind === 'modal',
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    isRepliable: () => true,
    reply: vi.fn(async (x: any) => {
      i.replied = true;
      out.replies.push(typeof x === 'string' ? x : String(x.content ?? '') + (x.embeds ? JSON.stringify(x.embeds) : ''));
    }),
    update: vi.fn(async (x: any) => {
      i.replied = true;
      out.replies.push(typeof x === 'string' ? x : String(x.content ?? '') + (x.embeds ? JSON.stringify(x.embeds) : ''));
    }),
    deferReply: vi.fn(async () => {
      i.deferred = true;
      out.deferred = true;
    }),
    editReply: vi.fn(async (x: any) => {
      out.replies.push(typeof x === 'string' ? x : String(x.content ?? ''));
    }),
    followUp: vi.fn(async (x: any) => {
      out.follow.push(String(x.content ?? ''));
    }),
    showModal: vi.fn(async (m: any) => {
      out.shown.push(m.toJSON ? m.toJSON() : m);
    }),
  };
  return i;
}
const client = () => ({ user: { id: 'bot' }, users: { createDM: async () => ({}) } }) as never;
const cid = (action: string, ...args: string[]) => buildCustomId(action as never, ...args);
const text = (i: any) => [...i.out.replies, ...i.out.follow].join('\n');

/** Klick → Modal öffnet sich → Modal wird mit Eingaben abgeschickt. */
async function viaModal(
  button: string,
  submissionId: string,
  userId: string,
  roleIds: string[],
  fields: Record<string, string> = {},
  extra: string[] = [],
) {
  const click = interaction('button', cid(button, submissionId), { userId, roleIds });
  await handleInteraction(client(), click);
  if (click.out.shown.length === 0) return { click, submit: null as any };
  const modalId = click.out.shown[0].custom_id as string;
  const submit = interaction('modal', modalId, { userId, roleIds, fields });
  await handleInteraction(client(), submit);
  void extra;
  return { click, submit };
}

// --- Daten ------------------------------------------------------------------------

const defs: Record<string, unknown>[] = [
  { id: 'name', type: 'TEXT', title: 'RP-Name', required: true },
  { id: 'alter', type: 'NUMBER', title: 'Alter', required: true, validation: { min: 16, max: 99 } },
  {
    id: 'abteilung',
    type: 'SINGLE_SELECT',
    title: 'Abteilung',
    required: true,
    options: [
      { id: 'a', label: 'Streife', value: 'streife', enabled: true },
      { id: 'b', label: 'SEK', value: 'sek', enabled: true },
    ],
  },
];
const questions: Question[] = defs.reduce<Question[]>((l, d) => addQuestion(l, d).list, []);

let appId = '';
async function setup(config: Record<string, unknown> = {}) {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Review-Test', settings: { create: {} } } });
  const full = { requirements: { enabled: false }, messages: {}, review: {}, ...config, questions };
  const app = await prisma.application.create({
    data: {
      guildId: G,
      name: 'Polizei',
      slug: 'polizei',
      status: 'PUBLISHED',
      enabled: true,
      config: full as never,
      createdBy: 'x',
      updatedBy: 'x',
    },
  });
  await prisma.applicationVersion.create({
    data: { applicationId: app.id, version: 1, questions: full as never, publishedById: 'x' },
  });
  appId = app.id;
  const snap = (name: string) => ({ name });
  await permissionRepository.setPermissionsForRole(
    G,
    ROLE.accept,
    ['applications.submissions.accept', 'applications.submissions.view'],
    snap('Annehmer'),
  );
  await permissionRepository.setPermissionsForRole(
    G,
    ROLE.deny,
    ['applications.submissions.deny', 'applications.submissions.view'],
    snap('Ablehner'),
  );
  await permissionRepository.setPermissionsForRole(
    G,
    ROLE.viewer,
    ['applications.submissions.view'],
    snap('Betrachter'),
  );
  await permissionRepository.setPermissionsForRole(
    G,
    ROLE.review,
    [
      'applications.submissions.review',
      'applications.submissions.view',
      'applications.notes.create',
    ],
    snap('Prüfer'),
  );
  await permissionRepository.setPermissionsForRole(
    G,
    ROLE.lead,
    ['applications.submissions.review', 'applications.submissions.view', 'applications.submissions.accept', 'applications.submissions.deny', 'applications.submissions.reassign'],
    snap('Leitung'),
  );
  await guildRepository.setSelection(G, 'application-review-channel', CH);
  await guildRepository.setSelection(G, 'application-review-role', 'ping-role');
  await guildRepository.setSelection(G, 'application-accepted-role', 'entry-role');
  return appId;
}

async function submitted(
  opts: { isTest?: boolean; userId?: string; f?: ReturnType<typeof fakePort> } = {},
) {
  const userId = opts.userId ?? APPLICANT;
  const version = await prisma.applicationVersion.findFirstOrThrow({
    where: { applicationId: appId },
  });
  const s = await prisma.applicationSubmission.create({
    data: {
      guildId: G,
      applicationId: appId,
      versionId: version.id,
      userId,
      usernameSnapshot: 'max',
      displayNameSnapshot: 'Max',
      status: 'SUBMITTED',
      submittedAt: new Date(),
      isTest: opts.isTest ?? false,
    },
  });
  await prisma.applicationDMState.create({
    data: { submissionId: s.id, userId, guildId: G, phase: 'CONFIRMED' },
  });
  for (const [questionId, value] of Object.entries({
    name: 'Max Mustermann',
    alter: 25,
    abteilung: 'streife',
  })) {
    await prisma.applicationAnswer.create({
      data: {
        submissionId: s.id,
        questionId,
        questionVersionId: version.id,
        value: value as never,
      },
    });
  }
  // Wie nach dem Absenden: Hauptnachricht im Bearbeitungskanal (damit Aktualisierungen prüfbar sind)
  if (opts.f) {
    const { postSubmissionToReview } = await import('@nexus/automation');
    await postSubmissionToReview(opts.f.port as never, s.id);
  }
  return s.id;
}

const status = async (id: string) =>
  (await prisma.applicationSubmission.findUniqueOrThrow({ where: { id } })).status;
const events = async (id: string) =>
  (
    await prisma.applicationAuditEvent.findMany({
      where: { submissionId: id },
      orderBy: { createdAt: 'asc' },
    })
  ).map((e) => e.action);

beforeAll(async () => {
  await connectRedis();
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  redis.disconnect();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await setup();
});

const ACCEPT = [U.acceptor, [ROLE.accept]] as const;
const DENY = [U.denier, [ROLE.deny]] as const;
const REVIEW = [U.reviewer, [ROLE.review]] as const;

describe('Bewerbung geht beim Team ein (nach dem Absenden)', () => {
  it('Absenden per DM postet Hauptnachricht mit Schaltflächen + Antworten, benachrichtigt die Prüfer-Rolle, Bewerber kann zurückziehen', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    // kompletter Weg über die DM
    const sent: any[] = [];
    const dm: any = {
      isDMBased: () => true,
      send: vi.fn(async (o: any) => {
        sent.push(typeof o === 'string' ? { content: o } : o);
        return { id: 'dm' };
      }),
    };
    const started = await startApplication({
      guildId: G,
      applicationId: appId,
      userId: APPLICANT,
      memberRoleIds: [],
      username: 'max',
      displayName: 'Max',
    });
    await sendIntro(
      dm,
      { applicationId: appId, applicationName: 'Polizei', versionQuestions: [], messages: {} },
      started.submissionId!,
    );
    const press = async (action: string, extra?: string[]) => {
      for (const s of [...sent].reverse())
        for (const row of s.components ?? [])
          for (const c of row.components ?? []) {
            const j = c.toJSON ? c.toJSON() : c;
            if (String(j.custom_id).startsWith(`nexus:${action}:`)) {
              const i = interaction(extra ? 'select' : 'button', j.custom_id, {
                userId: APPLICANT,
                dm,
                values: extra,
              });
              await handleInteraction(client(), i);
              return i;
            }
          }
      throw new Error(action);
    };
    await press(CustomIdAction.DM_RESUME);
    for (const a of ['Max Mustermann', '25', 'SEK']) {
      await handleDMMessage(client(), {
        channel: dm,
        author: { id: APPLICANT, bot: false },
        content: a,
        reply: vi.fn(async () => undefined),
      } as never);
    }
    await press(CustomIdAction.DM_SUBMIT);

    const main = f.posts[0]!;
    expect(main.channelId).toBe(CH);
    expect(main.payload.content).toContain('<@&ping-role>');
    expect(main.payload.embeds[0].title).toContain('Max');
    expect(main.payload.embeds[0].description).toContain('Offen');
    const ids = main.payload.components.flatMap((r: any) =>
      r.components.map((c: any) => c.custom_id).filter(Boolean),
    );
    for (const a of ['view', 'accept', 'deny', 'ask', 'interview', 'claim', 'history', 'note'])
      expect(
        ids.some((x: string) => x.startsWith(`nexus:review:${a}:`)),
        a,
      ).toBe(true);
    // Antworten als Folge-Nachrichten
    expect(JSON.stringify(f.posts.slice(1))).toContain('Max Mustermann');
    expect(JSON.stringify(f.posts.slice(1))).toContain('SEK');
    // gespeichert für spätere Aktualisierung
    const row = await prisma.applicationSubmission.findUniqueOrThrow({
      where: { id: started.submissionId! },
    });
    expect(row.submissionNumber).toMatch(/^SUB-\d{5}$/); // ID wird beim Absenden vergeben
    expect(JSON.stringify(main.payload.embeds[0])).toContain(`#${row.submissionNumber}`);
    expect(row).toMatchObject({
      status: 'SUBMITTED',
      submissionChannelId: CH,
      submissionMessageId: 'msg-1',
    });
    // Bewerber erhält Zurückziehen-Schaltfläche
    expect(JSON.stringify(sent.at(-1))).toContain('dm:withdraw');
    expect(await events(started.submissionId!)).toContain('review.posted');
  });

  it('ohne konfigurierten Kanal: Bewerbung bleibt gültig, Fehler wird protokolliert statt verschwiegen', async () => {
    await prisma.guildSettings.update({ where: { guildId: G }, data: { data: {} } });
    const f = fakePort();
    const { postSubmissionToReview } = await import('@nexus/automation');
    const id = await submitted();
    const r = await postSubmissionToReview(f.port as never, id);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Bearbeitungskanal');
    expect(await events(id)).toContain('review.notification_failed');
    expect(await status(id)).toBe('SUBMITTED');
  });
});

describe('Berechtigungen im Bearbeitungs-Panel (serverseitig)', () => {
  it('Annehmen verlangt „annehmen“, Ablehnen verlangt „ablehnen“ – nicht eines für beides', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    // Ablehner darf nicht annehmen
    const a = await viaModal('review:accept_r', id, ...DENY);
    expect(a.click.out.shown).toHaveLength(0);
    expect(text(a.click)).toContain('Du benötigst: Einreichungen mit eigenem Grund annehmen'); // „mit Grund“ ist eine eigene Aktion
    // Annehmer darf nicht ablehnen
    const d = interaction('button', cid('review:deny', id), {
      userId: U.acceptor,
      roleIds: [ROLE.accept],
    });
    await handleInteraction(client(), d);
    expect(text(d)).toContain('Du benötigst: Einreichungen ablehnen');
    // Betrachter darf ansehen, aber weder entscheiden noch Rückfrage
    for (const action of ['review:accept_r', 'review:deny', 'review:ask', 'review:interview']) {
      const i = interaction('button', cid(action, id), {
        userId: U.viewer,
        roleIds: [ROLE.viewer],
      });
      await handleInteraction(client(), i);
      expect(text(i), action).toContain('Du benötigst');
      expect(i.out.shown).toHaveLength(0);
    }
    // Mitglied ohne Rechte
    const n = interaction('button', cid('review:view', id), { userId: U.nobody, roleIds: [] });
    await handleInteraction(client(), n);
    expect(text(n)).toContain('Du benötigst');
    expect(await status(id)).toBe('SUBMITTED');
    expect(f.dms).toHaveLength(0);
  });

  it('„mit Grund“ ist eine eigene Aktion: Rolle nur mit „annehmen mit Grund“ darf nicht ohne Grund annehmen', async () => {
    await permissionRepository.setPermissionsForRole(G, 'r-reason', ['applications.submissions.accept_reason', 'applications.submissions.view'], { name: 'Nur mit Grund' });
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    const plain = interaction('button', cid('review:accept', id), { userId: 'u-reason', roleIds: ['r-reason'] });
    await handleInteraction(client(), plain); // „Annehmen“ ohne Grund
    expect(text(plain)).toContain('Du benötigst');
    expect(await status(id)).toBe('SUBMITTED');
    const withReason = await viaModal('review:accept_r', id, 'u-reason', ['r-reason'], { note: 'Starke Antworten' });
    expect(withReason.click.out.shown).toHaveLength(1); // Formular öffnet sich
    expect(await status(id)).toBe('ACCEPTED');
  });

  it('Modal-Absenden prüft die Berechtigung erneut (gefälschte Modal-ID eines Unberechtigten wirkt nicht)', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    const forged = interaction('modal', cid('review:accept_r', id), {
      userId: U.viewer,
      roleIds: [ROLE.viewer],
      fields: { note: 'x' },
    });
    await handleInteraction(client(), forged);
    expect(text(forged)).toContain('Du benötigst');
    expect(await status(id)).toBe('SUBMITTED');
  });

  it('Server-Besitzer und Administratoren dürfen immer', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    const { submit } = await viaModal('review:accept_r', id, OWNER, [], { note: 'Owner-Entscheidung.' });
    expect(text(submit)).toContain('Angenommen');
    expect(await status(id)).toBe('ACCEPTED');
  });
});

describe('Ansehen / Rückfrage / Gespräch', () => {
  it('Ansehen setzt „In Prüfung“ und zeigt Antworten; Rückfrage erreicht den Bewerber, seine Antwort das Team', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    await handleInteraction(
      client(),
      interaction('button', cid('review:accept_r', id), { userId: OWNER }),
    ); // Modal öffnet nur
    const view = interaction('button', cid('review:view', id), {
      userId: U.reviewer,
      roleIds: [ROLE.review],
    });
    await handleInteraction(client(), view);
    expect(await status(id)).toBe('UNDER_REVIEW');
    expect(text(view)).toContain('Max Mustermann');
    expect(text(view)).toContain('Streife');

    const { submit } = await viaModal('review:ask', id, ...REVIEW, {
      text: 'Wie lange spielst du schon RP?',
    });
    expect(text(submit)).toContain('gesendet');
    expect(f.dms.at(-1)).toMatchObject({ userId: APPLICANT });
    expect(f.dms.at(-1)!.content).toContain('Wie lange spielst du schon RP?');
    expect(await events(id)).toContain('clarification.asked');

    // Antwort des Bewerbers (keine laufende Bewerbung → Rückfrage-Antwort)
    const reply = vi.fn(async () => undefined);
    await handleDMMessage(client(), {
      channel: { isDMBased: () => true },
      author: { id: APPLICANT, bot: false },
      content: 'Seit drei Jahren.',
      reply,
    } as never);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('weitergeleitet'));
    expect(f.posts.at(-1)!.payload.content).toContain('Seit drei Jahren.');
    expect(await events(id)).toContain('clarification.answered');
    const notes = await prisma.applicationNote.findMany({ where: { submissionId: id } });
    expect(notes.map((n) => n.content).join('\n')).toContain('Antwort des Bewerbers');
    // eine zweite Nachricht ohne offene Rückfrage wird ignoriert
    const second = vi.fn(async () => undefined);
    await handleDMMessage(client(), {
      channel: { isDMBased: () => true },
      author: { id: APPLICANT, bot: false },
      content: 'Noch was',
      reply: second,
    } as never);
    expect(second).not.toHaveBeenCalled();
  });

  it('Gespräch: Einladung per DM, Status „In Prüfung“, Audit; DM-Sperre wird gemeldet', async () => {
    const f = fakePort({ dmFails: [APPLICANT] });
    setReviewPort(f.port as never);
    const id = await submitted();
    const { submit } = await viaModal('review:interview', id, ...REVIEW, {
      text: 'Morgen 19 Uhr im Büro-Warteraum',
    });
    expect(text(submit)).toContain('Direktnachrichten deaktiviert');
    expect(await status(id)).toBe('UNDER_REVIEW');
    expect(await events(id)).toContain('interview.invited');
    const notes = await prisma.applicationNote.findMany({ where: { submissionId: id } });
    expect(notes[0]!.content).toContain('DM nicht zustellbar');
  });
});

describe('Annehmen (Pipeline)', () => {
  it('setzt Status, vergibt die Rolle, informiert Bewerber und Leitung, aktualisiert die Nachricht – Personal-Schritte werden ehrlich als nicht verfügbar gemeldet', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    await viaModal('review:accept_r', id, ...REVIEW); // Prüfer darf nicht annehmen
    expect(await status(id)).toBe('SUBMITTED');
    const { submit } = await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen!' });
    const out = text(submit);
    expect(out).toContain('Angenommen');
    expect(out).toContain('✅ Einstiegsrolle vergeben');
    expect(out).toContain('✅ Bewerber informieren');
    expect(out).toContain('✅ Leitung informieren');
    for (const t of [
      'Personalakte prüfen/erstellen',
      'Dienstnummer vergeben',
      'Einstiegsdienstgrad setzen',
      'Team übernehmen/zuweisen',
      'Probezeit starten',
    ]) {
      expect(out).toContain(`⏳ ${t}`);
    }
    expect(await status(id)).toBe('ACCEPTED');
    expect(f.roles.get(APPLICANT)).toEqual(['entry-role']);
    const dm = f.dms.find((d) => d.userId === APPLICANT)!;
    expect(dm.content).toContain('angenommen');
    expect(dm.content).toContain('Willkommen!');
    expect(f.posts.at(-1)!.payload.content).toContain('angenommen');
    const edit = f.edits.at(-1)!;
    expect(edit.payload.embeds[0].description).toContain('Angenommen');
    expect(edit.payload.components).toEqual([]); // keine Schaltflächen mehr
    const ev = await events(id);
    expect(ev).toEqual(expect.arrayContaining(['submission.accepted', 'submission.pipeline']));
    const pipeline = (
      await prisma.applicationAuditEvent.findFirstOrThrow({
        where: { submissionId: id, action: 'submission.pipeline' },
      })
    ).metadata as any;
    expect(pipeline.overall).toBe('success');
    expect(pipeline.steps.map((s: any) => s.status)).toContain('unavailable');
    // Rollenänderung protokolliert (Auslöser, Automation, Berechtigung, Ergebnis)
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { guildId: G, action: 'role.change' },
    });
    expect(log).toMatchObject({
      result: 'success',
      automation: 'application-accept',
      permission: 'applications.submissions.accept',
      actorId: U.acceptor,
    });
    expect(log.after).toMatchObject({ roles: ['entry-role'] });
  });

  it('Rollenregeln der Bewerbung haben Vorrang vor der Server-Auswahl (Wartende Rolle entfernen, Annahme-Rolle vergeben)', async () => {
    await prisma.applicationRoleRule.createMany({
      data: [
        { applicationId: appId, type: 'PENDING', roleId: 'pending-role' },
        { applicationId: appId, type: 'ACCEPTED', roleId: 'recruit-role' },
      ],
    });
    const f = fakePort();
    setReviewPort(f.port as never);
    f.roles.set(APPLICANT, ['pending-role']);
    const id = await submitted();
    await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen im Team.' });
    expect(f.roles.get(APPLICANT)).toEqual(['recruit-role']);
  });

  it('Schritte sind einzeln abschaltbar', async () => {
    await prisma.application.update({
      where: { id: appId },
      data: {
        config: {
          review: { acceptPipeline: { roles: false, notifyLeadership: false } },
          questions,
        } as never,
      },
    });
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    const { submit } = await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen im Team.' });
    expect(text(submit)).toContain('⏭️ Einstiegsrolle vergeben');
    expect(text(submit)).toContain('⏭️ Leitung informieren');
    expect(f.roles.get(APPLICANT)).toBeUndefined();
    expect(f.dms.some((d) => d.userId === APPLICANT)).toBe(true);
  });

  it('Rolle scheitert (Bot-Rolle zu niedrig): Entscheidung bleibt, Ergebnis ehrlich „teilweise“, Team wird gewarnt, Protokoll „failed“', async () => {
    const f = fakePort({ rejectRoles: { 'entry-role': 403 } });
    setReviewPort(f.port as never);
    const id = await submitted();
    const { submit } = await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen im Team.' });
    const out = text(submit);
    expect(out).toContain('teilweise fehlgeschlagen');
    expect(out).toContain('❌ Einstiegsrolle vergeben');
    expect(out).toContain('Rollenposition');
    expect(await status(id)).toBe('ACCEPTED');
    expect(f.dms.some((d) => d.content.includes('angenommen'))).toBe(true); // Bewerber wird trotzdem informiert
    expect(f.posts.some((p) => String(p.payload.content).includes('nicht alle Schritte'))).toBe(
      true,
    );
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { guildId: G, action: 'role.change' },
    });
    expect(log.result).toBe('failed');
    expect(log.reason).toContain('Rollenposition');
    const pipeline = (
      await prisma.applicationAuditEvent.findFirstOrThrow({
        where: { submissionId: id, action: 'submission.pipeline' },
      })
    ).metadata as any;
    expect(pipeline.overall).toBe('partial');
  });

  it('Bewerber mit gesperrten DMs: Annahme gilt, Hinweis an das Team', async () => {
    const f = fakePort({ dmFails: [APPLICANT] });
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    const { submit } = await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen im Team.' });
    expect(text(submit)).toContain('❌ Bewerber informieren');
    expect(await status(id)).toBe('ACCEPTED');
  });

  it('Test-Bewerbungen verändern keine Rollen', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ isTest: true });
    await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen im Team.' });
    expect(f.roles.get(APPLICANT)).toBeUndefined();
    expect(await status(id)).toBe('ACCEPTED');
  });

  it('doppelte/gleichzeitige Entscheidungen: genau eine gewinnt', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    const run = (
      userId: string,
      roleIds: string[],
      button: string,
      fields: Record<string, string>,
    ) => viaModal(button, id, userId, roleIds, fields);
    const [a, b] = await Promise.all([
      run(U.acceptor, [ROLE.accept], 'review:accept_r', { note: 'A' }),
      run(OWNER, [], 'review:accept_r', { note: 'B' }),
    ]);
    const results = [text(a.submit), text(b.submit)];
    expect(results.filter((r) => r.startsWith('✅ Angenommen')).length).toBe(1);
    expect(results.filter((r) => r.includes('nicht mehr entschieden werden')).length).toBe(1);
    expect(
      await prisma.applicationAuditEvent.count({
        where: { submissionId: id, action: 'submission.accepted' },
      }),
    ).toBe(1);
    expect(f.roles.get(APPLICANT)).toEqual(['entry-role']);
  });
});

describe('Ablehnen', () => {
  it('Ablehnen verlangt einen Grund: Auswahl → abgelehnt mit Standardtext an den Bewerber, keine Rolle/Akte/Dienstnummer; ohne Recht geht nichts', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    const click = interaction('button', cid('review:deny', id), { userId: U.denier, roleIds: [ROLE.deny] });
    await handleInteraction(client(), click);
    expect(text(click)).toContain('Ablehnungsgrund');
    expect(await status(id)).toBe('SUBMITTED'); // der Klick allein lehnt nicht ab
    const pick = interaction('select', cid('review:denysel', id), { userId: U.denier, roleIds: [ROLE.deny], values: ['quality'] });
    await handleInteraction(client(), pick);
    expect(text(pick)).toContain('Abgelehnt');
    expect(await status(id)).toBe('DENIED');
    expect(f.dms.find((d) => d.userId === APPLICANT)!.content).toContain('abgelehnt');
    expect(f.roles.get(APPLICANT)).toBeUndefined();
    // „Eigener Text“ öffnet das Pflicht-Formular
    const id3 = await submitted({ f });
    const custom = interaction('select', cid('review:denysel', id3), { userId: U.denier, roleIds: [ROLE.deny], values: ['__custom'] });
    await handleInteraction(client(), custom);
    expect(custom.out.shown[0].title).toBe('Ablehnungstext');
    expect(await status(id3)).toBe('SUBMITTED');
    // ohne Recht geht es nicht
    const id2 = await submitted({ f });
    const nope = interaction('select', cid('review:denysel', id2), { userId: U.acceptor, roleIds: [ROLE.accept], values: ['quality'] });
    await handleInteraction(client(), nope);
    expect(await status(id2)).toBe('SUBMITTED');
  });

  it('Deny mit Grund: Modal mit Pflichtfeld – ohne Text passiert nichts; mit Text steht der Grund in DM, Verlauf und Datenbank', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    const empty = await viaModal('review:deny_r', id, U.denier, [ROLE.deny], { note: '   ' });
    expect(empty.click.out.shown[0].title).toBe('Provide a reason for denying');
    expect(text(empty.submit)).toContain('Bitte gib einen Grund an');
    expect(await status(id)).toBe('SUBMITTED');
    const { submit } = await viaModal('review:deny_r', id, U.denier, [ROLE.deny], { note: 'Bitte ausführlicher antworten.' });
    expect(text(submit)).toContain('Abgelehnt');
    expect(await status(id)).toBe('DENIED');
    expect(f.dms.find((d) => d.userId === APPLICANT)!.content).toContain('Bitte ausführlicher antworten.');
    const row = await prisma.applicationSubmission.findUniqueOrThrow({ where: { id } });
    expect(row.publicReason).toContain('ausführlicher');
    expect(row.internalReason).toContain('ausführlicher');
    expect(row.reviewerUserId).toBe(U.denier);
  });

  it('Annehmen mit Bestätigungsfenster (Bestätigen/Abbrechen) und Accept mit Grund (Pflichtfeld „Provide a reason for accepting“)', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    const reasonless = await viaModal('review:accept_r', id, ...ACCEPT, { note: '' });
    expect(reasonless.click.out.shown[0].title).toBe('Provide a reason for accepting');
    expect(await status(id)).toBe('SUBMITTED');
    const ask = interaction('button', cid('review:accept', id), { userId: ACCEPT[0], roleIds: ACCEPT[1] });
    await handleInteraction(client(), ask);
    expect(text(ask)).toContain('Bewerbung annehmen?');
    expect(await status(id)).toBe('SUBMITTED'); // erst nach „Bestätigen“
    await handleInteraction(client(), interaction('button', cid('review:cancel', id), { userId: ACCEPT[0], roleIds: ACCEPT[1] }));
    expect(await status(id)).toBe('SUBMITTED');
    const ok = interaction('button', cid('review:accept_ok', id), { userId: ACCEPT[0], roleIds: ACCEPT[1] });
    await handleInteraction(client(), ok);
    expect(text(ok)).toContain('Angenommen');
    expect(await status(id)).toBe('ACCEPTED');
    const nope = interaction('button', cid('review:accept', id), { userId: U.denier, roleIds: [ROLE.deny] }); // ohne Annahme-Recht
    await handleInteraction(client(), nope);
    expect(text(nope)).not.toContain('Bewerbung annehmen?');
    const id2 = await submitted({ f });
    await viaModal('review:accept_r', id2, ...ACCEPT, { note: 'Starke Bewerbung.' });
    expect((await prisma.applicationSubmission.findUniqueOrThrow({ where: { id: id2 } })).publicReason).toBe('Starke Bewerbung.');
  });

  it('unbekannter Ablehnungsgrund (z. B. aus dem Dashboard) wird abgelehnt', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    const r = await decideSubmission(f.port as never, { submissionId: id, guildId: G, reviewerId: U.denier, decision: 'DENIED', reasonId: 'gibt-es-nicht' });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('Unbekannter Ablehnungsgrund') });
    expect(await status(id)).toBe('SUBMITTED');
  });

  it('nach einer Entscheidung sind weitere Entscheidungen unmöglich', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen im Team.' });
    const again = await viaModal('review:deny_r', id, U.denier, [ROLE.deny], { note: 'zu spät' });
    expect(text(again.submit)).toContain('nicht mehr entschieden werden');
    expect(await status(id)).toBe('ACCEPTED');
  });
});

describe('Zurückziehen durch den Bewerber', () => {
  it('Bestätigung per Modal, Grund optional → WITHDRAWN, Team informiert, Nachricht ohne Schaltflächen; danach keine Entscheidung mehr', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    await handleInteraction(
      client(),
      interaction('button', cid('review:view', id), { userId: U.reviewer, roleIds: [ROLE.review] }),
    ); // sets UNDER_REVIEW + Nachricht-IDs
    await prisma.applicationSubmission.update({
      where: { id },
      data: { submissionChannelId: CH, submissionMessageId: 'msg-main' },
    });
    const dm: any = { isDMBased: () => true };
    const click = interaction('button', cid('dm:withdraw', id), { userId: APPLICANT, dm });
    await handleInteraction(client(), click);
    expect(click.out.shown).toHaveLength(1); // Bestätigungsdialog
    const submit = interaction('modal', click.out.shown[0].custom_id, {
      userId: APPLICANT,
      dm,
      fields: { reason: 'Habe mich anders entschieden.' },
    });
    await handleInteraction(client(), submit);
    expect(text(submit)).toContain('zurückgezogen');
    expect(await status(id)).toBe('WITHDRAWN');
    expect(f.posts.at(-1)!.payload.content).toContain('zurückgezogen');
    expect(f.posts.at(-1)!.payload.content).toContain('Habe mich anders entschieden.');
    expect(f.edits.at(-1)!.payload.components).toEqual([]);
    expect(await events(id)).toContain('submission.withdrawn');
    const late = await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen im Team.' });
    expect(text(late.submit)).toContain('nicht mehr entschieden werden');
    expect(await status(id)).toBe('WITHDRAWN');
    expect(f.roles.get(APPLICANT)).toBeUndefined();
  });

  it('nach der Entscheidung lässt sich nicht mehr zurückziehen; fremde Nutzer können es nie', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted();
    const foreign = interaction('button', cid('dm:withdraw', id), {
      userId: 'someone-else',
      dm: { isDMBased: () => true },
    });
    await handleInteraction(client(), foreign);
    expect(foreign.out.shown).toHaveLength(0);
    const forged = interaction('modal', cid('dm:withdraw', id), {
      userId: 'someone-else',
      dm: { isDMBased: () => true },
      fields: {},
    });
    await handleInteraction(client(), forged);
    expect(await status(id)).toBe('SUBMITTED');

    await viaModal('review:accept_r', id, ...ACCEPT, { note: 'Willkommen im Team.' });
    const own = interaction('modal', cid('dm:withdraw', id), {
      userId: APPLICANT,
      dm: { isDMBased: () => true },
      fields: {},
    });
    await handleInteraction(client(), own);
    expect(text(own)).toContain('nicht mehr zurückziehen');
    expect(await status(id)).toBe('ACCEPTED');
  });
});

describe('Bewerbungs-ID, Übernehmen und Zurücknehmen (Phase 54)', () => {
  const press = (action: string, id: string, userId: string, roleIds: string[]) => {
    const i = interaction('button', cid(`review:${action}`, id), { userId, roleIds });
    return handleInteraction(client(), i).then(() => i);
  };
  const assignee = async (id: string) => (await prisma.applicationSubmission.findUniqueOrThrow({ where: { id } })).assigneeUserId;

  it('ID je Bewerbungsart: Präfix, fortlaufend, einmalig; Testbewerbungen getrennt; Standard SUB', async () => {
    const { assignSubmissionNumber } = await import('@nexus/database');
    const a = await submitted();
    const b = await submitted();
    expect(await assignSubmissionNumber(a)).toBe('SUB-00001');
    expect(await assignSubmissionNumber(a)).toBe('SUB-00001'); // einmalig
    await prisma.application.update({ where: { id: appId }, data: { idPrefix: 'pol' } });
    expect(await assignSubmissionNumber(b)).toBe('POL-00001');
    const c = await submitted();
    expect(await assignSubmissionNumber(c)).toBe('POL-00002');
    const t = await submitted({ isTest: true });
    expect(await assignSubmissionNumber(t)).toBe('TPOL-00001');
    await prisma.application.update({ where: { id: appId }, data: { idPrefix: '../x' } }); // ungültig → Standard
    expect(await assignSubmissionNumber(await submitted())).toBe('SUB-00002');
  });

  it('Review-Nachricht zeigt ID und Bearbeiter („Noch nicht zugewiesen“), danach den Bearbeiter', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const { assignSubmissionNumber } = await import('@nexus/database');
    const id = await submitted();
    await assignSubmissionNumber(id);
    const { postSubmissionToReview } = await import('@nexus/automation');
    await postSubmissionToReview(f.port as never, id);
    const fields = JSON.stringify(f.posts[0]!.payload.embeds[0]);
    expect(fields).toContain('#SUB-');
    expect(fields).toContain('Noch nicht zugewiesen');
    await press('claim', id, ...REVIEW);
    expect(JSON.stringify(f.edits?.at(-1) ?? f.posts.at(-1))).toContain(U.reviewer);
  });

  it('Übernehmen: genau ein Bearbeiter; andere sehen „wird bereits bearbeitet“; Leitung darf übernehmen; Freigeben durch Bearbeiter/Leitung', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    const mine = await press('claim', id, ...REVIEW);
    expect(text(mine)).toContain('Du bearbeitest diese Bewerbung jetzt');
    expect(await assignee(id)).toBe(U.reviewer);
    expect(await status(id)).toBe('UNDER_REVIEW');
    const other = await press('claim', id, 'u-review2', [ROLE.review]);
    expect(text(other)).toContain(`wird bereits von <@${U.reviewer}> bearbeitet`);
    expect(await assignee(id)).toBe(U.reviewer);
    const lead = await press('claim', id, 'u-lead', [ROLE.lead]);
    expect(text(lead)).toContain('Du bearbeitest diese Bewerbung jetzt');
    expect(await assignee(id)).toBe('u-lead');
    const back = await press('claim', id, 'u-lead', [ROLE.lead]); // Umschalter: freigeben
    expect(text(back)).toContain('freigegeben');
    expect(await assignee(id)).toBeNull();
    const noRight = await press('claim', id, U.nobody, []);
    expect(await assignee(id)).toBeNull();
    expect(text(noRight)).not.toContain('Du bearbeitest');
    expect(await events(id)).toEqual(expect.arrayContaining(['submission.assigned', 'submission.released']));
    // Zuweisen: nur Führungskräfte
    expect(await assignSubmission(f.port as never, { submissionId: id, guildId: G, actorId: U.reviewer, assigneeId: '900000000000555001', canReassign: false })).toMatchObject({ ok: false });
    expect(await assignSubmission(f.port as never, { submissionId: id, guildId: G, actorId: 'u-lead', assigneeId: '900000000000555001', canReassign: true })).toMatchObject({ ok: true, assigneeId: '900000000000555001' });
    expect(await assignSubmission(f.port as never, { submissionId: id, guildId: G, actorId: 'u-lead', assigneeId: 'abc', canReassign: true })).toMatchObject({ ok: false });
  });

  it('Entscheiden: bei Zuweisung nur der Bearbeiter oder eine Führungskraft; ohne Zuweisung jeder Berechtigte', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    await press('claim', id, ...REVIEW);
    const blocked = interaction('button', cid('review:accept_ok', id), { userId: ACCEPT[0], roleIds: ACCEPT[1] });
    await handleInteraction(client(), blocked);
    expect(text(blocked)).toContain(`wird bereits von <@${U.reviewer}> bearbeitet`);
    expect(await status(id)).toBe('UNDER_REVIEW');
    const lead = interaction('button', cid('review:accept_ok', id), { userId: 'u-lead', roleIds: [ROLE.lead] });
    await handleInteraction(client(), lead);
    expect(text(lead)).toContain('Angenommen');
    expect(await status(id)).toBe('ACCEPTED');
    const free = await submitted({ f });
    const open = interaction('button', cid('review:accept_ok', free), { userId: ACCEPT[0], roleIds: ACCEPT[1] });
    await handleInteraction(client(), open);
    expect(await status(free)).toBe('ACCEPTED');
  });

  it('Zurücknehmen durch das Team: Grund Pflicht, Status WITHDRAWN, Bearbeiter protokolliert, Bewerber informiert; entschiedene nicht', async () => {
    const f = fakePort();
    const id = await submitted({ f });
    expect(await withdrawByStaff(f.port as never, { submissionId: id, guildId: G, actorId: 'u-lead', reason: ' ' })).toMatchObject({ ok: false });
    expect(await withdrawByStaff(f.port as never, { submissionId: id, guildId: 'anderer-server', actorId: 'u-lead', reason: 'Grund hier' })).toMatchObject({ ok: false });
    expect(await withdrawByStaff(f.port as never, { submissionId: id, guildId: G, actorId: 'u-lead', reason: 'Bewerbung doppelt eingereicht' })).toEqual({ ok: true });
    const row = await prisma.applicationSubmission.findUniqueOrThrow({ where: { id: id } });
    expect(row).toMatchObject({ status: 'WITHDRAWN', internalReason: 'Bewerbung doppelt eingereicht', reviewerUserId: 'u-lead' });
    expect(f.dms.find((d) => d.userId === APPLICANT)!.content).toContain('zurückgenommen');
    expect(await events(id)).toContain('submission.withdrawn_by_staff');
    expect(await withdrawByStaff(f.port as never, { submissionId: id, guildId: G, actorId: 'u-lead', reason: 'nochmal' })).toMatchObject({ ok: false });
    const done = await submitted({ f });
    await decideSubmission(f.port as never, { submissionId: done, guildId: G, reviewerId: 'u-lead', decision: 'DENIED', reasonId: 'quality' });
    expect(await withdrawByStaff(f.port as never, { submissionId: done, guildId: G, actorId: 'u-lead', reason: 'zu spät' })).toMatchObject({ ok: false });
  });
});

describe('Zurückstellen / Fortsetzen', () => {
  it('Prüfer stellt zurück und setzt fort (Status, Knopf, Verlauf); aus „zurückgestellt“ lässt sich direkt entscheiden', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    const click = async (userId: string, roleIds: string[]) => {
      const i = interaction('button', cid('review:hold', id), { userId, roleIds });
      await handleInteraction(client(), i);
      return text(i);
    };
    const labels = () => f.edits.at(-1)!.payload.components.flatMap((r: any) => r.components.map((c: any) => c.label));

    expect(await click(U.viewer, [ROLE.viewer])).toContain('Du benötigst'); // ohne Prüfrecht
    expect(await status(id)).toBe('SUBMITTED');

    expect(await click(U.reviewer, [ROLE.review])).toContain('zurückgestellt');
    expect(await status(id)).toBe('ON_HOLD');
    expect(labels()).toContain('Fortsetzen');
    expect(JSON.stringify(f.edits.at(-1)!.payload.embeds)).toContain('Zurückgestellt');

    expect(await click(U.reviewer, [ROLE.review])).toContain('weiter bearbeitet');
    expect(await status(id)).toBe('UNDER_REVIEW');
    expect(labels()).toContain('Zurückstellen');

    await click(U.reviewer, [ROLE.review]);
    expect(await status(id)).toBe('ON_HOLD');
    const ok = interaction('button', cid('review:accept_ok', id), { userId: ACCEPT[0], roleIds: ACCEPT[1] });
    await handleInteraction(client(), ok);
    expect(await status(id)).toBe('ACCEPTED');
    expect(await events(id)).toEqual(expect.arrayContaining(['submission.on_hold', 'submission.resumed']));
  });

  it('wer eine fremd zugewiesene Bewerbung nicht übernehmen darf, kann sie auch nicht zurückstellen', async () => {
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    await prisma.applicationSubmission.update({ where: { id }, data: { assigneeUserId: 'u-someone-else' } });
    const i = interaction('button', cid('review:hold', id), { userId: U.reviewer, roleIds: [ROLE.review] });
    await handleInteraction(client(), i);
    expect(text(i)).toContain('bereits von');
    expect(await status(id)).toBe('SUBMITTED');
  });
});

describe('Eigene Statusnamen (Team-Chance)', () => {
  it('Prüf-Nachricht im Discord und Hinweis „offene Bewerbung“ nutzen die Namen der Bewerbungsart', async () => {
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    const config = (app.config ?? {}) as Record<string, unknown>;
    await prisma.application.update({ where: { id: appId }, data: { config: { ...config, statusLabels: { SUBMITTED: { label: '📨 Eingegangen', color: '#123456' }, ON_HOLD: { label: '⏸️ Später' } } } as never } });
    try {
      const f = fakePort();
      setReviewPort(f.port as never);
      const id = await submitted({ f });
      expect(f.posts[0]!.payload.embeds[0].description).toBe('📨 Eingegangen');
      expect(f.posts[0]!.payload.embeds[0].color).toBe(0x123456);
      const hold = interaction('button', cid('review:hold', id), { userId: U.reviewer, roleIds: [ROLE.review] });
      await handleInteraction(client(), hold);
      expect(f.edits.at(-1)!.payload.embeds[0].description).toBe('⏸️ Später');
    } finally {
      await prisma.application.update({ where: { id: appId }, data: { config: config as never } });
    }
  });
});

describe('Ablehnungs-DM nennt die Wartezeit (Team-Chance)', () => {
  it('automatisch angehängt bzw. über {wartezeit}/{wiederAb} im eigenen Text', async () => {
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    const config = (app.config ?? {}) as Record<string, any>;
    try {
      await prisma.application.update({ where: { id: appId }, data: { config: { ...config, requirements: { denyCooldown: { days: 14 } } } as never } });
      const f = fakePort();
      setReviewPort(f.port as never);
      const id = await submitted({ f });
      await viaModal('review:deny_r', id, U.denier, [ROLE.deny], { note: 'Zu wenig Erfahrung.' });
      expect(await status(id)).toBe('DENIED');
      const dm = f.dms.find((d) => d.userId === APPLICANT)!.content;
      expect(dm).toContain('Zu wenig Erfahrung.');
      expect(dm).toContain('Du kannst dich nach 14 Tagen erneut bewerben');

      await prisma.application.update({ where: { id: appId }, data: { config: { ...config, requirements: { denyCooldown: { days: 14 } }, messages: { ...(config['messages'] ?? {}), denied: '❌ Leider abgelehnt. Neuer Versuch nach {wartezeit}.' } } as never } });
      const g = fakePort();
      setReviewPort(g.port as never);
      const id2 = await submitted({ f: g, userId: 'applicant-2' });
      await viaModal('review:deny_r', id2, U.denier, [ROLE.deny], { note: 'Bitte später.' });
      const dm2 = g.dms.find((d) => d.userId === 'applicant-2')!.content;
      expect(dm2).toContain('Neuer Versuch nach 14 Tagen.');
      expect(dm2).not.toContain('Du kannst dich nach'); // nicht doppelt
    } finally {
      await prisma.application.update({ where: { id: appId }, data: { config: config as never } });
    }
  });
});

describe('Ergebnis-Kanal (Team-Chance)', () => {
  it('Annahme wird gemeldet, Ablehnung nur wenn gewünscht, Testbewerbungen nie; eigener Text mit Platzhaltern', async () => {
    const RESULT = '900000000000710001';
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    const config = (app.config ?? {}) as Record<string, any>;
    const setReview = (extra: Record<string, unknown>) => prisma.application.update({ where: { id: appId }, data: { config: { ...config, review: { ...(config['review'] ?? {}), resultChannelId: RESULT, ...extra } } as never } });
    const inResult = (f: ReturnType<typeof fakePort>) => f.posts.filter((p) => p.channelId === RESULT);
    try {
      await setReview({ resultAcceptedText: '🎉 {user} ist jetzt im Team **{applicationName}**!' });
      const f = fakePort();
      setReviewPort(f.port as never);
      const a = await submitted({ f });
      await handleInteraction(client(), interaction('button', cid('review:accept_ok', a), { userId: ACCEPT[0], roleIds: ACCEPT[1] }));
      expect(await status(a)).toBe('ACCEPTED');
      expect(inResult(f)).toHaveLength(1);
      expect(inResult(f)[0]!.payload.embeds[0].description).toBe(`🎉 <@${APPLICANT}> ist jetzt im Team **Polizei**!`);
      expect(inResult(f)[0]!.payload.allowed_mentions).toEqual({ parse: [], users: [APPLICANT] });

      const d = await submitted({ f, userId: 'applicant-3' });
      await viaModal('review:deny_r', d, U.denier, [ROLE.deny], { note: 'Nein.' });
      expect(inResult(f)).toHaveLength(1); // Ablehnung standardmäßig nicht öffentlich

      await setReview({ resultPostDenied: true });
      const d2 = await submitted({ f, userId: 'applicant-4' });
      await viaModal('review:deny_r', d2, U.denier, [ROLE.deny], { note: 'Nein.' });
      expect(inResult(f)).toHaveLength(2);
      expect(inResult(f)[1]!.payload.embeds[0].description).toContain('wurde abgelehnt');

      const t = await submitted({ f, userId: 'applicant-5', isTest: true });
      await handleInteraction(client(), interaction('button', cid('review:accept_ok', t), { userId: ACCEPT[0], roleIds: ACCEPT[1] }));
      expect(inResult(f)).toHaveLength(2); // Testbewerbung
    } finally {
      await prisma.application.update({ where: { id: appId }, data: { config: config as never } });
    }
  });
});

describe('Mehrere Bearbeiter und Weiterleiten (Team-Chance)', () => {
  it('Hauptbearbeiter fügt weitere hinzu; diese dürfen entscheiden, andere nicht; Anzeige in der Prüf-Nachricht', async () => {
    const { setCoReviewer } = await import('@nexus/automation');
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    await prisma.applicationSubmission.update({ where: { id }, data: { assigneeUserId: 'u-main' } });
    // Nicht-Hauptbearbeiter ohne Führungsrecht darf nichts festlegen
    expect(await setCoReviewer(f.port as never, { submissionId: id, guildId: G, actorId: 'u-other', userId: '900000000000720001', add: true })).toMatchObject({ ok: false });
    const r = await setCoReviewer(f.port as never, { submissionId: id, guildId: G, actorId: 'u-main', userId: '900000000000720001', add: true });
    expect(r).toEqual({ ok: true, coReviewerIds: ['900000000000720001'] });
    expect(await setCoReviewer(f.port as never, { submissionId: id, guildId: G, actorId: 'u-main', userId: '900000000000720001', add: true })).toMatchObject({ ok: false, message: expect.stringContaining('bereits') });
    expect(JSON.stringify(f.edits.at(-1)!.payload.embeds)).toContain('(+ <@900000000000720001>)');
    expect(f.dms.some((d) => d.userId === '900000000000720001')).toBe(true);

    // Annehmer ohne Zuweisung wird abgewiesen …
    const ACC = '900000000000720009';
    const blocked = interaction('button', cid('review:accept_ok', id), { userId: ACC, roleIds: ACCEPT[1] });
    await handleInteraction(client(), blocked);
    expect(await status(id)).toBe('SUBMITTED');
    // … als weiterer Bearbeiter darf er entscheiden
    expect(await setCoReviewer(f.port as never, { submissionId: id, guildId: G, actorId: 'u-main', userId: ACC, add: true })).toMatchObject({ ok: true });
    await handleInteraction(client(), interaction('button', cid('review:accept_ok', id), { userId: ACC, roleIds: ACCEPT[1] }));
    expect(await status(id)).toBe('ACCEPTED');
    expect(await events(id)).toEqual(expect.arrayContaining(['submission.reviewer_added']));
  });

  it('Weiterleiten: neuer Hauptbearbeiter, Notiz im Verlauf, Benachrichtigung; nur Hauptbearbeiter oder Führungskraft', async () => {
    const { forwardSubmission, setCoReviewer } = await import('@nexus/automation');
    const f = fakePort();
    setReviewPort(f.port as never);
    const id = await submitted({ f });
    await prisma.applicationSubmission.update({ where: { id }, data: { assigneeUserId: 'u-main' } });
    await setCoReviewer(f.port as never, { submissionId: id, guildId: G, actorId: 'u-main', userId: '900000000000720002', add: true });
    expect(await forwardSubmission(f.port as never, { submissionId: id, guildId: G, actorId: 'u-other', toUserId: '900000000000720003' })).toMatchObject({ ok: false });
    expect(await forwardSubmission(f.port as never, { submissionId: id, guildId: G, actorId: 'u-main', toUserId: '900000000000720002', note: 'Bitte du übernehmen' })).toEqual({ ok: true });
    const row = await prisma.applicationSubmission.findUniqueOrThrow({ where: { id } });
    expect(row.assigneeUserId).toBe('900000000000720002');
    expect(await prisma.applicationReviewer.count({ where: { submissionId: id } })).toBe(0); // war weiterer Bearbeiter → jetzt Hauptbearbeiter
    expect(f.dms.find((d) => d.userId === '900000000000720002' && d.content.includes('weitergeleitet'))!.content).toContain('Bitte du übernehmen');
    const ev = await prisma.applicationAuditEvent.findFirstOrThrow({ where: { submissionId: id, action: 'submission.forwarded' } });
    expect(ev.after).toMatchObject({ assigneeId: '900000000000720002', note: 'Bitte du übernehmen' });
    // Führungskraft darf immer
    expect(await forwardSubmission(f.port as never, { submissionId: id, guildId: G, actorId: 'u-lead', toUserId: '900000000000720003', canReassign: true })).toEqual({ ok: true });
  });
});
