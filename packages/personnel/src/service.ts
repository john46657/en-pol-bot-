import { applyRoleChanges, type DiscordPort } from '@nexus/automation';
import { assertGuildId, prisma, type Prisma } from '@nexus/database';
import { PersonnelError } from './errors.js';

/**
 * Personalakte: eine zentrale Akte je Mitglied und Server. Alle Änderungen schreiben einen Verlaufseintrag
 * (`PersonnelEvent`) und einen Eintrag im allgemeinen Audit-Log. Spätere Module hängen ihre Daten als
 * `PersonnelEntry` (eigene `kind`-Werte) an dieselbe Akte.
 */
type Json = Prisma.InputJsonValue;

export interface ServiceOptions {
  /** Berechtigung, auf deren Grundlage gehandelt wird (für das Audit-Log). */
  permission?: string;
  /** Auslösende Automation (z. B. Annahme-Pipeline). */
  automation?: string;
  /** Discord-Zugriff für Rollenänderungen (Dienstgrad/Team-Rollen); ohne Port keine Rollenänderung. */
  port?: DiscordPort;
}

const RP_NAME = /^.{2,80}$/s;
const NUMBER = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;

async function log(
  guildId: string,
  recordId: string,
  type: string,
  actorId: string | null,
  data: { before?: unknown; after?: unknown } = {},
  opts: ServiceOptions = {},
) {
  const before = data.before === undefined ? {} : { before: data.before as Json };
  const after = data.after === undefined ? {} : { after: data.after as Json };
  await prisma.personnelEvent.create({
    data: { guildId, recordId, type, actorId, ...before, ...after },
  });
  await prisma.auditLog.create({
    data: {
      guildId,
      actorType: actorId ? 'USER' : 'AUTOMATION',
      actorId,
      action: `personnel.${type}`,
      resourceType: 'PersonnelRecord',
      resourceId: recordId,
      ...before,
      ...after,
      result: 'success',
      ...(opts.permission ? { permission: opts.permission } : {}),
      ...(opts.automation ? { automation: opts.automation } : {}),
    },
  });
}

async function load(guildId: string, id: string) {
  const record = await prisma.personnelRecord.findFirst({
    where: { id, guildId: assertGuildId(guildId) },
    include: { rank: true, team: true },
  });
  if (!record) throw new PersonnelError('not-found', 'Personalakte nicht gefunden.');
  return record;
}
export const getRecord = load;

export async function getRecordByUser(guildId: string, userId: string) {
  return prisma.personnelRecord.findUnique({
    where: { guildId_userId: { guildId: assertGuildId(guildId), userId } },
    include: { rank: true, team: true },
  });
}

// --- Dienstnummern ------------------------------------------------------------

export interface NumberFormat {
  prefix: string;
  digits: number;
  next: number;
}

const readFormat = (data: unknown): NumberFormat => {
  const p =
    (data && typeof data === 'object'
      ? (data as { personnel?: Partial<NumberFormat> }).personnel
      : undefined) ?? {};
  return {
    prefix: typeof p.prefix === 'string' ? p.prefix : '',
    digits: Number.isInteger(p.digits) ? Math.min(Math.max(p.digits!, 1), 10) : 3,
    next: Number.isInteger(p.next) && p.next! > 0 ? p.next! : 1,
  };
};

export async function getNumberFormat(guildId: string): Promise<NumberFormat> {
  const row = await prisma.guildSettings.findUnique({ where: { guildId: assertGuildId(guildId) } });
  return readFormat(row?.data);
}

