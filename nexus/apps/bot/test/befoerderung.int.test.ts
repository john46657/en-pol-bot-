import { permissionRepository, prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { saveRule } from '@nexus/promotions';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBefoerderung } from '../src/commands/befoerderung.js';

const G = 'befoerderung-guild';
const [HEAD, SUP, A] = ['900000000000180001', '900000000000180002', '900000000000180003'];

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.promotionCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Beförderung', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-head', ['promotions.view', 'promotions.create', 'promotions.approve', 'promotions.reject'].map(e), { name: 'Leitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-sup', ['promotions.view', 'promotions.create'].map(e), { name: 'Teamleitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-own', [e('own.profile.view')], { name: 'Beamter' });
  const r1 = await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true }, 'x');
  const r2 = await saveRank(G, { name: 'Oberkommissar', order: 2 }, 'x');
  const rec = await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: r1.id });
  await prisma.personnelRecord.update({ where: { id: rec.id }, data: { joinedAt: new Date(Date.now() - 20 * 86_400_000) } });
  await saveRule(G, r2.id, [{ type: 'SERVICE_DAYS', days: 10 }], 'x');
});
afterAll(async () => {
  await prisma.promotionCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, o: { str?: Record<string, string>; user?: string; bool?: boolean } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: { getSubcommand: () => sub, getString: (n: string, req?: boolean) => o.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null), getUser: () => (o.user ? { id: o.user } : null), getBoolean: () => o.bool ?? null },
    reply: vi.fn(async (x: any) => void replies.push(x)),
    replies,
  };
  return runBefoerderung(i).then(() => JSON.stringify(replies[0]));
}

describe('/befoerderung', () => {
  it('prüfen → Antrag → Vier-Augen → genehmigen → Historie', async () => {
    expect(await call(HEAD, ['role-head'], 'kandidaten')).toContain('Oberkommissar');
    expect(await call(SUP, ['role-sup'], 'pruefen', { user: A })).toContain('Voraussetzungen erfüllt');
    expect(await call(SUP, ['role-sup'], 'antrag', { user: A, str: { dienstgrad: 'oberkommissar', grund: 'Fleißig' } })).toContain('B-0001');
    expect(await call(SUP, ['role-sup'], 'genehmigen', { str: { nummer: 'B-0001' } })).toContain('Du benötigst'); // keine Genehmigungsberechtigung
    expect(await call(HEAD, ['role-head'], 'liste')).toContain('B-0001');
    expect(await call(HEAD, ['role-head'], 'genehmigen', { str: { nummer: '1' } })).toContain('genehmigt');
    expect((await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A }, include: { rank: true } })).rank?.name).toBe('Oberkommissar');
    expect(await call(A, ['role-own'], 'historie')).toContain('Oberkommissar');
    expect(await call(HEAD, ['role-head'], 'genehmigen', { str: { nummer: '1' } })).toContain('bereits entschieden');
  });
  it('Ablehnen mit Grund; Selbstantrag und fehlende Rechte', async () => {
    await call(SUP, ['role-sup'], 'antrag', { user: A, str: { dienstgrad: 'Oberkommissar' } });
    expect(await call(HEAD, ['role-head'], 'ablehnen', { str: { nummer: 'B-0001', grund: 'Noch nicht' } })).toContain('abgelehnt');
    expect(await call(A, ['role-own'], 'antrag', { user: A, str: { dienstgrad: 'Oberkommissar' } })).toContain('Du benötigst');
    expect(await call(HEAD, ['role-head'], 'antrag', { user: HEAD, str: { dienstgrad: 'Oberkommissar' } })).toContain('nicht selbst');
    expect(await call(A, ['role-own'], 'liste')).toContain('Du benötigst');
    expect(await call(SUP, ['role-sup'], 'antrag', { user: A, str: { dienstgrad: 'gibtsnicht' } })).toContain('gibt es nicht');
  });
});
