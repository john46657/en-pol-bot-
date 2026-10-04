import { decideSubmission } from '@nexus/automation';
import { DiscordApiError } from '@nexus/discord';
import { permissionRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  effectiveState,
  setTeamState,
  PersonnelError,
  addEntry,
  archiveRecord,
  buildActor,
  canOn,
  createRecord,
  deleteRank,
  deleteTeam,
  generateServiceNumber,
  getNumberFormat,
  getRecordByUser,
  listRanks,
  listRecords,
  recordSections,
  restoreRecord,
  revokeEntry,
  saveRank,
  saveTeam,
  scopeFor,
  setNumberFormat,
  setRank,
  setServiceNumber,
  setTeam,
  updateRecord,
  visibleSections,
} from '../src/index.js';

const G = 'perstest-guild';
const U = (n: number) => `9000000000000000${String(n).padStart(2, '0')}`;
const ACTOR = '900000000000000999';

async function reset() {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Personal-Test', settings: { create: {} } } });
}
beforeEach(reset);
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

// --- Discord-Attrappe ---------------------------------------------------------
function fakePort(opts: { rejectRoles?: Record<string, number>; dmFails?: string[] } = {}) {
  const dms: { userId: string; content: string }[] = [];
  const posts: any[] = [];
  const roles = new Map<string, string[]>();
  const port: any = {
    sendDm: vi.fn(async (userId: string, p: any) => {
      if (opts.dmFails?.includes(userId)) throw new DiscordApiError(403, '/dm', 'closed');
      dms.push({ userId, content: String(p.content ?? '') });
    }),
    postMessage: vi.fn(async (_c: string, p: any) => (posts.push(p), { id: `m${posts.length}` })),
    editMessage: vi.fn(async () => undefined),
    roleDriver: () => ({
      getRoleIds: async (u: string) => [...(roles.get(u) ?? [])],
      add: async (u: string, r: string) => {
        if (opts.rejectRoles?.[r])
          throw new DiscordApiError(opts.rejectRoles[r]!, '/r', 'Missing Permissions');
        roles.set(u, [...(roles.get(u) ?? []), r]);
      },
      remove: async (u: string, r: string) => {
        if (opts.rejectRoles?.[r])
          throw new DiscordApiError(opts.rejectRoles[r]!, '/r', 'Missing Permissions');
        roles.set(
          u,
          (roles.get(u) ?? []).filter((x) => x !== r),
        );
      },
    }),
  };
  return { port, dms, posts, roles };
}

const rec = (n: number, extra: Record<string, unknown> = {}) =>
  createRecord({
    guildId: G,
    userId: U(n),
    rpName: `Beamter ${n}`,
    actorId: ACTOR,
    ...extra,
  } as never);