export async function setNumberFormat(
  guildId: string,
  f: { prefix?: string | undefined; digits?: number | undefined; next?: number | undefined },
  actorId: string,
): Promise<NumberFormat> {
  const gid = assertGuildId(guildId);
  if (f.prefix !== undefined && !/^[A-Za-z0-9-]{0,10}$/.test(f.prefix))
    throw new PersonnelError(
      'invalid',
      'Das Präfix darf höchstens 10 Buchstaben, Ziffern oder Bindestriche enthalten.',
    );
  if (f.digits !== undefined && !(Number.isInteger(f.digits) && f.digits >= 1 && f.digits <= 10))
    throw new PersonnelError('invalid', 'Die Stellenzahl muss zwischen 1 und 10 liegen.');
  if (f.next !== undefined && !(Number.isInteger(f.next) && f.next >= 1))
    throw new PersonnelError('invalid', 'Die nächste Nummer muss mindestens 1 sein.');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM guild_settings WHERE "guildId" = ${gid} FOR UPDATE`;
    const row = await tx.guildSettings.findUnique({ where: { guildId: gid } });
    if (!row) throw new PersonnelError('not-found', 'Der Server ist nicht eingerichtet.');
    const data = (
      row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {}
    ) as Record<string, unknown>;
    const before = readFormat(row.data);
    const next = {
      ...before,
      ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)),
    } as NumberFormat;
    await tx.guildSettings.update({
      where: { guildId: gid },
      data: { data: { ...data, personnel: next } as unknown as Json },
    });
    await tx.auditLog.create({
      data: {
        guildId: gid,
        actorType: 'USER',
        actorId,
        action: 'personnel.number_format.set',
        resourceType: 'GuildSettings',
        resourceId: gid,
        before: before as unknown as Json,
        after: next as unknown as Json,
        permission: 'personnel.structure.manage',
        result: 'success',
      },
    });
    return next;
  });
}

const formatNumber = (f: NumberFormat, n: number) =>
  `${f.prefix}${String(n).padStart(f.digits, '0')}`;

/** Nächste freie Dienstnummer (atomar, überspringt bereits vergebene). */
export async function generateServiceNumber(guildId: string): Promise<string> {
  const gid = assertGuildId(guildId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM guild_settings WHERE "guildId" = ${gid} FOR UPDATE`;
    const row = await tx.guildSettings.findUnique({ where: { guildId: gid } });
    if (!row) throw new PersonnelError('not-found', 'Der Server ist nicht eingerichtet.');
    const f = readFormat(row.data);
    let n = f.next;
    for (let guard = 0; guard < 100000; guard++, n++) {
      const number = formatNumber(f, n);
      if (
        !(await tx.personnelRecord.findUnique({
          where: { guildId_serviceNumber: { guildId: gid, serviceNumber: number } },
          select: { id: true },
        }))
      ) {
        const data = (
          row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {}
        ) as Record<string, unknown>;
        await tx.guildSettings.update({
          where: { guildId: gid },
          data: { data: { ...data, personnel: { ...f, next: n + 1 } } as unknown as Json },
        });
        return number;
      }
    }
    throw new PersonnelError('conflict', 'Es ist keine freie Dienstnummer mehr verfügbar.');
  });
}

// --- Akte anlegen / ändern -----------------------------------------------------

export interface CreateRecordInput {
  guildId: string;
  userId: string;
  rpName: string;
  actorId: string | null;
  rankId?: string | null | undefined;
  teamId?: string | null | undefined;
  joinedAt?: Date | undefined;
  probationEndsAt?: Date | null | undefined;
  sourceSubmissionId?: string | undefined;
}

export async function createRecord(input: CreateRecordInput, opts: ServiceOptions = {}) {
  const guildId = assertGuildId(input.guildId);
  const rpName = input.rpName.trim();
  if (!RP_NAME.test(rpName))
    throw new PersonnelError('invalid', 'Der RP-Name muss 2 bis 80 Zeichen lang sein.');
  if (!/^\d{5,25}$/.test(input.userId))
    throw new PersonnelError('invalid', 'Ungültige Discord-Benutzer-ID.');
  if (input.rankId) await assertRank(guildId, input.rankId);
  if (input.teamId) await assertTeam(guildId, input.teamId);
  try {
    const record = await prisma.personnelRecord.create({
      data: {
        guildId,
        userId: input.userId,
        rpName,
        rankId: input.rankId ?? null,
        teamId: input.teamId ?? null,
        joinedAt: input.joinedAt ?? new Date(),
        probationEndsAt: input.probationEndsAt ?? null,
        createdBy: input.actorId,
        sourceSubmissionId: input.sourceSubmissionId ?? null,
      },
      include: { rank: true, team: true },
    });
    await log(
      guildId,
      record.id,
      'created',
      input.actorId,
      { after: { rpName, userId: input.userId, source: input.sourceSubmissionId ?? null } },
      opts,
    );
    return record;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) {
      throw new PersonnelError(
        'conflict',
        'Für dieses Mitglied existiert bereits eine Personalakte.',
      );
    }
    throw e;
  }
}

