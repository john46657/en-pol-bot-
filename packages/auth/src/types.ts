/**
 * NEXUS Auth-Typen (§114).
 *
 * Der Auth-Layer (Discord OAuth2) authentifiziert einen User und stellt einen
 * Session-JWT aus. Authorisierung (welche NEXUS-Permissions hat der User durch
 * seine Rollen) ist Sache des PermissionGuard – nie des Frontends.
 */

/** Discord-User, wie er nach OAuth2 von /users/@me geliefert wird. */
export interface DiscordUser {
  id: string;
  username: string;
  /** Anzeigename (Global Name) – kann null sein. */
  globalName: string | null;
  avatar: string | null;
  email?: string | null;
}

/** Token-Set nach dem OAuth2 Code-Austausch. */
export interface DiscordTokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  /** Ablaufzeitpunkt als Unix-Sekunden. */
  expiresAt: number;
  scope: string;
}

/**
 * Session-JWT-Payload.
 *
 * `sub` ist die Discord-User-ID. Rollen werden absichtlich NICHT im JWT
 * gespeichert: Rollen ändern sich, und der Guard fordert sie serverseitig
 * autoritativ an (§114) – der JWT bleibt klein und revocable-by-relogin.
 */
export interface NexusSessionPayload {
  sub: string;
  username: string;
  globalName?: string;
  avatar?: string | null;
}
