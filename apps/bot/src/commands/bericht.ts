import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { restDiscordPort } from '@nexus/automation';
import { permissionDeniedMessage } from '@nexus/permissions';
import { generate, listReports, publish, renderEmbed, type ReportData, type ReportKind } from '@nexus/reports';
import { parseDay } from '@nexus/absences';
import type { Permission } from '@nexus/types';
import { config } from '../config.js';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/bericht tag|woche [datum] [veroeffentlichen]` und `/bericht liste` – Berichte ansehen (`report.view`), erzeugen/veröffentlichen (`report.manage`). */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

export async function runBericht(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const publishIt = o.getBoolean('veroeffentlichen') === true;
  const need: Permission = publishIt ? 'report.manage' : 'report.view';
  if (!(await permissionService.can(member, need)) && !(await permissionService.can(member, 'report.manage'))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  if (sub === 'liste') {
    const list = await listReports(guild.id, undefined, 10);
    return void (await interaction.reply({ embeds: [embeds.info({ title: '📊 Berichte', description: list.map((r) => `${r.kind === 'DAY' ? 'Tag' : 'Woche'} ab <t:${Math.floor(r.periodStart.getTime() / 1000)}:d>${r.messageId ? ' · veröffentlicht' : ''}`).join('\n') || 'Noch keine gespeicherten Berichte.' })], flags: MessageFlags.Ephemeral }));
  }
  const kind: ReportKind = sub === 'woche' ? 'WEEK' : 'DAY';
  const dateText = o.getString('datum');
  let on = new Date();
  if (dateText) {
    const d = parseDay(dateText);
    if (!d) return void (await reply(interaction, '❌ Bitte das Datum als `TT.MM.JJJJ` angeben.'));
    on = new Date(d.getTime() + 12 * 3600_000); // Mittag UTC liegt in Berlin immer am selben Kalendertag
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const report = await generate(guild.id, kind, on, member.id);
  let note = '';
  if (publishIt) {
    const r = await publish(guild.id, report.id, restDiscordPort(config.discord.token));
    note = { posted: '\n✅ Im Berichts-Kanal veröffentlicht.', edited: '\n✅ Veröffentlichung aktualisiert.', 'no-channel': `\n⚠️ ${r.reason}`, failed: `\n⚠️ Veröffentlichen fehlgeschlagen: ${r.reason}` }[r.status];
  }
  await interaction.editReply({ content: note || null, embeds: [renderEmbed(report.data as unknown as ReportData) as never] });
}

export const berichtCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('bericht')
    .setDescription('Tages- und Wochenberichte')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('tag').setDescription('Tagesbericht (Standard: heute)').addStringOption((o) => o.setName('datum').setDescription('TT.MM.JJJJ')).addBooleanOption((o) => o.setName('veroeffentlichen').setDescription('Im Berichts-Kanal posten')))
    .addSubcommand((s) => s.setName('woche').setDescription('Wochenbericht (Standard: aktuelle Woche)').addStringOption((o) => o.setName('datum').setDescription('Ein Tag der Woche (TT.MM.JJJJ)')).addBooleanOption((o) => o.setName('veroeffentlichen').setDescription('Im Berichts-Kanal posten')))
    .addSubcommand((s) => s.setName('liste').setDescription('Gespeicherte Berichte'))
    .toJSON(),
  execute: runBericht,
});