export async function updateRecord(
  guildId: string,
  id: string,
  patch: { rpName?: string | undefined; joinedAt?: Date | undefined },
  actorId: string,
  opts: ServiceOptions = {},
) {
  const before = await load(guildId, id);
  const data: Prisma.PersonnelRecordUpdateInput = {};
  if (patch.rpName !== undefined) {
    const rpName = patch.rpName.trim();
    if (!RP_NAME.test(rpName))
      throw new PersonnelError('invalid', 'Der RP-Name muss 2 bis 80 Zeichen lang sein.');
    data.rpName = rpName;
  }
  if (patch.joinedAt !== undefined) data.joinedAt = patch.joinedAt;
  if (Object.keys(data).length === 0) return before;
  const after = await prisma.personnelRecord.update({
    where: { id },
    data,
    include: { rank: true, team: true },
  });
  await log(
    guildId,
    id,
    'edited',
    actorId,
    {
      before: { rpName: before.rpName, joinedAt: before.joinedAt },
      after: { rpName: after.rpName, joinedAt: after.joinedAt },
    },
    opts,
  );
  return after;
}

// --- Dienstgrad / Team / Nummer / Probezeit ------------------------------------

async function assertRank(guildId: string, rankId: string) {
  const rank = await prisma.rank.findFirst({ where: { id: rankId, guildId } });
  if (!rank || !rank.active)
    throw new PersonnelError('invalid', 'Dieser Dienstgrad existiert nicht oder ist deaktiviert.');
  return rank;
}
async function assertTeam(guildId: string, teamId: string) {
  const team = await prisma.team.findFirst({ where: { id: teamId, guildId } });
  if (!team || !team.active)
    throw new PersonnelError('invalid', 'Dieses Team existiert nicht oder ist deaktiviert.');
  return team;
}

/** Rollenwechsel zu Dienstgrad/Team: protokolliert über `applyRoleChanges`; Fehler werden gemeldet, nie verschwiegen. */
async function changeRoles(
  record: { guildId: string; userId: string; id: string },
  add: (string | null | undefined)[],
  remove: (string | null | undefined)[],
  trigger: string,
  actorId: string | null,
  opts: ServiceOptions,
) {
  const a = add.filter((x): x is string => !!x);
  const r = remove.filter((x): x is string => !!x && !a.includes(x));
  if (!opts.port || a.length + r.length === 0) return undefined;
  return applyRoleChanges(
    {
      guildId: record.guildId,
      userId: record.userId,
      add: a,
      remove: r,
      trigger,
      ...(opts.automation ? { automation: opts.automation } : {}),
      ...(actorId ? { actorId } : {}),
      resourceType: 'PersonnelRecord',
      resourceId: record.id,
      ...(opts.permission ? { permission: opts.permission } : {}),
    },
    opts.port.roleDriver(record.guildId),
  );
}

export async function setRank(
  guildId: string,
  id: string,
  rankId: string | null,
  actorId: string | null,
  opts: ServiceOptions = {},
) {
  const before = await load(guildId, id);
  if ((before.rankId ?? null) === rankId) return { record: before, roleChange: undefined };
  const rank = rankId ? await assertRank(guildId, rankId) : null;
  const record = await prisma.personnelRecord.update({
    where: { id },
    data: { rankId },
    include: { rank: true, team: true },
  });
  await log(
    guildId,
    id,
    'rank.changed',
    actorId,
    { before: { rank: before.rank?.name ?? null }, after: { rank: rank?.name ?? null } },
    opts,
  );
  const roleChange = await changeRoles(
    record,
    [rank?.discordRoleId],
    [before.rank?.discordRoleId],
    'Dienstgrad geändert',
    actorId,
    opts,
  );
  return { record, roleChange };
}

