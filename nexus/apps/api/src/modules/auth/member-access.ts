/**
 * Discord-seitige Verwaltungsrechte eines Users auf einem Server (serverseitig aus Bot-Daten berechnet).
 * Besitzer, Administratoren und „Server verwalten“ dürfen NEXUS immer konfigurieren – sonst könnte
 * auf einem frischen Server niemand die erste Rollen-Zuordnung anlegen.
 */
const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

export interface MemberAccess {
  isOwner: boolean;
  isAdmin: boolean;
  /** Owner, Administrator oder „Server verwalten“. */
  canManageGuild: boolean;
}

export function computeMemberAccess(input: {
  guildId: string;
  ownerId: string;
  userId: string;
  memberRoleIds: readonly string[];
  roles: readonly { id: string; permissions: string }[];
}): MemberAccess {
  const isOwner = input.ownerId !== '' && input.ownerId === input.userId;
  const byId = new Map(input.roles.map((r) => [r.id, BigInt(r.permissions)]));
  let bits = byId.get(input.guildId) ?? 0n; // @everyone
  for (const id of input.memberRoleIds) bits |= byId.get(id) ?? 0n;
  const isAdmin = (bits & ADMINISTRATOR) !== 0n;
  return { isOwner, isAdmin, canManageGuild: isOwner || isAdmin || (bits & MANAGE_GUILD) !== 0n };
}
