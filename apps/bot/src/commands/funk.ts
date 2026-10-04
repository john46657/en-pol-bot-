import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { permissionDeniedMessage } from '@nexus/permissions';
import {
  AREA_LABEL,
  LEVEL_LABEL,
  RadioError,
  accessHistory,
  checkMember,
  getAccess,
  listAccess,
  removeAccess,
  setAccess,
  type Level,
} from '@nexus/radio';
import type { Permission } from '@nexus/types';
import { embeds } from '../core/embed-builder.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/** `/funk hinzufügen|entfernen|suchen|liste|anzeigen` – Funk-Whitelist. Mitglieder sehen ihren eigenen Zugriff immer. */
const reply = (i: ChatInputCommandInteraction, content: string) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const ICON = { none: '🚫', listen: '👂', speak: '🎙️' } as const;
const lvl = (l: Level, special: boolean) => `${LEVEL_LABEL[l]}${special && l !== 'FULL' ? ' + Spezialfunk' : ''}`;

export async function runFunk(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!guild || !member) return void (await reply(interaction, 'Das geht nur auf einem Server.'));
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const target = o.getUser('mitglied') ?? interaction.user;
  const own = (sub === 'anzeigen' || sub === 'prüfen') && target.id === interaction.user.id;
  const need: Permission | null = own ? null : sub === 'hinzufügen' || sub === 'entfernen' ? 'radio.whitelist.manage' : 'radio.view';
  if (need && !(await permissionService.can(member, need))) return void (await reply(interaction, `❌ ${permissionDeniedMessage([need])}`));
  try {
    if (sub === 'hinzufügen') {
      const row = await setAccess({ guildId: guild.id, userId: target.id, level: o.getString('stufe', true), special: o.getBoolean('spezial') ?? undefined, reason: o.getString('grund') ?? undefined, actorId: member.id });
      return void (await reply(interaction, `✅ <@${target.id}>: **${lvl(row.level, row.special)}**`));
    }
    if (sub === 'entfernen') {
      await removeAccess(guild.id, target.id, member.id, o.getString('grund') ?? undefined);
      return void (await reply(interaction, `✅ <@${target.id}> wurde von der Funk-Whitelist entfernt.`));
    }
    if (sub === 'suchen' || sub === 'liste') {
      let userIds: string[] | undefined;
      if (sub === 'suchen') {
        const q = o.getString('name', true).trim();
        userIds = [...(await guild.members.search({ query: q, limit: 25 })).keys()];
        if (userIds.length === 0) return void (await reply(interaction, `ℹ️ Kein Mitglied zu „${q}“ gefunden.`));
      }
      const { items } = await listAccess({ guildId: guild.id, userIds, level: o.getString('stufe') ?? undefined, limit: 25 });
      const text = items.map((a) => `<@${a.userId}> – ${lvl(a.level, a.special)}`).join('\n');
      return void (await interaction.reply({ embeds: [embeds.info({ title: '📻 Funk-Whitelist', description: text || 'Keine Einträge gefunden.' })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }
    // anzeigen / prüfen
    const [entry, check] = await Promise.all([getAccess(guild.id, target.id), checkMember(guild.id, target.id)]);
    const lines = check.channels.map((c) => `${ICON[c.access]} **${c.name}** (${AREA_LABEL[c.area]})${c.access === 'none' && entry ? ` – ${({ 'special-required': 'Spezial-Freigabe fehlt', 'off-duty': 'nur im Dienst', inactive: 'deaktiviert', 'not-whitelisted': 'nicht auf der Whitelist', level: 'Stufe zu niedrig', ok: '' })[c.reason]}` : ''}`);
    const history = !own && sub === 'anzeigen' ? await accessHistory(guild.id, target.id) : [];
    const fields = [{ name: 'Funkstufe', value: entry ? lvl(entry.level, entry.special) : 'Nicht auf der Whitelist', inline: true }, { name: 'Kanäle', value: lines.join('\n') || 'Keine Funkkanäle eingerichtet.' }];
    if (history.length) fields.push({ name: 'Verlauf', value: history.slice(0, 5).map((e) => `<t:${Math.floor(e.at.getTime() / 1000)}:d> ${e.type}`).join('\n') });
    await interaction.reply({ embeds: [embeds.info({ title: `📻 Funk – ${target.username ?? target.id}`, description: `<@${target.id}>`, fields })], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (e) {
    if (e instanceof RadioError) return void (await reply(interaction, `❌ ${e.message}`));
    throw e;
  }
}

const levelChoices = (Object.keys(LEVEL_LABEL) as Level[]).map((k) => ({ name: LEVEL_LABEL[k], value: k }));

export const funkCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('funk')
    .setDescription('Funk-Whitelist: hinzufügen, entfernen, suchen, anzeigen')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('hinzufügen').setDescription('Mitglied auf die Whitelist setzen oder Stufe ändern')
        .addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true))
        .addStringOption((o) => o.setName('stufe').setDescription('Funkstufe').setRequired(true).addChoices(...levelChoices))
        .addBooleanOption((o) => o.setName('spezial').setDescription('Spezialfunk erlauben'))
        .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(200)),
    )
    .addSubcommand((s) =>
      s.setName('entfernen').setDescription('Mitglied von der Whitelist entfernen')
        .addUserOption((o) => o.setName('mitglied').setDescription('Mitglied').setRequired(true))
        .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(200)),
    )
    .addSubcommand((s) => s.setName('suchen').setDescription('Whitelist nach Namen durchsuchen').addStringOption((o) => o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand((s) => s.setName('liste').setDescription('Whitelist anzeigen').addStringOption((o) => o.setName('stufe').setDescription('Nur diese Stufe').addChoices(...levelChoices)))
    .addSubcommand((s) => s.setName('anzeigen').setDescription('Funkzugriff eines Mitglieds (Standard: du)').addUserOption((o) => o.setName('mitglied').setDescription('Mitglied')))
    .toJSON(),
  execute: runFunk,
});