export async function setTeam(
  guildId: string,
  id: string,
  teamId: string | null,
  actorId: string | null,
  opts: ServiceOptions = {},
) {
  const before = await load(guildId, id);
  if ((before.teamId ?? null) === teamId) return { record: before, roleChange: undefined };
  const team = teamId ? await assertTeam(guildId, teamId) : null;
  const record = await prisma.personnelRecord.update({
    where: { id },
    data: { teamId },
    include: { rank: true, team: true },
  });
  await log(
    guildId,
    id,
    'team.changed',
    actorId,
    { before: { team: before.team?.name ?? null }, after: { team: team?.name ?? null } },
    opts,
  );
  const roleChange = await changeRoles(
    record,
    [team?.discordRoleId],
    [before.team?.discordRoleId],
    'Teamwechsel',
    actorId,
    opts,
  );
  return { record, roleChange };
}

/** `number` = konkrete Nummer, `'auto'` = nächste freie nach dem eingestellten Format. */
export async function setServiceNumber(
  guildId: string,
  id: string,
  number: string | 'auto',
  actorId: string | null,
  opts: ServiceOptions = {},
) {
  const before = await load(guildId, id);
  const value = number === 'auto' ? await generateServiceNumber(guildId) : number.trim();
  if (!NUMBER.test(value))
    throw new PersonnelError(
      'invalid',
      'Die Dienstnummer darf nur Buchstaben, Ziffern und Bindestriche enthalten (max. 20 Zeichen).',
    );
  try {
    const record = await prisma.personnelRecord.update({
      where: { id },
      data: { serviceNumber: value },
      include: { rank: true, team: true },
    });
    await log(
      guildId,
      id,
      'number.assigned',
      actorId,
      { before: { serviceNumber: before.serviceNumber }, after: { serviceNumber: value } },
      opts,
    );
    return record;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message))
      throw new PersonnelError('conflict', `Die Dienstnummer ${value} ist bereits vergeben.`);
    throw e;
  }
}

export async function setProbation(
  guildId: string,
  id: string,
  endsAt: Date | null,
  actorId: string | null,
  opts: ServiceOptions = {},
) {
  const before = await load(guildId, id);
  const record = await prisma.personnelRecord.update({
    where: { id },
    data: { probationEndsAt: endsAt },
    include: { rank: true, team: true },
  });
  await log(
    guildId,
    id,
    'probation.set',
    actorId,
    { before: { probationEndsAt: before.probationEndsAt }, after: { probationEndsAt: endsAt } },
    opts,
  );
  return record;
}

export async function archiveRecord(
  guildId: string,
  id: string,
  reason: string | undefined,
  actorId: string,
  opts: ServiceOptions = {},
) {
  const before = await load(guildId, id);
  if (before.status === 'ARCHIVED')
    throw new PersonnelError('conflict', 'Die Akte ist bereits archiviert.');
  const record = await prisma.personnelRecord.update({
    where: { id },
    data: { status: 'ARCHIVED', archivedAt: new Date(), archivedReason: reason?.trim() || null },
    include: { rank: true, team: true },
  });
  await log(guildId, id, 'archived', actorId, { after: { reason: reason ?? null } }, opts);
  return record;
}

export async function restoreRecord(
  guildId: string,
  id: string,
  actorId: string | null,
  opts: ServiceOptions = {},
) {
  const before = await load(guildId, id);
  if (before.status !== 'ARCHIVED')
    throw new PersonnelError('conflict', 'Die Akte ist nicht archiviert.');
  const record = await prisma.personnelRecord.update({
    where: { id },
    data: { status: 'ACTIVE', archivedAt: null, archivedReason: null },
    include: { rank: true, team: true },
  });
  await log(guildId, id, 'restored', actorId, { before: { reason: before.archivedReason } }, opts);
  return record;
}