describe('Personalakte anlegen und ändern', () => {
  it('legt eine Akte an, protokolliert Verlauf und Audit-Log', async () => {
    const r = await rec(1);
    expect(r).toMatchObject({ rpName: 'Beamter 1', status: 'ACTIVE', serviceNumber: null });
    const ev = await prisma.personnelEvent.findMany({ where: { recordId: r.id } });
    expect(ev.map((e) => e.type)).toEqual(['created']);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { guildId: G, action: 'personnel.created' },
    });
    expect(audit).toMatchObject({
      resourceType: 'PersonnelRecord',
      resourceId: r.id,
      actorId: ACTOR,
      result: 'success',
    });
  });

  it('je Mitglied und Server nur eine Akte; ungültige Eingaben werden abgelehnt', async () => {
    await rec(1);
    await expect(rec(1)).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      createRecord({ guildId: G, userId: U(2), rpName: 'x', actorId: ACTOR }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      createRecord({ guildId: G, userId: 'abc', rpName: 'Max', actorId: ACTOR }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      createRecord({ guildId: '', userId: U(3), rpName: 'Max', actorId: ACTOR }),
    ).rejects.toThrow();
  });

  it('ändern: Name mit Vorher/Nachher im Verlauf; ohne Änderung kein Eintrag', async () => {
    const r = await rec(1);
    await updateRecord(G, r.id, { rpName: ' Max Neu ' }, ACTOR);
    await updateRecord(G, r.id, {}, ACTOR);
    const ev = (
      await prisma.personnelEvent.findMany({ where: { recordId: r.id, type: 'edited' } })
    )[0]!;
    expect(ev.before).toMatchObject({ rpName: 'Beamter 1' });
    expect(ev.after).toMatchObject({ rpName: 'Max Neu' });
    expect(await prisma.personnelEvent.count({ where: { recordId: r.id, type: 'edited' } })).toBe(
      1,
    );
  });

  it('archivieren/wiederherstellen mit Grund; doppelt wird abgelehnt', async () => {
    const r = await rec(1);
    const a = await archiveRecord(G, r.id, 'Ausgetreten', ACTOR);
    expect(a).toMatchObject({ status: 'ARCHIVED', archivedReason: 'Ausgetreten', archivedBy: ACTOR });
    expect(a.archivedAt).not.toBeNull();
    await expect(archiveRecord(G, r.id, undefined, ACTOR)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect((await restoreRecord(G, r.id, ACTOR)).status).toBe('ACTIVE');
    await expect(restoreRecord(G, r.id, ACTOR)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('Schließen (CLOSED) verlangt einen Grund; Akte bleibt erhalten', async () => {
    const r = await rec(1);
    await expect(archiveRecord(G, r.id, undefined, ACTOR)).rejects.toMatchObject({ code: 'invalid' });
    await expect(archiveRecord(G, r.id, '  ', ACTOR)).rejects.toMatchObject({ code: 'invalid' });
    await expect(archiveRecord(G, r.id, 'x'.repeat(301), ACTOR)).rejects.toMatchObject({ code: 'invalid' });
    expect((await prisma.personnelRecord.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('ACTIVE');
    await archiveRecord(G, r.id, 'Austritt aus dem Polizeidienst', ACTOR);
    expect(await prisma.personnelRecord.count({ where: { id: r.id } })).toBe(1);
    expect(await prisma.personnelEvent.count({ where: { recordId: r.id, type: 'archived' } })).toBe(1);
  });

  it('Teamzustände: wechseln, Suspendierung braucht Grund, geschlossen gesperrt, Wiederherstellen setzt auf aktiv', async () => {
    const r = await rec(1);
    expect(effectiveState(r)).toBe('ACTIVE');
    const p = await setTeamState(G, r.id, 'PAUSE', undefined, ACTOR);
    expect(p).toMatchObject({ teamState: 'PAUSE', teamStateBy: ACTOR });
    expect(effectiveState(p)).toBe('PAUSE');
    await expect(setTeamState(G, r.id, 'PAUSE', undefined, ACTOR)).rejects.toMatchObject({ code: 'conflict' });
    await expect(setTeamState(G, r.id, 'SUSPENDED', undefined, ACTOR)).rejects.toMatchObject({ code: 'invalid' });
    await expect(setTeamState(G, r.id, 'CLOSED', 'x', ACTOR)).rejects.toMatchObject({ code: 'invalid' }); // nur über Schließen
    await expect(setTeamState(G, r.id, 'BOOT', 'xxx', ACTOR)).rejects.toMatchObject({ code: 'invalid' });
    const s = await setTeamState(G, r.id, 'SUSPENDED', 'Dienstvergehen', ACTOR);
    expect(s.teamStateReason).toBe('Dienstvergehen');
    const a = await setTeamState(G, r.id, 'ACTIVE', 'Zurück', ACTOR);
    expect(a.teamStateReason).toBeNull();
    const ev = await prisma.personnelEvent.findMany({ where: { recordId: r.id, type: 'state.changed' }, orderBy: { createdAt: 'asc' } });
    expect(ev).toHaveLength(3);
    await setTeamState(G, r.id, 'OFF_DUTY', undefined, ACTOR);
    const closed = await archiveRecord(G, r.id, 'Austritt', ACTOR);
    expect(effectiveState(closed)).toBe('CLOSED');
    await expect(setTeamState(G, r.id, 'ACTIVE', undefined, ACTOR)).rejects.toMatchObject({ code: 'conflict' });
    const back = await restoreRecord(G, r.id, ACTOR);
    expect(back).toMatchObject({ status: 'ACTIVE', teamState: 'ACTIVE', archivedBy: null });
  });

  it('Akten anderer Server sind unerreichbar', async () => {
    const r = await rec(1);
    await expect(
      updateRecord('anderer-server', r.id, { rpName: 'Hack' }, ACTOR),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(await getRecordByUser('anderer-server', U(1))).toBeNull();
  });
});

describe('Dienstnummern', () => {
  it('Format wird gespeichert; automatische Nummern zählen hoch und überspringen vergebene', async () => {
    await setNumberFormat(G, { prefix: 'EN-', digits: 3, next: 5 }, ACTOR);
    expect(await getNumberFormat(G)).toEqual({ prefix: 'EN-', digits: 3, next: 5 });
    const a = await rec(1);
    await setServiceNumber(G, a.id, 'EN-006', ACTOR); // manuell die „übernächste“
    const first = await generateServiceNumber(G);
    const second = await generateServiceNumber(G);
    expect([first, second]).toEqual(['EN-005', 'EN-007']);
  });

  it('parallele Vergabe liefert nie dieselbe Nummer', async () => {
    const records = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => rec(n)));
    const nums = await Promise.all(records.map((r) => setServiceNumber(G, r.id, 'auto', ACTOR)));
    const set = new Set(nums.map((r) => r.serviceNumber));
    expect(set.size).toBe(6);
  });

  it('doppelte oder ungültige Nummern werden abgelehnt; Format wird validiert', async () => {
    const a = await rec(1);
    const b = await rec(2);
    await setServiceNumber(G, a.id, 'X-1', ACTOR);
    await expect(setServiceNumber(G, b.id, 'X-1', ACTOR)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(setServiceNumber(G, b.id, 'ungültig!', ACTOR)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(setNumberFormat(G, { digits: 0 }, ACTOR)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(setNumberFormat(G, { prefix: 'zu-lang-zu-lang' }, ACTOR)).rejects.toMatchObject({
      code: 'invalid',
    });
    // Nummernkreise sind je Server getrennt
    await prisma.guild.create({ data: { id: `${G}-2`, name: 'Zwei', settings: { create: {} } } });
    expect(await generateServiceNumber(`${G}-2`)).toBe('001');
    await prisma.guild.delete({ where: { id: `${G}-2` } });
  });
});

describe('Dienstgrad und Team', () => {
  it('Dienstgrad setzen: Verlauf, Rollenwechsel alt → neu über das Rollenprotokoll', async () => {
    const f = fakePort();
    const low = await saveRank(G, { name: 'Anwärter', order: 1, discordRoleId: '111111' }, ACTOR);
    const high = await saveRank(G, { name: 'Kommissar', order: 5, discordRoleId: '222222' }, ACTOR);
    const r = await rec(1);
    f.roles.set(U(1), []);
    await setRank(G, r.id, low.id, ACTOR, { port: f.port });
    const { record, roleChange } = await setRank(G, r.id, high.id, ACTOR, {
      port: f.port,
      permission: 'personnel.rank.edit',
    });
    expect(record.rank?.name).toBe('Kommissar');
    expect(roleChange?.status).toBe('success');
    expect(f.roles.get(U(1))).toEqual(['222222']);
    const ev = await prisma.personnelEvent.findMany({
      where: { recordId: r.id, type: 'rank.changed' },
      orderBy: { createdAt: 'asc' },
    });
    expect(ev[1]).toMatchObject({ before: { rank: 'Anwärter' }, after: { rank: 'Kommissar' } });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { guildId: G, action: 'role.change' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toMatchObject({ result: 'success', permission: 'personnel.rank.edit' });
  });

  it('Rollenfehler wird gemeldet, die Änderung der Akte bleibt bestehen', async () => {
    const f = fakePort({ rejectRoles: { '222222': 403 } });
    const rank = await saveRank(G, { name: 'Kommissar', order: 5, discordRoleId: '222222' }, ACTOR);
    const r = await rec(1);
    const { record, roleChange } = await setRank(G, r.id, rank.id, ACTOR, { port: f.port });
    expect(record.rankId).toBe(rank.id);
    expect(roleChange?.status).toBe('failed');
    expect(roleChange?.message).toContain('Rollenposition');
  });

  it('gleicher Wert ändert nichts; unbekannter/deaktivierter Dienstgrad und Team werden abgelehnt', async () => {
    const rank = await saveRank(G, { name: 'A', order: 1 }, ACTOR);
    const off = await saveRank(G, { name: 'B', order: 2, active: false }, ACTOR);
    const r = await rec(1, { rankId: rank.id });
    const same = await setRank(G, r.id, rank.id, ACTOR);
    expect(same.roleChange).toBeUndefined();
    expect(
      await prisma.personnelEvent.count({ where: { recordId: r.id, type: 'rank.changed' } }),
    ).toBe(0);
    await expect(setRank(G, r.id, off.id, ACTOR)).rejects.toMatchObject({ code: 'invalid' });
    await expect(setRank(G, r.id, 'gibt-es-nicht', ACTOR)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(setTeam(G, r.id, 'gibt-es-nicht', ACTOR)).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('Team wechseln: Teamrolle alt → neu, Verlauf', async () => {
    const f = fakePort();
    const a = await saveTeam(G, { name: 'Streife', discordRoleId: '333333' }, ACTOR);
    const b = await saveTeam(G, { name: 'Verkehr', discordRoleId: '444444' }, ACTOR);
    const r = await rec(1, { teamId: a.id });
    f.roles.set(U(1), ['333333']);
    const { record } = await setTeam(G, r.id, b.id, ACTOR, { port: f.port });
    expect(record.team?.name).toBe('Verkehr');
    expect(f.roles.get(U(1))).toEqual(['444444']);
    expect(
      await prisma.personnelEvent.findFirst({ where: { recordId: r.id, type: 'team.changed' } }),
    ).toMatchObject({ before: { team: 'Streife' }, after: { team: 'Verkehr' } });
  });

  it('nur ein Einstiegsdienstgrad je Server; Löschen verwendeter Dienstgrade/Teams wird verweigert', async () => {
    const a = await saveRank(G, { name: 'A', order: 1, isEntry: true }, ACTOR);
    const b = await saveRank(G, { name: 'B', order: 2, isEntry: true }, ACTOR);
    const ranks = await listRanks(G);
    expect(ranks.filter((x) => x.isEntry).map((x) => x.id)).toEqual([b.id]);
    await expect(saveRank(G, { name: 'A', order: 3 }, ACTOR)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(saveRank(G, { name: 'Z', order: 5000 }, ACTOR)).rejects.toMatchObject({
      code: 'invalid',
    });
    const team = await saveTeam(G, { name: 'T' }, ACTOR);
    await rec(1, { rankId: a.id, teamId: team.id });
    await expect(deleteRank(G, a.id, ACTOR)).rejects.toMatchObject({ code: 'conflict' });
    await expect(deleteTeam(G, team.id, ACTOR)).rejects.toMatchObject({ code: 'conflict' });
    await deleteRank(G, b.id, ACTOR);
    await expect(deleteRank(G, b.id, ACTOR)).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('Einträge: Auszeichnungen, Disziplin, Notizen und Eintragsarten späterer Module', () => {
  it('Einträge anlegen, widerrufen (nie löschen), jeweils im Verlauf', async () => {
    const r = await rec(1);
    const award = await addEntry(G, r.id, { kind: 'AWARD', title: 'Beamter des Monats' }, ACTOR);
    await addEntry(
      G,
      r.id,
      { kind: 'DISCIPLINE', title: 'Verwarnung', body: 'Funkdisziplin' },
      ACTOR,
    );
    await addEntry(G, r.id, { kind: 'NOTE', title: 'Gespräch geführt' }, ACTOR);
    await expect(addEntry(G, r.id, { kind: 'NOTE', title: '  ' }, ACTOR)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(addEntry(G, r.id, { kind: 'klein', title: 'x' }, ACTOR)).rejects.toMatchObject({
      code: 'invalid',
    });
    await revokeEntry(G, award.id, 'Irrtum', ACTOR);
    await expect(revokeEntry(G, award.id, undefined, ACTOR)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(
      (await prisma.personnelEntry.findUniqueOrThrow({ where: { id: award.id } })).revokedAt,
    ).not.toBeNull();
    const types = (await prisma.personnelEvent.findMany({ where: { recordId: r.id } })).map(
      (e) => e.type,
    );
    expect(types).toEqual(expect.arrayContaining(['entry.added', 'entry.revoked']));
  });

  it('Bereiche sind getrennt: Disziplin/Notizen/Verlauf erscheinen nur mit Recht; fremde Modul-Einträge bleiben draußen', async () => {
    const r = await rec(1);
    await addEntry(G, r.id, { kind: 'AWARD', title: 'A' }, ACTOR);
    await addEntry(G, r.id, { kind: 'DISCIPLINE', title: 'D' }, ACTOR);
    await addEntry(G, r.id, { kind: 'NOTE', title: 'N' }, ACTOR);
    await addEntry(
      G,
      r.id,
      { kind: 'TRAINING', title: 'Ausbildung Funk', data: { passed: true } },
      ACTOR,
    ); // später vom Ausbildungsmodul
    const none = await recordSections(G, r.id, {
      awards: true,
      discipline: false,
      notes: false,
      history: false,
    });
    expect(none.entries.map((e) => e.kind)).toEqual(['AWARD']);
    expect(none.events).toEqual([]);
    const all = await recordSections(G, r.id, {
      awards: true,
      discipline: true,
      notes: true,
      history: true,
    });
    expect(all.entries.map((e) => e.kind).sort()).toEqual(['AWARD', 'DISCIPLINE', 'NOTE']);
    expect(all.events.length).toBeGreaterThan(0);
    // Dieselbe Akte, auf die spätere Module direkt zugreifen können:
    expect(await prisma.personnelEntry.count({ where: { recordId: r.id, kind: 'TRAINING' } })).toBe(
      1,
    );
  });
});

describe('Liste und Suche', () => {
  it('filtert nach Suchbegriff, Team, Status und Team-Einschränkung', async () => {
    const t1 = await saveTeam(G, { name: 'Streife' }, ACTOR);
    const t2 = await saveTeam(G, { name: 'SEK' }, ACTOR);
    await rec(1, { rpName: 'Max Mustermann', teamId: t1.id });
    await rec(2, { rpName: 'Erika Beispiel', teamId: t2.id });
    const c = await rec(3, { rpName: 'Karl Ohne-Team' });
    await archiveRecord(G, c.id, 'Ausgetreten', ACTOR);
    const names = async (i: object) =>
      (await listRecords({ guildId: G, restrictToTeams: null, ...i })).items.map((x) => x.rpName);
    expect(await names({})).toHaveLength(3);
    expect(await names({ query: 'erika' })).toEqual(['Erika Beispiel']);
    expect(await names({ status: 'ARCHIVED' })).toEqual(['Karl Ohne-Team']);
    expect(await names({ teamId: t1.id })).toEqual(['Max Mustermann']);
    // Teamleitung: nur Akten des eigenen Teams
    expect(await names({ restrictToTeams: [t1.id] })).toEqual(['Max Mustermann']);
    expect(await names({ restrictToTeams: [t1.id], teamId: t2.id })).toEqual([]);
    expect(await names({ restrictToTeams: [] })).toEqual([]);
  });

  it('Seitenweises Blättern ohne Lücken', async () => {
    for (let n = 1; n <= 5; n++) await rec(n, { rpName: `Name ${n}` });
    const p1 = await listRecords({ guildId: G, restrictToTeams: null, limit: 2 });
    const p2 = await listRecords({
      guildId: G,
      restrictToTeams: null,
      limit: 2,
      cursor: p1.nextCursor!,
    });
    const p3 = await listRecords({
      guildId: G,
      restrictToTeams: null,
      limit: 2,
      cursor: p2.nextCursor!,
    });
    expect([...p1.items, ...p2.items, ...p3.items].map((x) => x.rpName)).toEqual([
      'Name 1',
      'Name 2',
      'Name 3',
      'Name 4',
      'Name 5',
    ]);
    expect(p3.nextCursor).toBeNull();
  });
});

describe('Zugriff (Team-Bereich, Eigenzugriff, Sperren)', () => {
  const ROLE = { lead: 'role-teamlead', staff: 'role-staff', own: 'role-own' };
  async function setup() {
    const t1 = await saveTeam(G, { name: 'Streife' }, ACTOR);
    const t2 = await saveTeam(G, { name: 'SEK' }, ACTOR);
    const own = await rec(1, { teamId: t1.id }); // Teamleitung selbst
    const mate = await rec(2, { teamId: t1.id });
    const other = await rec(3, { teamId: t2.id });
    const entry = (key: string, scope: 'SERVER' | 'TEAM' = 'SERVER') => ({
      key,
      effect: 'ALLOW' as const,
      scope,
      scopeRef: '',
    });
    await permissionRepository.setPermissionsForRole(
      G,
      ROLE.lead,
      [
        entry('personnel.view', 'TEAM'),
        entry('personnel.note.view', 'TEAM'),
        entry('personnel.edit', 'TEAM'),
      ],
      { name: 'Teamleitung' },
    );
    await permissionRepository.setPermissionsForRole(
      G,
      ROLE.staff,
      [
        entry('personnel.view'),
        entry('personnel.discipline.view'),
        entry('personnel.history.view'),
        entry('personnel.note.view'),
      ],
      { name: 'Personal' },
    );
    await permissionRepository.setPermissionsForRole(G, ROLE.own, [entry('own.profile.view')], {
      name: 'Beamter',
    });
    return { t1, t2, own, mate, other };
  }
  const actor = (userId: string, roleIds: string[], bypass = false) =>
    buildActor({ guildId: G, userId, roleIds, bypass });

  it('Teamleitung sieht und bearbeitet nur das eigene Team – Polizeileitung/Personal alle', async () => {
    const { t1, own, mate, other } = await setup();
    const lead = await actor(U(1), [ROLE.lead]);
    expect(lead.teamIds).toEqual([t1.id]);
    expect(await canOn(lead, 'personnel.view', mate)).toBe(true);
    expect(await canOn(lead, 'personnel.view', other)).toBe(false);
    expect(await canOn(lead, 'personnel.edit', mate)).toBe(true);
    expect(await canOn(lead, 'personnel.edit', other)).toBe(false);
    expect(await canOn(lead, 'personnel.archive', mate)).toBe(false); // nicht vergeben
    expect(await scopeFor(lead, 'personnel.view')).toEqual({ all: false, teamIds: [t1.id] });
    const staff = await actor(U(9), [ROLE.staff]);
    expect(await canOn(staff, 'personnel.view', other)).toBe(true);
    expect(await scopeFor(staff, 'personnel.view')).toEqual({ all: true, teamIds: [] });
    void own;
  });

  it('Leitung eines Teams (leaderUserId) zählt als „eigenes Team“, auch ohne eigene Akte dort', async () => {
    const { t2 } = await setup();
    await prisma.team.update({ where: { id: t2.id }, data: { leaderUserId: U(1) } });
    const lead = await actor(U(1), [ROLE.lead]);
    expect(lead.teamIds.sort()).toEqual([...lead.teamIds].sort());
    expect(lead.teamIds).toContain(t2.id);
    expect((await scopeFor(lead, 'personnel.view')).teamIds).toContain(t2.id);
  });

  it('sichtbare Bereiche: Teamleitung ohne Disziplin/Verlauf; Personal mit; Eigenzugriff nur Stammdaten', async () => {
    const { mate, other, own } = await setup();
    const lead = await actor(U(1), [ROLE.lead]);
    expect([...(await visibleSections(lead, mate))].sort()).toEqual(['awards', 'base', 'notes']);
    expect([...(await visibleSections(lead, other))]).toEqual([]);
    const staff = await actor(U(9), [ROLE.staff]);
    expect([...(await visibleSections(staff, other))].sort()).toEqual([
      'awards',
      'base',
      'discipline',
      'history',
      'notes',
    ]);
    const beamter = await actor(U(2), [ROLE.own]);
    expect([...(await visibleSections(beamter, mate))].sort()).toEqual(['awards', 'base']); // eigene Akte, ohne Notizen/Disziplin
    expect([...(await visibleSections(beamter, other))]).toEqual([]); // fremde Akte: nichts
    void own;
  });

  it('eine Sperre überstimmt auch die Teamleitungs-Erlaubnis; Besitzer/Administratoren dürfen alles', async () => {
    const { mate, other } = await setup();
    await permissionRepository.addUserOverride(G, {
      userId: U(1),
      key: 'personnel.view',
      effect: 'DENY',
      note: 'Verfahren läuft',
    });
    const lead = await actor(U(1), [ROLE.lead]);
    expect(await canOn(lead, 'personnel.view', mate)).toBe(false);
    const admin = await actor(U(77), [], true);
    expect(await canOn(admin, 'personnel.view', other)).toBe(true);
    expect(await scopeFor(admin, 'personnel.discipline.view')).toEqual({ all: true, teamIds: [] });
  });
});

// --- Annahme-Pipeline ---------------------------------------------------------------

describe('Annahme: Personalakte, Dienstnummer, Dienstgrad, Team, Probezeit', () => {
  const APPLICANT = U(50);
  async function submission(
    config: Record<string, unknown>,
    opts: { isTest?: boolean; userId?: string } = {},
  ) {
    const full = {
      requirements: { enabled: false },
      messages: {},
      review: config,
      questions: [
        { id: 'rp', type: 'TEXT', title: 'RP-Name', required: true, enabled: true, order: 0 },
      ],
    };
    const app = await prisma.application.create({
      data: {
        guildId: G,
        name: 'Polizei',
        slug: `p-${Math.random().toString(36).slice(2, 8)}`,
        status: 'PUBLISHED',
        enabled: true,
        config: full as never,
        createdBy: 'x',
        updatedBy: 'x',
      },
    });
    const version = await prisma.applicationVersion.create({
      data: { applicationId: app.id, version: 1, questions: full as never, publishedById: 'x' },
    });
    const s = await prisma.applicationSubmission.create({
      data: {
        guildId: G,
        applicationId: app.id,
        versionId: version.id,
        userId: opts.userId ?? APPLICANT,
        usernameSnapshot: 'max',
        displayNameSnapshot: 'Max Anzeigename',
        status: 'SUBMITTED',
        submittedAt: new Date(),
        isTest: opts.isTest ?? false,
      },
    });
    await prisma.applicationAnswer.create({
      data: {
        submissionId: s.id,
        questionId: 'rp',
        questionVersionId: version.id,
        value: 'Max Mustermann' as never,
      },
    });
    return s.id;
  }
  const accept = (port: any, id: string) =>
    decideSubmission(port, {
      submissionId: id,
      guildId: G,
      reviewerId: ACTOR,
      decision: 'ACCEPTED',
    });
  const stepsOf = (r: any) => Object.fromEntries(r.steps.map((s: any) => [s.key, s.status]));

  it('legt Akte (RP-Name aus der Antwort), Dienstnummer, Einstiegsdienstgrad, Team und Probezeit an', async () => {
    const f = fakePort();
    await setNumberFormat(G, { prefix: 'EN-', digits: 3, next: 1 }, ACTOR);
    const entry = await saveRank(
      G,
      { name: 'Polizeianwärter', order: 1, isEntry: true, discordRoleId: '555555' },
      ACTOR,
    );
    const team = await saveTeam(G, { name: 'Streife', discordRoleId: '666666' }, ACTOR);
    const id = await submission({
      onboarding: { teamId: team.id, probationDays: 14, rpNameQuestionId: 'rp' },
    });
    const r: any = await accept(f.port, id);
    expect(r.ok).toBe(true);
    expect(stepsOf(r)).toMatchObject({
      personnelRecord: 'done',
      serviceNumber: 'done',
      startRank: 'done',
      team: 'done',
      probation: 'done',
      notifyApplicant: 'done',
    });
    const record = await getRecordByUser(G, APPLICANT);
    expect(record).toMatchObject({
      rpName: 'Max Mustermann',
      serviceNumber: 'EN-001',
      rankId: entry.id,
      teamId: team.id,
      sourceSubmissionId: id,
    });
    expect(record!.probationEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    expect(f.roles.get(APPLICANT)?.sort()).toEqual(['555555', '666666']); // Dienstgrad- und Teamrolle
    const events = (
      await prisma.personnelEvent.findMany({
        where: { recordId: record!.id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((e) => e.type);
    expect(events).toEqual([
      'created',
      'number.assigned',
      'rank.changed',
      'team.changed',
      'probation.set',
    ]);
    // alles nachvollziehbar: Automation, Berechtigung, Handelnder
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { guildId: G, action: 'personnel.created' },
    });
    expect(audit).toMatchObject({
      automation: 'application-accept',
      permission: 'applications.submissions.accept',
      actorId: ACTOR,
    });
  });

  it('fehlt der Einstiegsdienstgrad, meldet der Schritt den Fehler ehrlich – Akte und Nummer bleiben', async () => {
    const f = fakePort();
    const id = await submission({});
    const r: any = await accept(f.port, id);
    expect(stepsOf(r)).toMatchObject({
      personnelRecord: 'done',
      serviceNumber: 'done',
      startRank: 'failed',
      team: 'skipped',
      probation: 'skipped',
    });
    expect(r.overall).toBe('partial');
    expect(r.steps.find((s: any) => s.key === 'startRank').detail).toContain('Einstiegsdienstgrad');
    expect((await getRecordByUser(G, APPLICANT))?.serviceNumber).toBe('001');
  });

  it('RP-Name fällt ohne konfigurierte Frage auf den Anzeigenamen zurück', async () => {
    const f = fakePort();
    await accept(f.port, await submission({}));
    expect((await getRecordByUser(G, APPLICANT))?.rpName).toBe('Max Anzeigename');
  });

  it('Rollenfehler beim Dienstgrad: Schritt „fehlgeschlagen“, Dienstgrad in der Akte gesetzt, Fehler im Protokoll', async () => {
    const f = fakePort({ rejectRoles: { '555555': 403 } });
    await saveRank(
      G,
      { name: 'Anwärter', order: 1, isEntry: true, discordRoleId: '555555' },
      ACTOR,
    );
    const r: any = await accept(f.port, await submission({}));
    expect(stepsOf(r).startRank).toBe('failed');
    expect(r.steps.find((s: any) => s.key === 'startRank').detail).toContain('Rolle');
    expect((await getRecordByUser(G, APPLICANT))?.rankId).not.toBeNull();
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: { guildId: G, action: 'role.change', result: 'failed' },
        })
      ).reason,
    ).toContain('Rollenposition');
  });

  it('bestehende Akte wird weiterverwendet (kein Duplikat, Nummer/Dienstgrad bleiben); archivierte wird wiederhergestellt', async () => {
    const f = fakePort();
    const rank = await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true }, ACTOR);
    const existing = await createRecord({
      guildId: G,
      userId: APPLICANT,
      rpName: 'Alter Name',
      actorId: ACTOR,
      rankId: rank.id,
    });
    await setServiceNumber(G, existing.id, 'ALT-1', ACTOR);
    await archiveRecord(G, existing.id, 'Ausgetreten', ACTOR);
    const r: any = await accept(f.port, await submission({}));
    expect(r.steps.find((s: any) => s.key === 'personnelRecord').detail).toContain(
      'wiederhergestellt',
    );
    const after = await getRecordByUser(G, APPLICANT);
    expect(after).toMatchObject({
      id: existing.id,
      status: 'ACTIVE',
      rpName: 'Alter Name',
      serviceNumber: 'ALT-1',
    });
    expect(stepsOf(r)).toMatchObject({ serviceNumber: 'done', startRank: 'skipped' });
    expect(await prisma.personnelRecord.count({ where: { guildId: G, userId: APPLICANT } })).toBe(
      1,
    );
  });

  it('Schritte einzeln abschaltbar – ohne Akte-Schritt scheitern abhängige Schritte verständlich', async () => {
    const f = fakePort();
    await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true }, ACTOR);
    const r: any = await accept(
      f.port,
      await submission({ acceptPipeline: { personnelRecord: false } }),
    );
    expect(stepsOf(r).personnelRecord).toBe('skipped');
    expect(stepsOf(r).serviceNumber).toBe('failed');
    expect(r.steps.find((s: any) => s.key === 'serviceNumber').detail).toContain(
      'noch keine Personalakte',
    );
    expect(await getRecordByUser(G, APPLICANT)).toBeNull();
  });

  it('Test-Bewerbungen und Ablehnungen erzeugen weder Akte noch Dienstnummer noch Dienstgrad', async () => {
    const f = fakePort();
    await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true }, ACTOR);
    const t: any = await accept(f.port, await submission({}, { isTest: true, userId: U(51) }));
    expect(stepsOf(t).personnelRecord).toBe('skipped');
    expect(await getRecordByUser(G, U(51))).toBeNull();
    const denied: any = await decideSubmission(f.port, {
      submissionId: await submission({}, { userId: U(52) }),
      guildId: G,
      reviewerId: ACTOR,
      decision: 'DENIED',
      reasonId: 'quality',
    });
    expect(denied.ok).toBe(true);
    expect(await getRecordByUser(G, U(52))).toBeNull();
    expect((await getNumberFormat(G)).next).toBe(1); // keine Nummer verbraucht
  });
});

void PersonnelError;
