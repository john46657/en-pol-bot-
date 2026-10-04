import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import {
  KIND_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  WantedError,
  createNotice,
  formatNumber,
  getByNumber,
  history,
  revokeNotice,
  searchNotices,
  updateNotice,
} from '@nexus/wanted';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/fahndung person|fahrzeug|suchen|liste|anzeigen|bearbeiten|aufheben|historie` – Personen und Fahrzeuge getrennt. */
const PRIO_ICON = { LOW: '⚪', NORMAL: '🔵', HIGH: '🟠', URGENT: '🔴' } as const;
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const nr = (s: string) => Number(s.replace(/^F-?/i, ''));
type Notice = Awaited<ReturnType<typeof getByNumber>>;

const headline = (n: Notice) => (n.kind === 'PERSON' ? `👤 ${n.subjectName}` : `🚗 ${n.plate}${n.vehicleModel ? ` (${n.vehicleModel}${n.vehicleColor ? `, ${n.vehicleColor}` : ''})` : ''}`);
const card = (n: Notice) => ({
  title: `${PRIO_ICON[n.priority as keyof typeof PRIO_ICON] ?? '🔵'} ${formatNumber(n.number)} – ${KIND_LABEL[n.kind]}${n.status === 'REVOKED' ? ' (aufgehoben)' : ''}`,
  description: `**${headline(n)}**\n${n.reason}`,
  fields: [
    ...(n.appearance ? [{ name: 'Beschreibung', value: n.appearance }] : []),
    ...(n.ownerName ? [{ name: 'Halter', value: n.ownerName, inline: true }] : []),
    ...(n.lastSeen ? [{ name: 'Zuletzt gesehen', value: n.lastSeen, inline: true }] : []),
    { name: 'Priorität', value: PRIORITY_LABEL[n.priority as keyof typeof PRIORITY_LABEL] ?? n.priority, inline: true },
    ...(n.notes ? [{ name: 'Notiz', value: n.notes }] : []),
    ...(n.status === 'REVOKED' ? [{ name: 'Aufgehoben', value: `${n.revokeReason ?? ''} (<@${n.revokedBy}>)` }] : []),
  ],
});

export async function runFahndung(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const need: Permission = sub === 'person' || sub === 'fahrzeug' ? 'wanted.create' : sub === 'bearbeiten' ? 'wanted.edit' : sub === 'aufheben' ? 'wanted.revoke' : 'wanted.view';
  const can = (k: Permission) => permissionService.can(member, k);
  const deny = (k: Permission) => reply(interaction, `❌ ${permissionDeniedMessage([k])}`);
  // Aufheben: Recht ODER eigene Fahndung; alles andere strikt nach Recht
  if (sub !== 'aufheben' && !(await can(need))) return void (await deny(need));
  if (sub === 'aufheben' && !(await can('wanted.view'))) return void (await deny('wanted.view'));
  try {
    if (sub === 'person' || sub === 'fahrzeug') {
      const n = await createNotice({ guildId: guild.id, kind: sub === 'person' ? 'PERSON' : 'VEHICLE', actorId: member.id, reason: o.getString('grund', true), priority: o.getString('prioritaet') ?? undefined, lastSeen: o.getString('zuletzt') ?? undefined, notes: o.getString('notiz') ?? undefined, subjectName: o.getString('name') ?? undefined, appearance: o.getString('beschreibung') ?? undefined, plate: o.getString('kennzeichen') ?? undefined, vehicleModel: o.getString('modell') ?? undefined, vehicleColor: o.getString('farbe') ?? undefined, ownerName: o.getString('halter') ?? undefined });
      return void (await interaction.reply({ content: `✅ Fahndung **${formatNumber(n.number)}** erstellt.`, embeds: [embeds.warning(card(n))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'suchen' || sub === 'liste') {
      const { items } = await searchNotices({ guildId: guild.id, query: o.getString('suche') ?? undefined, kind: o.getString('art') ?? undefined, status: sub === 'liste' && !o.getBoolean('alle') ? 'ACTIVE' : undefined, limit: 15 });
      const body = items.map((n) => `${n.status === 'REVOKED' ? '~~' : ''}${PRIO_ICON[n.priority as keyof typeof PRIO_ICON] ?? ''} **${formatNumber(n.number)}** ${headline(n)} – ${n.reason.slice(0, 60)}${n.status === 'REVOKED' ? '~~ (aufgehoben)' : ''}`).join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: sub === 'suchen' ? '🔎 Fahndungssuche' : '📣 Aktive Fahndungen', description: body || 'Keine Fahndungen gefunden.' })], flags: MessageFlags.Ephemeral }));
    }
    const n = await getByNumber(guild.id, nr(o.getString('nummer', true)));
    if (sub === 'anzeigen') return void (await interaction.reply({ embeds: [embeds.info(card(n))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    if (sub === 'historie') {
      const ev = await history(guild.id, n.id);
      const text = ev.map((e) => `<t:${Math.floor(e.at.getTime() / 1000)}:f> **${e.type}** <@${e.actorId}>${e.data && e.type !== 'created' ? ` – ${JSON.stringify(e.data).slice(0, 150)}` : ''}`).join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: `📜 ${formatNumber(n.number)} – Historie`, description: text.slice(0, 3900) })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    if (sub === 'aufheben') {
      const own = n.createdBy === member.id;
      if (!own && !(await can('wanted.revoke'))) return void (await deny('wanted.revoke'));
      const r = await revokeNotice(guild.id, n.id, o.getString('grund', true), member.id, own ? 'wanted.own' : 'wanted.revoke');
      return void (await interaction.reply({ content: `✅ ${formatNumber(r.number)} aufgehoben.`, embeds: [embeds.success(card(r))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    // bearbeiten
    const u = await updateNotice(guild.id, n.id, { reason: o.getString('grund') ?? undefined, priority: o.getString('prioritaet') ?? undefined, lastSeen: o.getString('zuletzt') ?? undefined, notes: o.getString('notiz') ?? undefined, appearance: o.getString('beschreibung') ?? undefined, vehicleModel: o.getString('modell') ?? undefined, vehicleColor: o.getString('farbe') ?? undefined, ownerName: o.getString('halter') ?? undefined }, member.id);
    await interaction.reply({ content: '✅ Fahndung aktualisiert.', embeds: [embeds.info(card(u))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (e) {
    if (e instanceof WantedError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

export async function autocompleteFahndung(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guild) return void (await interaction.respond([]));
  const q = interaction.options.getFocused();
  const { items } = await searchNotices({ guildId: interaction.guild.id, status: 'ACTIVE', query: q || undefined, limit: 25 });
  await interaction.respond(items.map((n) => ({ name: `${formatNumber(n.number)} ${n.kind === 'PERSON' ? n.subjectName : n.plate}`.slice(0, 100), value: formatNumber(n.number) })));
}

const prio = (o: import('discord.js').SlashCommandStringOption) => o.setName('prioritaet').setDescription('Priorität').addChoices(...PRIORITIES.map((p) => ({ name: PRIORITY_LABEL[p], value: p })));
const nummer = (s: import('discord.js').SlashCommandSubcommandBuilder) => s.addStringOption((o) => o.setName('nummer').setDescription('Fahndungsnummer').setRequired(true).setAutocomplete(true));

export const fahndungCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('fahndung')
    .setDescription('Personen- und Fahrzeugfahndungen')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('person').setDescription('Personenfahndung erstellen')
        .addStringOption((o) => o.setName('name').setDescription('Name der Person').setRequired(true).setMaxLength(80))
        .addStringOption((o) => o.setName('grund').setDescription('Fahndungsgrund').setRequired(true).setMaxLength(500))
        .addStringOption((o) => o.setName('beschreibung').setDescription('Aussehen/Merkmale').setMaxLength(500))
        .addStringOption(prio)
        .addStringOption((o) => o.setName('zuletzt').setDescription('Zuletzt gesehen').setMaxLength(150))
        .addStringOption((o) => o.setName('notiz').setDescription('Notiz').setMaxLength(1000)),
    )
    .addSubcommand((s) =>
      s.setName('fahrzeug').setDescription('Fahrzeugfahndung erstellen')
        .addStringOption((o) => o.setName('kennzeichen').setDescription('Kennzeichen').setRequired(true).setMaxLength(15))
        .addStringOption((o) => o.setName('grund').setDescription('Fahndungsgrund').setRequired(true).setMaxLength(500))
        .addStringOption((o) => o.setName('modell').setDescription('Modell').setMaxLength(60))
        .addStringOption((o) => o.setName('farbe').setDescription('Farbe').setMaxLength(30))
        .addStringOption((o) => o.setName('halter').setDescription('Halter').setMaxLength(80))
        .addStringOption(prio)
        .addStringOption((o) => o.setName('zuletzt').setDescription('Zuletzt gesehen').setMaxLength(150))
        .addStringOption((o) => o.setName('notiz').setDescription('Notiz').setMaxLength(1000)),
    )
    .addSubcommand((s) =>
      s.setName('suchen').setDescription('Fahndungen durchsuchen (Name, Kennzeichen, Modell, Nummer …)')
        .addStringOption((o) => o.setName('suche').setDescription('Suchbegriff').setRequired(true))
        .addStringOption((o) => o.setName('art').setDescription('Nur Personen oder Fahrzeuge').addChoices({ name: 'Personen', value: 'PERSON' }, { name: 'Fahrzeuge', value: 'VEHICLE' })),
    )
    .addSubcommand((s) =>
      s.setName('liste').setDescription('Aktive Fahndungen')
        .addStringOption((o) => o.setName('art').setDescription('Nur Personen oder Fahrzeuge').addChoices({ name: 'Personen', value: 'PERSON' }, { name: 'Fahrzeuge', value: 'VEHICLE' }))
        .addBooleanOption((o) => o.setName('alle').setDescription('Auch aufgehobene')),
    )
    .addSubcommand((s) => nummer(s.setName('anzeigen').setDescription('Fahndung anzeigen')))
    .addSubcommand((s) =>
      nummer(s.setName('bearbeiten').setDescription('Fahndung ändern'))
        .addStringOption((o) => o.setName('grund').setDescription('Neuer Grund').setMaxLength(500))
        .addStringOption(prio)
        .addStringOption((o) => o.setName('zuletzt').setDescription('Zuletzt gesehen').setMaxLength(150))
        .addStringOption((o) => o.setName('beschreibung').setDescription('Aussehen (Person)').setMaxLength(500))
        .addStringOption((o) => o.setName('modell').setDescription('Modell (Fahrzeug)').setMaxLength(60))
        .addStringOption((o) => o.setName('farbe').setDescription('Farbe (Fahrzeug)').setMaxLength(30))
        .addStringOption((o) => o.setName('halter').setDescription('Halter (Fahrzeug)').setMaxLength(80))
        .addStringOption((o) => o.setName('notiz').setDescription('Notiz').setMaxLength(1000)),
    )
    .addSubcommand((s) => nummer(s.setName('aufheben').setDescription('Fahndung aufheben')).addStringOption((o) => o.setName('grund').setDescription('Grund (z. B. Festnahme)').setRequired(true).setMaxLength(300)))
    .addSubcommand((s) => nummer(s.setName('historie').setDescription('Änderungsverlauf')))
    .toJSON(),
  execute: runFahndung,
  autocomplete: autocompleteFahndung,
});