// --- Einträge (Auszeichnungen, Disziplin, Notizen, später weitere Module) -------

export async function addEntry(
  guildId: string,
  recordId: string,
  input: {
    kind: string;
    title: string;
    body?: string | undefined;
    occurredAt?: Date | undefined;
    data?: unknown;
  },
  actorId: string | null,
  opts: ServiceOptions = {},
) {
  await load(guildId, recordId);
  const title = input.title.trim();
  if (!title || title.length > 200)
    throw new PersonnelError('invalid', 'Der Titel fehlt oder ist zu lang (max. 200 Zeichen).');
  if (!/^[A-Z_]{2,30}$/.test(input.kind))
    throw new PersonnelError('invalid', 'Ungültige Eintragsart.');
  if ((input.body?.length ?? 0) > 4000)
    throw new PersonnelError('invalid', 'Der Text ist zu lang (max. 4000 Zeichen).');
  const entry = await prisma.personnelEntry.create({
    data: {
      guildId,
      recordId,
      kind: input.kind,
      title,
      body: input.body?.trim() || null,
      ...(input.data !== undefined ? { data: input.data as Json } : {}),
      occurredAt: input.occurredAt ?? new Date(),
      createdBy: actorId,
    },
  });
  await log(
    guildId,
    recordId,
    'entry.added',
    actorId,
    { after: { kind: input.kind, title, entryId: entry.id } },
    opts,
  );
  return entry;
}

export async function getEntry(guildId: string, entryId: string) {
  const entry = await prisma.personnelEntry.findFirst({
    where: { id: entryId, guildId: assertGuildId(guildId) },
    include: { record: true },
  });
  if (!entry) throw new PersonnelError('not-found', 'Eintrag nicht gefunden.');
  return entry;
}

/** Einträge werden nie gelöscht, sondern widerrufen (bleibt nachvollziehbar). */
export async function revokeEntry(
  guildId: string,
  entryId: string,
  reason: string | undefined,
  actorId: string,
  opts: ServiceOptions = {},
) {
  const entry = await getEntry(guildId, entryId);
  if (entry.revokedAt)
    throw new PersonnelError('conflict', 'Dieser Eintrag wurde bereits widerrufen.');
  const updated = await prisma.personnelEntry.update({
    where: { id: entryId },
    data: { revokedAt: new Date(), revokedBy: actorId, revokeReason: reason?.trim() || null },
  });
  await log(
    guildId,
    entry.recordId,
    'entry.revoked',
    actorId,
    { after: { kind: entry.kind, title: entry.title, entryId, reason: reason ?? null } },
    opts,
  );
  return updated;
}

// --- Listen und Ansicht -----------------------------------------------------------

export interface ListInput {
  guildId: string;
  query?: string | undefined;
  status?: 'ACTIVE' | 'ARCHIVED' | undefined;
  teamId?: string | undefined;
  rankId?: string | undefined;
  /** `null` = alle Akten, sonst nur Akten dieser Teams (TEAM-Bereich). */
  restrictToTeams: string[] | null;
  limit?: number;
  cursor?: string | undefined;
}

