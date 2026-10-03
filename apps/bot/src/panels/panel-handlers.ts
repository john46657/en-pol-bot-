import {
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type GuildMember,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { panelRepository } from '@nexus/database';
import { PANEL_BUTTON_ACTION, PANEL_SELECT_ACTION, findPanelAction } from '@nexus/discord';
import type { PanelAction, PanelConfig } from '@nexus/types';
import { registerButton, registerSelect } from '../core/interaction-registry.js';
import { log } from '../logger.js';
import { checkBotRoleAccess } from '../services/role.service.js';

/**
 * Klicks auf Panel-Komponenten. Panel und Aktion werden bei jedem Klick frisch aus der Datenbank gelesen
 * (guild-scoped) – die Custom-ID ist nur ein Hinweis, nie die Autorität.
 */
const STALE = '⚠️ Dieses Panel ist nicht mehr aktuell.';
const DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
];

type Replyable = ButtonInteraction | StringSelectMenuInteraction;

const reply = (i: Replyable, content: string) =>
  i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

export async function runPanelAction(i: Replyable, action: PanelAction): Promise<void> {
  if (action.type === 'message') {
    await reply(i, action.content);
    return;
  }
  const guild = i.guild;
  const member = i.member as GuildMember | null;
  if (!guild || !member) {
    await reply(i, '⚠️ Das geht nur auf einem Server.');
    return;
  }
  const role = await guild.roles.fetch(action.roleId).catch(() => null);
  if (!role) return void (await reply(i, '⚠️ Diese Rolle gibt es nicht mehr.'));
  // Zur Laufzeit erneut prüfen – Rollen und Rechte können sich seit dem Speichern geändert haben.
  if (role.permissions.any(DANGEROUS_PERMISSIONS)) {
    return void (await reply(i, '⚠️ Diese Rolle kann nicht per Panel vergeben werden.'));
  }
  if (!checkBotRoleAccess(guild, role).botCanManage) {
    return void (await reply(
      i,
      '⚠️ Der Bot kann diese Rolle nicht vergeben (Rollen-Hierarchie oder fehlende Rechte).',
    ));
  }
  const has = member.roles.cache.has(role.id);
  try {
    if (has) await member.roles.remove(role, 'NEXUS Panel');
    else await member.roles.add(role, 'NEXUS Panel');
  } catch (error) {
    log.warn(
      { guildId: guild.id, roleId: role.id, err: String(error) },
      'Panel-Rollenwechsel fehlgeschlagen.',
    );
    return void (await reply(i, '⚠️ Die Rolle konnte nicht geändert werden.'));
  }
  await reply(
    i,
    has ? `✅ Rolle **${role.name}** entfernt.` : `✅ Rolle **${role.name}** erhalten.`,
  );
}

async function resolve(
  i: Replyable,
  panelId: string,
  componentId: string,
): Promise<PanelAction | null> {
  const panel = i.guildId ? await panelRepository.get(i.guildId, panelId) : null;
  const action = panel
    ? findPanelAction(panel.config as unknown as PanelConfig, componentId)
    : undefined;
  if (!action) {
    await reply(i, STALE);
    return null;
  }
  return action;
}

registerButton(PANEL_BUTTON_ACTION, async (i, { args }) => {
  const [panelId = '', componentId = ''] = args;
  const action = await resolve(i, panelId, componentId);
  if (action) await runPanelAction(i, action);
});

registerSelect(PANEL_SELECT_ACTION, async (i, { args }) => {
  const [panelId = ''] = args;
  const action = await resolve(i, panelId, i.values[0] ?? '');
  if (action) await runPanelAction(i, action);
});
