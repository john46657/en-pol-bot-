import 'reflect-metadata';
import { prisma } from '@nexus/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BackupError, createBackup, resetSettings, restoreBackup } from '../src/modules/backup/backup.js';

const G = 'backup-guild';
const OTHER = 'backup-guild-2';
let appId = '';
let qId = '';

beforeAll(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [G, OTHER] } } });
  await prisma.guild.create({ data: { id: G, name: 'Backup', settings: { create: { data: { selections: { 'ticket-log-channel': '900000000000990001' }, modules: { disabled: ['sek'], disabledCommands: [] } } } } } });
  await prisma.guild.create({ data: { id: OTHER, name: 'Andere', settings: { create: {} } } });
  const app = await prisma.application.create({ data: { guildId: G, name: 'Moderation', slug: 'mod', createdBy: 'x', updatedBy: 'x', config: { rating: { fields: [{ id: 'k', label: 'Kommunikation', max: 5 }] }, review: null } } });
  appId = app.id;
  qId = (await prisma.applicationQuestion.create({ data: { applicationId: app.id, questionId: 'q1', type: 'TEXT', title: 'Warum?', order: 0 } })).id;
  await prisma.applicationVersion.create({ data: { applicationId: app.id, version: 1, questions: [], publishedById: 'x' } });
  await prisma.rank.create({ data: { guildId: G, name: 'Kommissar', order: 1 } });
  await prisma.ticketCategory.create({ data: { guildId: G, name: 'Support' } });
  await prisma.nexusRole.create({ data: { guildId: G, name: 'Ausbilder', priority: 3, entries: [] } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [G, OTHER] } } });
  await prisma.$disconnect();
});

describe('Konfigurations-Backup', () => {
  it('Sicherung enthält Einstellungen, Bewerbungsarten mit Fragen und Versionen, Strukturen – keine Nutzdaten', async () => {
    const b = await createBackup(G);
    expect(b).toMatchObject({ format: 'nexus-config-backup', version: 1, guildId: G });
    expect(b.tables['Application']!.map((r) => r['name'])).toEqual(['Moderation']);
    expect(b.tables['ApplicationQuestion']).toHaveLength(1);
    expect(b.tables['ApplicationVersion']).toHaveLength(1);
    expect(b.tables['Rank']).toHaveLength(1);
    expect(b.tables['GuildSettings']![0]!['data']).toMatchObject({ modules: { disabled: ['sek'] } });
    expect(b.tables['ApplicationSubmission']).toBeUndefined();
  });

  it('Wiederherstellen: geänderte und gelöschte Einträge zurück, neuere bleiben; JSON und Datum korrekt', async () => {
    const b = JSON.parse(JSON.stringify(await createBackup(G))); // wie aus der Datei
    await prisma.application.update({ where: { id: appId }, data: { name: 'Umbenannt', config: {} } });
    await prisma.applicationQuestion.delete({ where: { id: qId } });
    await prisma.guildSettings.update({ where: { guildId: G }, data: { data: {} } });
    const extra = await prisma.rank.create({ data: { guildId: G, name: 'Neu nach Sicherung', order: 2 } });
    const r = await restoreBackup(G, b);
    expect(r.skipped).toEqual([]);
    expect(r.restored['Application']).toBe(1);
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(app.name).toBe('Moderation');
    expect(app.config).toMatchObject({ rating: { fields: [{ id: 'k' }] } });
    expect(await prisma.applicationQuestion.findUnique({ where: { id: qId } })).not.toBeNull();
    expect((await prisma.guildSettings.findUniqueOrThrow({ where: { guildId: G } })).data).toMatchObject({ modules: { disabled: ['sek'] } });
    expect(await prisma.rank.findUnique({ where: { id: extra.id } })).not.toBeNull(); // neuerer Eintrag bleibt
  });

  it('nur in denselben Server; fremde Einträge und Kinder fremder Eltern werden übersprungen; Konflikte gemeldet', async () => {
    const b = JSON.parse(JSON.stringify(await createBackup(G)));
    await expect(restoreBackup(OTHER, b)).rejects.toBeInstanceOf(BackupError);
    await expect(restoreBackup(G, { format: 'x' })).rejects.toThrow('keine NEXUS-Sicherung');
    const foreignApp = await prisma.application.create({ data: { guildId: OTHER, name: 'Fremd', slug: 'f', createdBy: 'x', updatedBy: 'x', config: {} } });
    b.tables['Rank'].push({ ...b.tables['Rank'][0], id: 'eingeschmuggelt', guildId: OTHER, name: 'X' });
    b.tables['ApplicationQuestion'].push({ ...b.tables['ApplicationQuestion'][0], id: 'fremde-frage', applicationId: foreignApp.id, questionId: 'qx' });
    // Konflikt: anderer Eintrag mit gleichem Namen (eindeutig je Server)
    await prisma.ticketCategory.deleteMany({ where: { guildId: G } });
    await prisma.ticketCategory.create({ data: { guildId: G, name: 'Support' } });
    const r = await restoreBackup(G, b);
    expect(r.skipped).toEqual(
      expect.arrayContaining([
        { model: 'Rank', key: 'eingeschmuggelt', reason: 'Gehört nicht zu diesem Server.' },
        { model: 'ApplicationQuestion', key: 'fremde-frage', reason: 'Gehört nicht zu diesem Server.' },
        expect.objectContaining({ model: 'TicketCategory', reason: expect.stringContaining('Konflikt') }),
      ]),
    );
    expect(await prisma.rank.findUnique({ where: { id: 'eingeschmuggelt' } })).toBeNull();
    expect(await prisma.applicationQuestion.findUnique({ where: { id: 'fremde-frage' } })).toBeNull();
  });

  it('Zurücksetzen nur der gewählten Bereiche', async () => {
    await prisma.logForward.create({ data: { guildId: G, area: '*', channelId: '900000000000990002' } });
    const done = await resetSettings(G, ['settings', 'logs']);
    expect(done).toMatchObject({ settings: true, logs: true, permissions: false });
    expect((await prisma.guildSettings.findUniqueOrThrow({ where: { guildId: G } })).data).toEqual({});
    expect(await prisma.logForward.count({ where: { guildId: G } })).toBe(0);
    expect(await prisma.nexusRole.count({ where: { guildId: G } })).toBe(1); // Rechte nicht gewählt
    await resetSettings(G, ['permissions']);
    expect(await prisma.nexusRole.count({ where: { guildId: G } })).toBe(0);
    expect(await prisma.application.count({ where: { guildId: G } })).toBe(1); // Bewerbungsarten nie
  });
});
