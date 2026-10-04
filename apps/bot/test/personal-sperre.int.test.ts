import { permissionRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAkte } from '../src/commands/akte.js';
import { runPersonal } from '../src/commands/personal.js';
import { runSperre } from '../src/commands/sperre.js';
import { runTeam } from '../src/commands/team.js';

const G = 'personal-sperre-guild';
const [LEAD, COP, TARGET, OTHER] = ['900000000000400001', '900000000000400002', '900000000000400003', '900000000000400004'];

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Befehle', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-lead', ['personnel.view', 'personnel.state.edit', 'personnel.archive', 'personnel.number.edit', 'restrictions.view', 'restrictions.create', 'restrictions.revoke'].map(e), { name: 'Leitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-cop', ['personnel.view', 'restrictions.view'].map(e), { name: 'Beamter' });
  await prisma.personnelRecord.create({ data: { guildId: G, userId: TARGET, rpName: 'Tim Ziel' } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function run(fn: (i: any) => Promise<void>, userId: string, roles: string[], sub: string, opts: { str?: Record<string, string>; user?: Record<string, string>; num?: Record<string, number> } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: {
      getSubcommand: () => sub,
      getString: (n: string, req?: boolean) => opts.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null),
      getUser: (n: string, req?: boolean) => (opts.user?.[n] ? { id: opts.user[n] } : req ? (() => { throw new Error('fehlt'); })() : null),
      getNumber: (n: string) => opts.num?.[n] ?? null,
    },
    reply: vi.fn(async (o: any) => void replies.push(o)),
  };
  return fn(i).then(() => JSON.stringify(replies[0]));
}
const personal = (u: string, r: string[], sub: string, str: Record<string, string> = {}) => run(runPersonal, u, r, sub, { str, user: { mitglied: TARGET } });
const sperre = (u: string, r: string[], sub: string, o: Parameters<typeof run>[4] = {}) => run(runSperre, u, r, sub, o);

describe('/personal', () => {
  it('Teamstatus, Schließen mit Pflichtgrund, Wiederherstellen, Dienstnummer – nur mit Recht', async () => {
    expect(await personal(COP, ['role-cop'], 'status', { zustand: 'PAUSE' })).toContain('Du benötigst'); // kein Recht
    expect(await personal(LEAD, ['role-lead'], 'status', { zustand: 'SUSPENDED' })).toContain('Grund'); // Pflichtgrund
    expect(await personal(LEAD, ['role-lead'], 'status', { zustand: 'PAUSE' })).toContain('Pause');
    expect(await personal(LEAD, ['role-lead'], 'status', { zustand: 'SUSPENDED', grund: 'Dienstvergehen' })).toContain('Suspendiert');
    expect((await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: TARGET } })).teamStateReason).toBe('Dienstvergehen');
    expect(await personal(LEAD, ['role-lead'], 'nummer', { nummer: 'POL-77' })).toContain('POL-77');
    expect(await personal(LEAD, ['role-lead'], 'nummer', {})).toContain('Dienstnummer'); // automatisch
    expect(await personal(COP, ['role-cop'], 'schliessen', { grund: 'Austritt' })).toContain('Du benötigst');
    expect(await personal(LEAD, ['role-lead'], 'schliessen', { grund: 'x' })).toContain('Schließungsgrund'); // zu kurz
    expect(await personal(LEAD, ['role-lead'], 'schliessen', { grund: 'Austritt aus dem Dienst' })).toContain('geschlossen');
    expect(await personal(LEAD, ['role-lead'], 'status', { zustand: 'ACTIVE' })).toContain('geschlossen'); // CLOSED sperrt Statuswechsel
    expect(await personal(LEAD, ['role-lead'], 'wiederherstellen')).toContain('wiederhergestellt');
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: TARGET } });
    expect(rec).toMatchObject({ status: 'ACTIVE', teamState: 'ACTIVE' });
    expect(await prisma.personnelEvent.count({ where: { recordId: rec.id, type: { in: ['state.changed', 'archived', 'restored'] } } })).toBeGreaterThanOrEqual(4);
  });
  it('unbekanntes Mitglied: gleiche Antwort wie ohne Recht (nichts wird verraten)', async () => {
    const out = await run(runPersonal, LEAD, ['role-lead'], 'status', { str: { zustand: 'PAUSE' }, user: { mitglied: OTHER } });
    expect(out).toContain('Du benötigst');
  });
  it('/akte zeigt den Zustand', async () => {
    await personal(LEAD, ['role-lead'], 'status', { zustand: 'OFF_DUTY' });
    const out = await run(runAkte, LEAD, ['role-lead'], '', { user: { mitglied: TARGET } });
    expect(out).toContain('Außer Dienst');
    await personal(LEAD, ['role-lead'], 'schliessen', { grund: 'Austritt aus dem Dienst' });
    expect(await run(runAkte, LEAD, ['role-lead'], '', { user: { mitglied: TARGET } })).toContain('Geschlossen');
  });
});

