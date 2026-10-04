import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordMemberLeft } from '../src/events/guild-events.js';

const G = 'memberleft-guild';
const U = '900000000000600001';

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Verlassen', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Mitglied verlässt den Server (Spezifikation 54)', () => {
  it('mit aktiver Akte: Audit-Eintrag und Verlauf in der Akte; Akte bleibt unverändert', async () => {
    const rec = await prisma.personnelRecord.create({ data: { guildId: G, userId: U, rpName: 'Weg Gegangen' } });
    await recordMemberLeft({ id: U, guild: { id: G } } as never);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { guildId: G, action: 'member.left' } });
    expect(audit).toMatchObject({ resourceType: 'PersonnelRecord', resourceId: rec.id, actorId: null });
    expect(await prisma.personnelEvent.count({ where: { recordId: rec.id, type: 'member.left' } })).toBe(1);
    expect((await prisma.personnelRecord.findUniqueOrThrow({ where: { id: rec.id } })).status).toBe('ACTIVE');
  });

  it('ohne Akte: nur Audit-Eintrag; geschlossene Akte bekommt keinen weiteren Verlaufseintrag; andere Server unberührt', async () => {
    await recordMemberLeft({ id: U, guild: { id: G } } as never);
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'member.left', resourceType: 'User' } })).toBe(1);
    const closed = await prisma.personnelRecord.create({ data: { guildId: G, userId: '900000000000600002', rpName: 'Alt', status: 'ARCHIVED' } });
    await recordMemberLeft({ id: '900000000000600002', guild: { id: G } } as never);
    expect(await prisma.personnelEvent.count({ where: { recordId: closed.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { guildId: 'anderer-server', action: 'member.left' } })).toBe(0);
  });
});
