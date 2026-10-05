import { guildRepository, prisma } from '@nexus/database';
import { CORE_COMMANDS, moduleOfCommand } from '@nexus/modules';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS, handleCommand } from '../src/commands.js';

const G = 'modules-guild';
beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await guildRepository.upsert({ id: G, name: 'Module' });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

const run = async (commandName: string) => {
  const i: any = {
    commandName,
    guildId: G,
    guild: { id: G },
    inGuild: () => true,
    member: { id: 'u', guild: { id: G, ownerId: 'x' }, roles: { cache: new Map() }, permissions: { has: () => false } },
    user: { id: 'u' },
    options: { getSubcommand: () => 'akte', getUser: () => ({ id: '900000000000900001', username: 'x' }), getString: () => null, getInteger: () => null },
    reply: vi.fn(async () => undefined),
  };
  await handleCommand(i);
  return JSON.stringify(i.reply.mock.calls[0]?.[0] ?? null);
};

describe('Module & Befehle im Bot', () => {
  it('jeder registrierte Slash-Befehl gehört zu einem Modul oder zu den Grundbefehlen', () => {
    for (const c of COMMANDS) expect(!!moduleOfCommand(c.name) || CORE_COMMANDS.includes(c.name), c.name).toBe(true);
  });
  it('abgeschaltetes Modul und einzeln abgeschalteter Befehl werden verständlich abgelehnt; Grundbefehle laufen weiter', async () => {
    await guildRepository.setModuleState(G, { disabled: ['moderation'], disabledCommands: ['sperre'] });
    expect(await run('mod')).toContain('Das Modul „Moderation“ ist auf diesem Server deaktiviert.');
    expect(await run('sperre')).toContain('Der Befehl /sperre ist auf diesem Server deaktiviert.');
    expect(await run('nexus')).not.toContain('deaktiviert');
    await guildRepository.setModuleState(G, { disabled: [], disabledCommands: [] });
    expect(await run('mod')).not.toContain('deaktiviert'); // wieder an (Antwort kommt dann vom Befehl selbst)
  });
});