describe('/sperre', () => {
  it('verhängen, prüfen, listen, aufheben – nur mit Recht; Pflichtgrund; Wirkung auf den Zugriff', async () => {
    const o = { user: { mitglied: TARGET }, str: { art: 'TICKET', grund: 'Missbrauch des Supports' } };
    expect(await sperre(COP, ['role-cop'], 'verhaengen', o)).toContain('Du benötigst');
    const made = await sperre(LEAD, ['role-lead'], 'verhaengen', { ...o, num: { stunden: 2 } });
    expect(made).toContain('Ticketsperre');
    const row = await prisma.restriction.findFirstOrThrow({ where: { guildId: G, userId: TARGET } });
    expect(Math.round((row.endsAt!.getTime() - Date.now()) / 3_600_000)).toBe(2);
    const check = await sperre(COP, ['role-cop'], 'pruefen', { user: { mitglied: TARGET } });
    expect(check).toContain('Missbrauch des Supports');
    expect(await sperre(COP, ['role-cop'], 'liste', {})).toContain(row.id);
    expect(await sperre(COP, ['role-cop'], 'liste', { str: { status: 'REVOKED' } })).toContain('Keine Sperren');
    expect(await sperre(COP, ['role-cop'], 'aufheben', { str: { id: row.id, grund: 'Irrtum' } })).toContain('Du benötigst');
    expect(await sperre(LEAD, ['role-lead'], 'aufheben', { str: { id: row.id, grund: 'Irrtum' } })).toContain('aufgehoben');
    expect(await sperre(LEAD, ['role-lead'], 'aufheben', { str: { id: row.id, grund: 'nochmal' } })).toContain('bereits beendet');
    expect(await sperre(LEAD, ['role-lead'], 'verhaengen', { ...o, str: { art: 'TICKET', grund: 'x' } })).toContain('Grund');
    const open = await sperre(LEAD, ['role-lead'], 'verhaengen', { ...o, str: { art: 'RADIO', grund: 'Funkdisziplin' } });
    expect(open).toContain('unbefristet');
  });
});

describe('/team', () => {
  it('zeigt die Teamliste mit Dienstgrad und Zustand; ohne Recht abgelehnt; Filter nach Teamname', async () => {
    const rank = await prisma.rank.create({ data: { guildId: G, name: 'Kommissar', order: 5, icon: '🔷' } });
    const team = await prisma.team.create({ data: { guildId: G, name: 'Streife' } });
    await prisma.personnelRecord.update({ where: { guildId_userId: { guildId: G, userId: TARGET } }, data: { rankId: rank.id, teamId: team.id, teamState: 'PAUSE' } });
    const out = await run(runTeam, LEAD, ['role-lead'], '', {});
    expect(out).toContain('Streife (1)');
    expect(out).toContain('Kommissar');
    expect(out).toContain('Tim Ziel');
    expect(out).toContain('🟡'); // Pause
    expect(await run(runTeam, LEAD, ['role-lead'], '', { str: { team: 'flug' } })).toContain('Keine Teams');
    expect(await run(runTeam, OTHER, [], '', {})).toContain('Du benötigst');
    await prisma.personnelRecord.update({ where: { guildId_userId: { guildId: G, userId: TARGET } }, data: { status: 'ARCHIVED' } });
    expect(await run(runTeam, LEAD, ['role-lead'], '', {})).not.toContain('Tim Ziel'); // geschlossene Akten fehlen
  });
});
