/**
 * Bot-Berechtigungen und Rollenhierarchie (reine Logik, ohne Discord-Aufrufe).
 * Discord-Regel: Der Bot darf nur Rollen verwalten, die in der Hierarchie UNTER seiner höchsten
 * Rolle liegen, und braucht dafür „Rollen verwalten“ (oder Administrator).
 */
export const PERM = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n,
  MANAGE_ROLES: 1n << 28n,
} as const;

export interface RoleLike {
  id: string;
  position: number;
  permissions: string;
  managed?: boolean;
}

export type BlockedReason = 'missing-manage-roles' | 'managed-role' | 'everyone' | 'hierarchy';

export interface BotAccess {
  /** Zusammengefasste Guild-Rechte des Bots (alle Bot-Rollen + @everyone). */
  permissions: bigint;
  administrator: boolean;
  topPosition: number;
}

export function computeBotAccess(
  guildId: string,
  roles: readonly RoleLike[],
  botRoleIds: readonly string[],
): BotAccess {
  const byId = new Map(roles.map((r) => [r.id, r]));
  let permissions = BigInt(byId.get(guildId)?.permissions ?? '0'); // @everyone gilt für alle
  let topPosition = 0;
  for (const id of botRoleIds) {
    const role = byId.get(id);
    if (!role) continue;
    permissions |= BigInt(role.permissions);
    topPosition = Math.max(topPosition, role.position);
  }
  const administrator = (permissions & PERM.ADMINISTRATOR) !== 0n;
  return { permissions, administrator, topPosition };
}

export const has = (access: BotAccess, flag: bigint): boolean =>
  access.administrator || (access.permissions & flag) === flag;

export function checkRoleManageable(
  guildId: string,
  role: RoleLike,
  access: BotAccess,
): { manageable: boolean; blockedReason?: BlockedReason } {
  if (!has(access, PERM.MANAGE_ROLES))
    return { manageable: false, blockedReason: 'missing-manage-roles' };
  if (role.id === guildId) return { manageable: false, blockedReason: 'everyone' };
  if (role.managed) return { manageable: false, blockedReason: 'managed-role' };
  if (role.position >= access.topPosition) return { manageable: false, blockedReason: 'hierarchy' };
  return { manageable: true };
}

export const REQUIRED_BOT_PERMISSIONS: readonly { key: string; label: string; flag: bigint }[] = [
  { key: 'ViewChannel', label: 'Kanäle ansehen', flag: PERM.VIEW_CHANNEL },
  { key: 'SendMessages', label: 'Nachrichten senden', flag: PERM.SEND_MESSAGES },
  { key: 'EmbedLinks', label: 'Links einbetten', flag: PERM.EMBED_LINKS },
  { key: 'ManageRoles', label: 'Rollen verwalten', flag: PERM.MANAGE_ROLES },
];

export function checkBotPermissions(access: BotAccess) {
  return REQUIRED_BOT_PERMISSIONS.map((p) => ({
    key: p.key,
    label: p.label,
    ok: has(access, p.flag),
  }));
}

export type ChannelKind = 'text' | 'voice' | 'category' | 'other';

export function channelKind(type: number): ChannelKind {
  if (type === 0 || type === 5) return 'text';
  if (type === 2 || type === 13) return 'voice';
  if (type === 4) return 'category';
  return 'other';
}
