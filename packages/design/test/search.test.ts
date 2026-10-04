import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NOTIFICATION_KEYS,
  NOTIFICATION_TYPES,
  getNotifications,
  normalizeConfig,
  notificationTypeOf,
  searchAll,
} from '../src/index.js';

const [A, B] = ['srtest-a', 'srtest-b'];
const all = async () => true;
const none = async () => false;
const only =
  (...perms: string[]) =>
  async (p: string) =>
    perms.includes(p);
const U = '900000000000990001';

async function seed(g: string, tag: string) {
  const cat = await prisma.ticketCategory.create({ data: { guildId: g, name: 'Support' } });
  await prisma.ticket.create({
    data: {
      guildId: g,
      number: 1,
      categoryId: cat.id,
      userId: U,
      subject: `Waffenschein ${tag}`,
      status: 'OPEN',
    },
  });
  await prisma.ticket.create({
    data: {
      guildId: g,
      number: 2,
      categoryId: cat.id,
      userId: U,
      subject: `Beschwerde ${tag}`,
      status: 'CLOSED',
    },
  });
  const app = await prisma.application.create({
    data: { guildId: g, name: 'Polizei', slug: 'polizei', config: {}, createdBy: U, updatedBy: U },
  });
  const ver = await prisma.applicationVersion.create({
    data: { applicationId: app.id, questions: [], publishedById: U },
  });
  const sub = await prisma.applicationSubmission.create({
    data: {
      guildId: g,
      applicationId: app.id,
      versionId: ver.id,
      submissionNumber: 'SUB-0007',
      userId: U,
      usernameSnapshot: `anwaerter_${tag}`,
      displayNameSnapshot: `Max Muster ${tag}`,
      status: 'SUBMITTED',
    },
  });
  const rec = await prisma.personnelRecord.create({
    data: { guildId: g, userId: U, rpName: `Hans Beispiel ${tag}`, serviceNumber: `P-${tag}-12` },
  });
  return { sub, rec };
}

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [A, B] } } });
  for (const id of [A, B])
    await prisma.guild.create({ data: { id, name: id, settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.$disconnect();
});

describe('Globale Suche', () => {
  it('findet Tickets, Transcripts, Bewerbungen und Teammitglieder – nur dieses Servers', async () => {
    const a = await seed(A, 'Alpha');
    await seed(B, 'Beta');
    const r = await searchAll(A, 'waffen', all);
    expect(r.groups.map((g) => g.kind)).toEqual(['tickets']);
    expect(r.groups[0]!.items).toEqual([
      expect.objectContaining({
        title: '#1 Waffenschein Alpha',
        subtitle: 'offen',
        path: '/tickets',
      }),
    ]);
    expect((await searchAll(A, 'beschwerde', all)).groups[0]).toMatchObject({
      kind: 'transcripts',
      items: [expect.objectContaining({ subtitle: 'geschlossen' })],
    });
    const apps = (await searchAll(A, 'max muster', all)).groups[0]!;
    expect(apps).toMatchObject({ kind: 'applications', label: 'Bewerbungen' });
    expect(apps.items[0]).toMatchObject({ id: a.sub.id, path: `/submissions/${a.sub.id}` });
    const team = (await searchAll(A, 'hans', all)).groups[0]!;
    expect(team.items[0]).toMatchObject({ id: a.rec.id, path: `/personnel/${a.rec.id}` });
    // Server B taucht nirgends auf
    expect(JSON.stringify(await searchAll(A, 'beta', all))).not.toContain('Beta');
    expect((await searchAll(A, 'beta', all)).groups).toEqual([]);
  });
  it('Nummern: „#1“, „1“, „SUB-7“ / „sub0007“', async () => {
    await seed(A, 'Alpha');
    expect(
      (await searchAll(A, '#1', all)).groups.find((g) => g.kind === 'tickets')!.items,
    ).toHaveLength(1);
    expect(
      (await searchAll(A, '12', all)).groups.find((g) => g.kind === 'personnel')?.items,
    ).toHaveLength(1); // Teil der Dienstnummer P-Alpha-12
    for (const q of ['SUB-7', 'sub0007', 'SUB-0007'])
      expect(
        (await searchAll(A, q, all)).groups.find((g) => g.kind === 'applications')?.items,
        q,
      ).toHaveLength(1);
    expect((await searchAll(A, 'P-Alpha', all)).groups[0]!.kind).toBe('personnel'); // Dienstnummer
  });
  it('Rechte: ohne Recht keine Gruppe – auch kein Hinweis auf Treffer', async () => {
    await seed(A, 'Alpha');
    expect((await searchAll(A, 'alpha', none)).groups).toEqual([]);
    const t = await searchAll(A, 'alpha', only('tickets.view'));
    expect(t.groups.map((g) => g.kind)).toEqual(['tickets', 'transcripts']); // offene und geschlossene Tickets
    expect(JSON.stringify(t)).not.toContain('Max Muster');
    expect(JSON.stringify(t)).not.toContain('Hans Beispiel');
    expect((await searchAll(A, 'alpha', only('personnel.view'))).groups.map((g) => g.kind)).toEqual(
      ['personnel'],
    );
  });
  it('zu kurze Suche, Sonderzeichen, Länge', async () => {
    await seed(A, 'Alpha');
    expect((await searchAll(A, 'a', all)).groups).toEqual([]);
    expect((await searchAll(A, '   ', all)).groups).toEqual([]);
    for (const q of [
      "'; DROP TABLE tickets;--",
      '%%',
      '_',
      '\\',
      '<script>alert(1)</script>',
      'x'.repeat(500),
    ])
      await expect(searchAll(A, q, all), q).resolves.toBeTruthy();
    expect((await searchAll(A, 'x'.repeat(500), all)).query.length).toBe(60);
    expect(await prisma.ticket.count({ where: { guildId: A } })).toBe(2); // nichts passiert
  });
  it('höchstens 5 Treffer je Gruppe', async () => {
    const cat = await prisma.ticketCategory.create({ data: { guildId: A, name: 'S' } });
    for (let i = 1; i <= 12; i++)
      await prisma.ticket.create({
        data: {
          guildId: A,
          number: i,
          categoryId: cat.id,
          userId: U,
          subject: `Massentest ${i}`,
          status: 'OPEN',
        },
      });
    expect((await searchAll(A, 'massentest', all)).groups[0]!.items).toHaveLength(5);
  });
});

describe('Benachrichtigungen', () => {
  it('Zuordnung Audit-Aktion → Art', () => {
    expect(notificationTypeOf('ticket.opened')).toBe('ticketNew');
    expect(notificationTypeOf('ticket.ping')).toBe('ticketWaiting');
    expect(notificationTypeOf('submission.submitted')).toBe('applicationNew');
    expect(notificationTypeOf('submission.accepted')).toBe('applicationAccepted');
    expect(notificationTypeOf('submission.denied')).toBe('applicationDenied');
    expect(notificationTypeOf('personnel.team.deleted')).toBe('teamChange');
    expect(notificationTypeOf('settings.selection.set')).toBe('settingsChanged');
    expect(notificationTypeOf('design.theme.activated')).toBe('settingsChanged');
    expect(notificationTypeOf('design.asset.uploaded')).toBeNull(); // Upload ist keine Systemeinstellung
    expect(notificationTypeOf('ticket.closed')).toBe('ticketClosed');
    expect(notificationTypeOf('ticket.claimed')).toBe('ticketAssigned');
    expect(notificationTypeOf('ticket.waiting')).toBe('ticketWaiting');
    expect(notificationTypeOf('training.created')).toBe('trainingNew');
    expect(notificationTypeOf('training.finished')).toBe('trainingCompleted');
    expect(notificationTypeOf('wanted.created')).toBe('wantedNew');
    expect(notificationTypeOf('restriction.created')).toBe('restrictionCreated');
    expect(notificationTypeOf('restriction.expired')).toBe('restrictionExpired');
    expect(notificationTypeOf('role.change')).toBe('roleChange');
    expect(notificationTypeOf('promotion.approved')).toBe('teamChange');
    expect(notificationTypeOf('ticket.priority')).toBeNull(); // nicht jede Änderung ist eine Benachrichtigung
  });
  it('liefert Ereignisse mit Nummer/Betreff, nur dieser Server, neueste zuerst', async () => {
    const { sub } = await seed(A, 'Alpha');
    await seed(B, 'Beta');
    const tA = (await prisma.ticket.findFirst({ where: { guildId: A, number: 1 } }))!;
    const log = (
      guildId: string,
      action: string,
      resourceType: string,
      resourceId: string | null,
      createdAt = new Date(),
    ) =>
      prisma.auditLog.create({
        data: { guildId, actorType: 'USER', action, resourceType, resourceId, createdAt },
      });
    await log(A, 'ticket.opened', 'Ticket', tA.id, new Date(Date.now() - 60_000));
    await log(A, 'submission.submitted', 'ApplicationSubmission', sub.id);
    await log(
      B,
      'ticket.opened',
      'Ticket',
      (await prisma.ticket.findFirst({ where: { guildId: B } }))!.id,
    );
    const n = await getNotifications(A, NOTIFICATION_KEYS, all);
    expect(n.map((x) => x.type)).toEqual(['applicationNew', 'ticketNew']);
    expect(n[0]).toMatchObject({
      title: 'Neue Bewerbung',
      text: 'SUB-0007 Max Muster Alpha',
      path: `/submissions/${sub.id}`,
    });
    expect(n[1]).toMatchObject({
      text: '#1 Waffenschein Alpha',
      icon: NOTIFICATION_TYPES.ticketNew.icon,
    });
    expect(JSON.stringify(n)).not.toContain('Beta');
  });
  it('nur die gewählten Arten und nur mit Recht', async () => {
    const { sub } = await seed(A, 'Alpha');
    const tA = (await prisma.ticket.findFirst({ where: { guildId: A, number: 1 } }))!;
    await prisma.auditLog.createMany({
      data: [
        {
          guildId: A,
          actorType: 'USER',
          action: 'ticket.opened',
          resourceType: 'Ticket',
          resourceId: tA.id,
        },
        {
          guildId: A,
          actorType: 'USER',
          action: 'submission.accepted',
          resourceType: 'ApplicationSubmission',
          resourceId: sub.id,
        },
        { guildId: A, actorType: 'USER', action: 'settings.selection.set' },
      ],
    });
    expect((await getNotifications(A, ['ticketNew'], all)).map((x) => x.type)).toEqual([
      'ticketNew',
    ]); // Auswahl des Administrators
    expect(
      (await getNotifications(A, NOTIFICATION_KEYS, only('tickets.view'))).map((x) => x.type),
    ).toEqual(['ticketNew']); // Recht
    expect(await getNotifications(A, NOTIFICATION_KEYS, none)).toEqual([]);
    expect(await getNotifications(A, [], all)).toEqual([]);
    expect(await getNotifications(A, ['gibts-nicht', '__proto__'], all)).toEqual([]);
    const cfg = (await getNotifications(A, NOTIFICATION_KEYS, only('config.view')))[0]!;
    expect(cfg).toMatchObject({ type: 'settingsChanged', text: 'Einstellungen wurden geändert.' });
  });
  it('Spezifikation 53: Sperren, Ausbildung, Fahndung, Ticket, Rollen, Verlassen – je nur mit passendem Recht', async () => {
    await seed(A, 'Alpha');
    const mk = (action: string, resourceType: string) => prisma.auditLog.create({ data: { guildId: A, actorType: 'USER', action, resourceType, resourceId: 'x' } });
    for (const [a, r] of [['restriction.created', 'Restriction'], ['restriction.expired', 'Restriction'], ['training.created', 'Training'], ['training.finished', 'Training'], ['wanted.created', 'WantedNotice'], ['role.change', 'User'], ['member.left', 'User']] as const) await mk(a, r);
    const full = await getNotifications(A, NOTIFICATION_KEYS, all);
    expect(full.map((x) => x.type).sort()).toEqual(['memberLeft', 'restrictionCreated', 'restrictionExpired', 'roleChange', 'trainingCompleted', 'trainingNew', 'wantedNew']);
    expect(full.find((x) => x.type === 'restrictionCreated')).toMatchObject({ path: '/restrictions', text: 'Eine Sperre wurde verhängt.' });
    expect(full.find((x) => x.type === 'wantedNew')?.path).toBe('/wanted');
    const onlyRestrictions = await getNotifications(A, NOTIFICATION_KEYS, async (p) => p === 'restrictions.view');
    expect(onlyRestrictions.map((x) => x.type).sort()).toEqual(['restrictionCreated', 'restrictionExpired']);
    expect(await getNotifications(A, NOTIFICATION_KEYS, async () => false)).toEqual([]);
    expect((await getNotifications(A, ['wantedNew'], all)).map((x) => x.type)).toEqual(['wantedNew']); // Auswahl im Design
  });
  it('nur die letzten 14 Tage, höchstens 30', async () => {
    await prisma.auditLog.create({
      data: {
        guildId: A,
        actorType: 'USER',
        action: 'settings.x',
        createdAt: new Date(Date.now() - 20 * 86_400_000),
      },
    });
    expect(await getNotifications(A, ['settingsChanged'], all)).toEqual([]);
    await prisma.auditLog.createMany({
      data: Array.from({ length: 50 }, () => ({
        guildId: A,
        actorType: 'USER' as const,
        action: 'settings.y',
      })),
    });
    expect(await getNotifications(A, ['settingsChanged'], all)).toHaveLength(30);
  });
  it('Konfiguration: Arten werden bereinigt, Standard = alle', () => {
    expect(normalizeConfig({}).header.notificationTypes).toEqual([...NOTIFICATION_KEYS]);
    expect(
      normalizeConfig({ header: { notificationTypes: ['teamChange', 'ticketNew', 'blödsinn'] } })
        .header.notificationTypes,
    ).toEqual(['ticketNew', 'teamChange']);
    expect(normalizeConfig({ header: { notificationTypes: [] } }).header.notificationTypes).toEqual(
      [],
    );
    expect(
      normalizeConfig({ header: { notificationTypes: 'alle' } }).header.notificationTypes,
    ).toEqual([...NOTIFICATION_KEYS]);
  });
});

describe('Design-Änderungsprotokoll', () => {
  it('liest nur design.*-Einträge dieses Servers, neueste zuerst, mit lesbarem Text', async () => {
    const { createTheme, activateTheme, getDesignHistory, updateTheme } =
      await import('../src/index.js');
    const t = await createTheme({ guildId: A, actorId: U, name: 'Protokoll' });
    await updateTheme({
      guildId: A,
      themeId: t.id,
      actorId: U,
      config: { colors: { dark: { primary: '#123456' } } },
    });
    await activateTheme(A, t.id, U);
    await createTheme({ guildId: B, actorId: U, name: 'Fremd' });
    await prisma.auditLog.create({
      data: { guildId: A, actorType: 'USER', action: 'ticket.opened' },
    });
    const h = await getDesignHistory(A);
    expect(h.map((e) => e.text)).toEqual([
      'Theme aktiviert: Theme „Protokoll“ aktiviert'.replace('Theme aktiviert: ', ''),
      expect.stringContaining('Farben'),
      'Theme „Protokoll“ erstellt',
    ]);
    expect(h.every((e) => e.actorId === U)).toBe(true);
    expect(JSON.stringify(h)).not.toContain('Fremd');
    expect(h[0]!.icon).toBe('✅');
  });
});