export async function listRecords(i: ListInput) {
  const limit = Math.min(Math.max(i.limit ?? 50, 1), 100);
  const where: Prisma.PersonnelRecordWhereInput = {
    guildId: assertGuildId(i.guildId),
    ...(i.status ? { status: i.status } : {}),
    ...(i.teamId ? { teamId: i.teamId } : {}),
    ...(i.rankId ? { rankId: i.rankId } : {}),
    ...(i.restrictToTeams
      ? {
          teamId: i.teamId
            ? i.restrictToTeams.includes(i.teamId)
              ? i.teamId
              : '__none__'
            : { in: i.restrictToTeams },
        }
      : {}),
    ...(i.query
      ? {
          OR: [
            { rpName: { contains: i.query, mode: 'insensitive' } },
            { serviceNumber: { contains: i.query, mode: 'insensitive' } },
            { userId: { contains: i.query } },
          ],
        }
      : {}),
  };
  const rows = await prisma.personnelRecord.findMany({
    where,
    orderBy: [{ rpName: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    ...(i.cursor ? { cursor: { id: i.cursor }, skip: 1 } : {}),
    include: { rank: true, team: true },
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

/** Einträge und Verlauf einer Akte, gefiltert nach den sichtbaren Bereichen. */
export async function recordSections(
  guildId: string,
  recordId: string,
  sections: { awards: boolean; discipline: boolean; notes: boolean; history: boolean; operations?: boolean },
) {
  const kinds = [
    ...(sections.awards ? ['AWARD'] : []),
    ...(sections.discipline ? ['DISCIPLINE'] : []),
    ...(sections.notes ? ['NOTE'] : []),
    ...(sections.operations ? ['OPERATION', 'PENALTY'] : []),
  ];
  const [entries, events] = await Promise.all([
    prisma.personnelEntry.findMany({
      // Andere Eintragsarten (Ausbildung, Beförderung, Abwesenheit …) liefern später ihre Module mit eigenen Rechten.
      where: { guildId, recordId, kind: { in: kinds } },
      orderBy: { occurredAt: 'desc' },
    }),
    sections.history
      ? prisma.personnelEvent.findMany({
          where: { guildId, recordId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
  ]);
  return { entries, events };
}

// --- Dienstgrade & Teams ------------------------------------------------------------

export async function listRanks(guildId: string) {
  return prisma.rank.findMany({
    where: { guildId: assertGuildId(guildId) },
    orderBy: { order: 'desc' },
    include: { _count: { select: { records: true } } },
  });
}

export async function saveRank(
  guildId: string,
  input: {
    id?: string | undefined;
    name: string;
    shortName?: string | undefined;
    order: number;
    isEntry?: boolean | undefined;
    discordRoleId?: string | null | undefined;
    active?: boolean | undefined;
  },
  actorId: string,
) {
  const gid = assertGuildId(guildId);
  const name = input.name.trim();
  if (!name || name.length > 60)
    throw new PersonnelError('invalid', 'Der Name des Dienstgrads fehlt oder ist zu lang.');
  if (!Number.isInteger(input.order) || input.order < 0 || input.order > 1000)
    throw new PersonnelError('invalid', 'Die Rangfolge muss eine Zahl zwischen 0 und 1000 sein.');
  if (input.discordRoleId && !/^\d{5,25}$/.test(input.discordRoleId))
    throw new PersonnelError('invalid', 'Ungültige Rollen-ID.');
  try {
    return await prisma.$transaction(async (tx) => {
      const data = {
        name,
        shortName: input.shortName?.trim() || null,
        order: input.order,
        isEntry: input.isEntry ?? false,
        discordRoleId: input.discordRoleId ?? null,
        active: input.active ?? true,
      };
      const rank = input.id
        ? await tx.rank.update({ where: { id: input.id, guildId: gid }, data })
        : await tx.rank.create({ data: { ...data, guildId: gid } });
      if (rank.isEntry)
        await tx.rank.updateMany({
          where: { guildId: gid, isEntry: true, id: { not: rank.id } },
          data: { isEntry: false },
        });
      await tx.auditLog.create({
        data: {
          guildId: gid,
          actorType: 'USER',
          actorId,
          action: input.id ? 'personnel.rank.updated' : 'personnel.rank.created',
          resourceType: 'Rank',
          resourceId: rank.id,
          after: data as Json,
          permission: 'personnel.structure.manage',
          result: 'success',
        },
      });
      return rank;
    });
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message))
      throw new PersonnelError('conflict', 'Einen Dienstgrad mit diesem Namen gibt es schon.');
    if (e instanceof Error && /Record to update not found|No record was found/i.test(e.message))
      throw new PersonnelError('not-found', 'Dienstgrad nicht gefunden.');
    throw e;
  }
}

export async function deleteRank(guildId: string, id: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const rank = await prisma.rank.findFirst({
    where: { id, guildId: gid },
    include: { _count: { select: { records: true } } },
  });
  if (!rank) throw new PersonnelError('not-found', 'Dienstgrad nicht gefunden.');
  if (rank._count.records > 0)
    throw new PersonnelError(
      'conflict',
      `Der Dienstgrad wird von ${rank._count.records} Akte(n) verwendet – bitte deaktivieren statt löschen.`,
    );
  await prisma.rank.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      guildId: gid,
      actorType: 'USER',
      actorId,
      action: 'personnel.rank.deleted',
      resourceType: 'Rank',
      resourceId: id,
      before: { name: rank.name },
      permission: 'personnel.structure.manage',
      result: 'success',
    },
  });
}

export async function listTeams(guildId: string) {
  return prisma.team.findMany({
    where: { guildId: assertGuildId(guildId) },
    orderBy: { name: 'asc' },
    include: { _count: { select: { records: true } } },
  });
}

export async function saveTeam(
  guildId: string,
  input: {
    id?: string | undefined;
    name: string;
    description?: string | undefined;
    discordRoleId?: string | null | undefined;
    leaderUserId?: string | null | undefined;
    active?: boolean | undefined;
  },
  actorId: string,
) {
  const gid = assertGuildId(guildId);
  const name = input.name.trim();
  if (!name || name.length > 60)
    throw new PersonnelError('invalid', 'Der Teamname fehlt oder ist zu lang.');
  if (input.discordRoleId && !/^\d{5,25}$/.test(input.discordRoleId))
    throw new PersonnelError('invalid', 'Ungültige Rollen-ID.');
  if (input.leaderUserId && !/^\d{5,25}$/.test(input.leaderUserId))
    throw new PersonnelError('invalid', 'Ungültige Benutzer-ID der Teamleitung.');
  const data = {
    name,
    description: input.description?.trim() || null,
    discordRoleId: input.discordRoleId ?? null,
    leaderUserId: input.leaderUserId ?? null,
    active: input.active ?? true,
  };
  try {
    const team = input.id
      ? await prisma.team.update({ where: { id: input.id, guildId: gid }, data })
      : await prisma.team.create({ data: { ...data, guildId: gid } });
    await prisma.auditLog.create({
      data: {
        guildId: gid,
        actorType: 'USER',
        actorId,
        action: input.id ? 'personnel.team.updated' : 'personnel.team.created',
        resourceType: 'Team',
        resourceId: team.id,
        after: data as Json,
        permission: 'personnel.structure.manage',
        result: 'success',
      },
    });
    return team;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message))
      throw new PersonnelError('conflict', 'Ein Team mit diesem Namen gibt es schon.');
    if (e instanceof Error && /Record to update not found|No record was found/i.test(e.message))
      throw new PersonnelError('not-found', 'Team nicht gefunden.');
    throw e;
  }
}

export async function deleteTeam(guildId: string, id: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const team = await prisma.team.findFirst({
    where: { id, guildId: gid },
    include: { _count: { select: { records: true } } },
  });
  if (!team) throw new PersonnelError('not-found', 'Team nicht gefunden.');
  if (team._count.records > 0)
    throw new PersonnelError(
      'conflict',
      `Das Team hat noch ${team._count.records} Mitglied(er) – bitte zuerst versetzen oder deaktivieren.`,
    );
  await prisma.team.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      guildId: gid,
      actorType: 'USER',
      actorId,
      action: 'personnel.team.deleted',
      resourceType: 'Team',
      resourceId: id,
      before: { name: team.name },
      permission: 'personnel.structure.manage',
      result: 'success',
    },
  });
}

/** Einstiegsdienstgrad: ausdrücklich gewählter, sonst der als „Einstieg“ markierte. */
export async function entryRank(guildId: string, preferredId?: string) {
  if (preferredId)
    return prisma.rank.findFirst({ where: { id: preferredId, guildId, active: true } });
  return prisma.rank.findFirst({ where: { guildId, isEntry: true, active: true } });
}
