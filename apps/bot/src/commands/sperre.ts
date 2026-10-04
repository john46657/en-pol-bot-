import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import { RestrictionError, TYPES, TYPE_LABEL, createRestriction, listRestrictions, revokeRestriction, type RestrictionKind } from '@nexus/restrictions';
import type { Permission } from '@nexus/types';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/sperre verhaengen|aufheben|liste|pruefen` – Sperren wie im Dashboard (Bewerbung, Ticket, Fraktion, Funk). */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const stamp = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:f>`;
const STATUS = { ACTIVE: '🔴 aktiv', EXPIRED: '⚪ abgelaufen', REVOKED: '🟢 aufgehoben' } as const;
const TYPE_CHOICES = TYPES.map((t) => ({ name: TYPE_LABEL[t], value: t }));

/** Dauer in Stunden → Ende (leer = unbefristet). */
const endsIn = (hours: number | null) => (hours === null ? null : new Date(Date.now() + hours * 3_600_000));

export async function runSperre(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const need: Permission = sub === 'verhaengen' ? 'restrictions.create' : sub === 'aufheben' ? 'restrictions.revoke' : 'restrictions.view';
  if (!(await permissionService.can(member, need))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  try {
    if (sub === 'verhaengen') {
      const target = o.getUser('mitglied', true);
      const hours = o.getNumber('stunden');
      const r = await createRestriction({ guildId: guild.id, userId: target.id, type: o.getString('art', true), reason: o.getString('grund', true), note: o.getString('notiz') ?? undefined, endsAt: endsIn(hours), actorId: interaction.user.id });
      return void (await reply(interaction, `⛔ ${TYPE_LABEL[r.type as RestrictionKind]} für <@${r.userId}> verhängt – ${r.endsAt ? `bis ${stamp(r.endsAt)}` : 'unbefristet'}.\nID: \`${r.id}\``));
    }
    if (sub === 'aufheben') {
      const r = await revokeRestriction(guild.id, o.getString('id', true), o.getString('grund', true), interaction.user.id);
      return void (await reply(interaction, `✅ ${TYPE_LABEL[r.type as RestrictionKind]} für <@${r.userId}> aufgehoben.`));
    }
    const rows = await listRestrictions({ guildId: guild.id, userId: o.getUser('mitglied')?.id, type: o.getString('art') ?? undefined, status: sub === 'pruefen' ? 'ACTIVE' : (o.getString('status') ?? 'ACTIVE'), limit: 15 });
    const text = rows.map((r) => `${STATUS[r.status]} **${TYPE_LABEL[r.type as RestrictionKind]}** <@${r.userId}> – ${r.reason.slice(0, 80)} (${r.endsAt ? `bis ${stamp(r.endsAt)}` : 'unbefristet'})\n\`${r.id}\``).join('\n');
    return void (await interaction.reply({ embeds: [embeds.info({ title: '⛔ Sperren', description: text || 'Keine Sperren gefunden.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
  } catch (e) {
    if (e instanceof RestrictionError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

const art = (o: import('discord.js').SlashCommandStringOption) => o.setName('art').setDescription('Art der Sperre').addChoices(...TYPE_CHOICES);

export const sperreCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('sperre')
    .setDescription('Sperren verwalten (Bewerbung, Ticket, Fraktion, Funk)')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('verhaengen').setDescription('Sperre verhängen')
        .addUserOption((o) => o.setName('mitglied').setDescription('Betroffenes Mitglied').setRequired(true))
        .addStringOption((o) => art(o).setRequired(true))
        .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMinLength(3).setMaxLength(300))
        .addNumberOption((o) => o.setName('stunden').setDescription('Dauer in Stunden (leer = unbefristet)').setMinValue(0.1).setMaxValue(8760))
        .addStringOption((o) => o.setName('notiz').setDescription('Interne Notiz').setMaxLength(1000)),
    )
    .addSubcommand((s) =>
      s.setName('aufheben').setDescription('Sperre aufheben')
        .addStringOption((o) => o.setName('id').setDescription('ID der Sperre (aus /sperre liste)').setRequired(true).setMaxLength(40))
        .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMinLength(3).setMaxLength(300)),
    )
    .addSubcommand((s) =>
      s.setName('liste').setDescription('Sperren auflisten')
        .addUserOption((o) => o.setName('mitglied').setDescription('Nur dieses Mitglied'))
        .addStringOption(art)
        .addStringOption((o) => o.setName('status').setDescription('Status (Standard: aktiv)').addChoices({ name: 'Aktiv', value: 'ACTIVE' }, { name: 'Abgelaufen', value: 'EXPIRED' }, { name: 'Aufgehoben', value: 'REVOKED' })),
    )
    .addSubcommand((s) => s.setName('pruefen').setDescription('Aktive Sperren eines Mitglieds prüfen').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true)))
    .toJSON(),
  execute: runSperre,
});
