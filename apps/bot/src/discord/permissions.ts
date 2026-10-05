import {
  MessageFlags,
  type GuildMember,
  type Interaction,
  type MessageComponentInteraction,
} from 'discord.js';
import { permissionDeniedMessage, permissions, type AccessContext } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { permissionService } from '../services/permission.service.js';

/**
 * Berechtigungen im Bot – dieselbe zentrale Engine wie in der API (`@nexus/permissions`).
 * Discord-Administratoren/Besitzer dürfen immer; sonst zählen die dem Server zugeordneten Rollen.
 */
export function accessOf(member: GuildMember): AccessContext {
  return {
    guildId: member.guild.id,
    roleIds: [...member.roles.cache.keys()],
    bypass: permissionService.isDiscordAdmin(member),
    userId: member.id,
  };
}

export const memberCan = (member: GuildMember, key: Permission): Promise<boolean> =>
  permissions.can(accessOf(member), key);

export const memberCanAny = (member: GuildMember, keys: readonly Permission[]): Promise<boolean> =>
  permissions.canAny(accessOf(member), keys);

export const REVIEW_KEYS: readonly Permission[] = [
  'applications.submissions.accept',
  'applications.submissions.accept_reason',
  'applications.submissions.deny',
  'applications.submissions.deny_reason',
  'applications.submissions.review',
];

export const memberCanManage = (m: GuildMember): Promise<boolean> =>
  memberCan(m, 'applications.manage');
export const memberCanReview = (m: GuildMember): Promise<boolean> => memberCanAny(m, REVIEW_KEYS);
export const memberCanViewSubmissions = (m: GuildMember): Promise<boolean> =>
  memberCan(m, 'applications.submissions.view');

/**
 * Prüft die Berechtigung des auslösenden Mitglieds serverseitig und antwortet bei Ablehnung ephemeral.
 * @returns das Mitglied, wenn erlaubt – sonst `null` (Antwort ist bereits gesendet).
 */
export async function requireMemberPermission(
  interaction: Interaction | MessageComponentInteraction,
  keys: readonly Permission[],
): Promise<GuildMember | null> {
  const member = interaction.guild
    ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
    : null;
  if (member && (await memberCanAny(member, keys))) return member;
  if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
    await interaction
      .reply({
        content: `❌ ${permissionDeniedMessage(keys)}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => undefined);
  }
  return null;
}
