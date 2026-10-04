import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { FleetError, penalties as P } from '@nexus/fleet';
import { permissionDeniedMessage } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/strafe ausstellen|register|liste|aufheben` – RP-Strafen. Aufheben: `penalties.revoke` oder als Aussteller. */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const nr = (s: string) => Number(s.replace(/^S-?/i, ''));
const ts = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:d>`;
type Pen = Awaited<ReturnType<typeof P.getByNumber>>;
const line = (p: Pen) => `${p.status === 'REVOKED' ? '~~' : ''}**${P.formatNumber(p.number)}** ${P.KIND_LABEL[p.kind]} ${P.describe(p)} – ${p.subjectName}: ${p.reason.slice(0, 60)}${p.status === 'REVOKED' ? '~~ (aufgehoben)' : ''}`;

export async function runStrafe(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const can = (k: Permission) => permissionService.can(member, k);
  const deny = (k: Permission) => reply(interaction, `❌ ${permissionDeniedMessage([k])}`);
  const need: Permission = sub === 'ausstellen' ? 'penalties.issue' : 'penalties.view';
  if (!(await can(need))) return void (await deny(need));
  try {
    if (sub === 'ausstellen') {
      const p = await P.issuePenalty({ guildId: guild.id, kind: o.getString('art', true), subjectName: o.getString('name', true), reason: o.getString('grund', true), issuedBy: member.id, amount: o.getInteger('betrag') ?? undefined, points: o.getInteger('punkte') ?? undefined, durationDays: o.getInteger('tage') ?? undefined, plate: o.getString('kennzeichen') ?? undefined });
      const reg = await P.registerOf(guild.id, p.subjectName);
      const warn = reg.pointsLimitReached ? `\n⚠️ ${reg.points} Strafpunkte – Grenze (${P.POINTS_LIMIT}) erreicht: Führerscheinentzug prüfen.` : '';
      return void (await reply(interaction, `✅ ${line(p)}${p.personnelEntryId ? '\n📁 In deiner Personalakte vermerkt.' : ''}${warn}`));
    }
    if (sub === 'register') {
      const r = await P.registerOf(guild.id, o.getString('name', true));
      const lines = [`💶 Bußgelder (aktiv): **${r.finesTotal} $**`, `⚠️ Verwarnungen: **${r.warnings}**`, `🔻 Strafpunkte: **${r.points}**${r.pointsLimitReached ? ' (Grenze erreicht)' : ''}`, `🪪 Führerschein: ${r.licenseRevokedUntil ? `entzogen bis ${ts(r.licenseRevokedUntil)}` : 'nicht entzogen'}`, `🚗 Beschlagnahmt: ${r.seizedPlates.join(', ') || '–'}`, '', ...r.penalties.slice(0, 8).map(line)];
      return void (await interaction.reply({ embeds: [embeds.info({ title: `📒 Strafenregister – ${r.subjectName}`, description: lines.join('\n').slice(0, 3900) })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'liste') {
      const { items } = await P.listPenalties({ guildId: guild.id, query: o.getString('suche') ?? undefined, kind: o.getString('art') ?? undefined, limit: 15 });
      return void (await interaction.reply({ embeds: [embeds.info({ title: '⚖️ Strafen', description: items.map(line).join('\n').slice(0, 3900) || 'Keine Strafen gefunden.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    // aufheben
    const p = await P.getByNumber(guild.id, nr(o.getString('nummer', true)));
    const own = p.issuedBy === member.id;
    if (!own && !(await can('penalties.revoke'))) return void (await deny('penalties.revoke'));
    const r = await P.revokePenalty(guild.id, p.id, o.getString('grund', true), member.id, own ? 'penalties.own' : 'penalties.revoke');
    await reply(interaction, `✅ ${line(r)}`);
  } catch (e) {
    if (e instanceof FleetError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteStrafe(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const { items } = await P.listPenalties({ guildId: interaction.guild.id, status: 'ACTIVE', query: interaction.options.getFocused() || undefined, limit: 25 });
  await interaction.respond(items.map((p) => ({ name: `${P.formatNumber(p.number)} ${P.KIND_LABEL[p.kind]} – ${p.subjectName}`.slice(0, 100), value: P.formatNumber(p.number) })));
}

const artChoices = P.KINDS.map((k) => ({ name: P.KIND_LABEL[k], value: k }));

export const strafeCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('strafe')
    .setDescription('RP-Strafen: Bußgeld, Verwarnung, Punkte, Führerscheinentzug, Beschlagnahmung')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('ausstellen').setDescription('Strafe ausstellen')
        .addStringOption((o) => o.setName('art').setDescription('Strafart').setRequired(true).addChoices(...artChoices))
        .addStringOption((o) => o.setName('name').setDescription('Name der Person').setRequired(true).setMaxLength(80))
        .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500))
        .addIntegerOption((o) => o.setName('betrag').setDescription('Bußgeld in $').setMinValue(1).setMaxValue(10_000_000))
        .addIntegerOption((o) => o.setName('punkte').setDescription('Strafpunkte').setMinValue(1).setMaxValue(20))
        .addIntegerOption((o) => o.setName('tage').setDescription('Dauer des Führerscheinentzugs in Tagen').setMinValue(1).setMaxValue(3650))
        .addStringOption((o) => o.setName('kennzeichen').setDescription('Kennzeichen (Beschlagnahmung / Tatfahrzeug)').setMaxLength(15)),
    )
    .addSubcommand((s) => s.setName('register').setDescription('Strafenregister einer Person').addStringOption((o) => o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand((s) => s.setName('liste').setDescription('Strafen durchsuchen').addStringOption((o) => o.setName('suche').setDescription('Name, Nummer, Kennzeichen, Grund')).addStringOption((o) => o.setName('art').setDescription('Strafart').addChoices(...artChoices)))
    .addSubcommand((s) => s.setName('aufheben').setDescription('Strafe aufheben').addStringOption((o) => o.setName('nummer').setDescription('Strafnummer').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(300)))
    .toJSON(),
  execute: runStrafe,
  autocomplete: autocompleteStrafe,
});
