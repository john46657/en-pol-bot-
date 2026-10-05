import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { ModerationError, TYPE_LABEL, moderate, restModerationPort, revoke, userSummary, type CaseType } from '@nexus/moderation';
import { permissionDeniedMessage } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { config } from '../config.js';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/mod warn|timeout|kick|ban|aufheben|akte` – Moderation wie im Dashboard (Schutz- und Rangregeln im Paket, Rechte je Maßnahme). */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const STATUS = { ACTIVE: '🔴 aktiv', EXPIRED: '⚪ abgelaufen', REVOKED: '🟢 aufgehoben', DONE: '⚫ erledigt' } as Record<string, string>;
const grund = (o: import('discord.js').SlashCommandStringOption) => o.setName('grund').setDescription('Grund').setRequired(true).setMinLength(3).setMaxLength(300);
const mitglied = (o: import('discord.js').SlashCommandUserOption) => o.setName('mitglied').setDescription('Betroffenes Mitglied').setRequired(true);

export async function runMod(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const need: Permission = (['warn', 'timeout', 'kick', 'ban'].includes(sub) ? `moderation.${sub}` : sub === 'aufheben' ? 'moderation.revoke' : 'moderation.view') as Permission;
  if (!(await permissionService.can(member, need))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  const actor = { userId: member.id, roleIds: [...member.roles.cache.keys()] };
  const port = restModerationPort(config.discord.token);
  try {
    if (['warn', 'timeout', 'kick', 'ban'].includes(sub)) {
      const type = sub.toUpperCase() as CaseType;
      const c = await moderate({ guildId: guild.id, type, userId: o.getUser('mitglied', true).id, reason: o.getString('grund', true), durationMin: o.getInteger('minuten') ?? (o.getInteger('tage') ? (o.getInteger('tage') as number) * 1440 : undefined), deleteDays: o.getInteger('loeschtage') ?? undefined, actor }, port);
      return void (await reply(interaction, `✅ ${TYPE_LABEL[type]} für <@${c.userId}> – Fall #${c.number}${c.dmDelivered ? '' : ' (Benutzer konnte nicht per DM informiert werden)'}.\nID: \`${c.id}\``));
    }
    if (sub === 'aufheben') {
      const c = await revoke(guild.id, o.getString('id', true), o.getString('grund', true), actor, port);
      return void (await reply(interaction, `✅ ${TYPE_LABEL[c.type as CaseType]} (Fall #${c.number}) für <@${c.userId}> aufgehoben.`));
    }
    const user = o.getUser('mitglied', true);
    const s = await userSummary(guild.id, user.id);
    const lines = s.cases.slice(0, 10).map((c) => `${STATUS[c.status] ?? c.status} **#${c.number} ${TYPE_LABEL[c.type as CaseType]}** – ${c.reason.slice(0, 80)} · <t:${Math.floor(c.createdAt.getTime() / 1000)}:d>`);
    return void (await interaction.reply({ embeds: [embeds.info({ title: `🛡️ Akte von ${user.username}`, description: `Aktive Verwarnungen: **${s.warns}** · Timeouts: **${s.timeouts}** · Kicks: **${s.kicks}** · Gebannt: **${s.banned ? 'ja' : 'nein'}**\n\n${lines.join('\n') || 'Keine Fälle.'}` })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
  } catch (e) {
    if (e instanceof ModerationError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export const modCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation (Verwarnung, Timeout, Kick, Bann)')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('warn').setDescription('Mitglied verwarnen').addUserOption(mitglied).addStringOption(grund))
    .addSubcommand((s) =>
      s.setName('timeout').setDescription('Mitglied stummschalten').addUserOption(mitglied)
        .addIntegerOption((o) => o.setName('minuten').setDescription('Dauer in Minuten (1 bis 40320 = 28 Tage)').setRequired(true).setMinValue(1).setMaxValue(40320))
        .addStringOption(grund),
    )
    .addSubcommand((s) => s.setName('kick').setDescription('Mitglied vom Server entfernen').addUserOption(mitglied).addStringOption(grund))
    .addSubcommand((s) =>
      s.setName('ban').setDescription('Benutzer bannen').addUserOption(mitglied).addStringOption(grund)
        .addIntegerOption((o) => o.setName('loeschtage').setDescription('Nachrichten der letzten Tage löschen (0–7)').setMinValue(0).setMaxValue(7))
        .addIntegerOption((o) => o.setName('tage').setDescription('Befristet: Bann endet nach so vielen Tagen (leer = dauerhaft)').setMinValue(1).setMaxValue(365)),
    )
    .addSubcommand((s) =>
      s.setName('aufheben').setDescription('Verwarnung, Timeout oder Bann aufheben')
        .addStringOption((o) => o.setName('id').setDescription('ID des Falls (aus /mod akte)').setRequired(true).setMaxLength(40))
        .addStringOption(grund),
    )
    .addSubcommand((s) => s.setName('akte').setDescription('Moderationsakte eines Mitglieds').addUserOption(mitglied))
    .toJSON(),
  execute: runMod,
});
