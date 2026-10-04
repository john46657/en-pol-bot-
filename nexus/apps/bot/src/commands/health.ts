import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@nexus/database';
import { checkHealth, overall, renderHealth } from '@nexus/health';
import { Redis } from 'ioredis';
import { config } from '../config.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

let redis: Redis | null = null;
const getRedis = (): Redis => {
  redis ??= new Redis(config.redis.url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on('error', () => undefined);
  return redis;
};

/** `/health`: Zustand von API, Datenbank, Redis, Discord, Bot und Workern auf einen Blick (nur Administratoren). */
export const healthCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('Zeigt den Zustand von API, Datenbank, Redis, Discord und Workern')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  execute: async (interaction) => {
    const member = interaction.guild ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null) : null;
    if (!member || !permissionService.isDiscordAdmin(member)) {
      await interaction.reply({ content: '⚠️ Nur für Administratoren.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const report = await checkHealth({ database: () => prisma.$queryRaw`SELECT 1`, redis: getRedis() });
    // Die API prüft der Bot von außen (er kennt sie nur über ihre Adresse)
    const apiUrl = process.env['API_URL'] ?? 'http://localhost:3000';
    try {
      const res = await fetch(`${apiUrl}/api/v1/health/live`, { signal: AbortSignal.timeout(2000) });
      report.components.api = res.ok ? { state: 'up', detail: 'läuft' } : { state: 'degraded', detail: `antwortet mit ${res.status}` };
    } catch {
      report.components.api = { state: 'down', detail: 'nicht erreichbar' };
    }
    report.status = overall(report.components);
    await interaction.editReply({ content: renderHealth(report) });
  },
});
