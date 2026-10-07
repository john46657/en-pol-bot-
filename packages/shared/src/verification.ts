/** Roblox-Verifizierung wie bei RoVer: Code ins Roblox-Profil → Bot prüft → Rollen und Nickname. */

/** Gruppen-Bindung: Rang in einer Roblox-Gruppe (von–bis, 1–255) → Discord-Rollen. */
export interface VerifyBind { id: string; groupId: string; minRank: number; maxRank: number; roleIds: string[] }
export interface VerifyPanel { channelId: string | null; title: string; message: string; color: string; buttonLabel: string }
export interface VerifyConfig {
  enabled: boolean;
  /** Bekommt jeder Verifizierte. */
  verifiedRoleIds: string[];
  /** Bekommt, wer (noch) nicht verifiziert ist – fällt nach der Verifizierung weg. */
  unverifiedRoleIds: string[];
  /** Nickname-Vorlage; leer = Nickname nicht ändern. */
  nickname: string;
  /** Beim Beitritt: Verifizierte bekommen sofort Rollen + Nickname, alle anderen die „nicht verifiziert“-Rollen. */
  autoOnJoin: boolean;
  logChannelId: string | null;
  panel: VerifyPanel;
  binds: VerifyBind[];
}

export const DEFAULT_VERIFY_CONFIG: VerifyConfig = {
  enabled: false, verifiedRoleIds: [], unverifiedRoleIds: [], nickname: '{roblox-name}', autoOnJoin: true, logChannelId: null,
  panel: { channelId: null, title: '✅ Roblox-Verifizierung', message: 'Verknüpfe dein Roblox-Konto mit Discord, um Zugriff auf den Server zu bekommen.\n\nKlick auf **Verifizieren**, gib deinen Roblox-Namen ein und folge den Schritten.', color: '#22c55e', buttonLabel: 'Verifizieren' },
  binds: [],
};

export interface VerifyNickVars { robloxName: string; displayName: string; discordName: string; robloxId: string }
export const VERIFY_NICK_VARS: Record<string, string> = {
  '{roblox-name}': 'Roblox-Benutzername', '{display-name}': 'Roblox-Anzeigename', '{discord-name}': 'Discord-Name', '{roblox-id}': 'Roblox-ID',
};
/** Nickname aus der Vorlage (Discord erlaubt höchstens 32 Zeichen). Leere Vorlage → null (nicht ändern). */
export function renderVerifyNickname(tpl: string, v: VerifyNickVars): string | null {
  if (!tpl.trim()) return null;
  const vars: Record<string, string> = { '{roblox-name}': v.robloxName, '{display-name}': v.displayName, '{discord-name}': v.discordName, '{roblox-id}': v.robloxId };
  const out = tpl.replace(/\{[a-z-]+\}/g, (k) => vars[k] ?? k).trim().slice(0, 32);
  return out || null;
}

/** Welche Bindungen passen zu den Gruppen-Rängen eines Roblox-Kontos? (Gruppen-ID → Rang) */
export function matchingBinds(binds: VerifyBind[], ranks: Record<string, number>): VerifyBind[] {
  return binds.filter((b) => { const r = ranks[b.groupId]; return r !== undefined && r >= b.minRank && r <= b.maxRank; });
}

/** Rollen und Nickname für ein Mitglied: verifiziert (mit Gruppen-Rängen) oder nicht. */
export function verifyActions(cfg: VerifyConfig, link: (VerifyNickVars & { ranks: Record<string, number> }) | null): { add: string[]; remove: string[]; nickname: string | null } {
  const bindRoles = [...new Set(cfg.binds.flatMap((b) => b.roleIds))];
  if (!link) return { add: [...new Set(cfg.unverifiedRoleIds)], remove: [...new Set([...cfg.verifiedRoleIds, ...bindRoles])].filter((r) => !cfg.unverifiedRoleIds.includes(r)), nickname: null };
  const add = [...new Set([...cfg.verifiedRoleIds, ...matchingBinds(cfg.binds, link.ranks).flatMap((b) => b.roleIds)])];
  const remove = [...new Set([...cfg.unverifiedRoleIds, ...bindRoles])].filter((r) => !add.includes(r));
  return { add, remove, nickname: renderVerifyNickname(cfg.nickname, link) };
}
