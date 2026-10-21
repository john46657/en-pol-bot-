import { ACCESS_LEVELS, LEVEL_LABEL, type AccessLevel, type GuildConfig } from './guild-config';
import type { Reply } from './format';

/**
 * Zentrales Stufen-Rechtesystem des Bots: Serveradministrator > Polizeiführung > Ausbilder > Beamter > Nur lesend.
 * Geprüft wird immer gegen die TATSÄCHLICHEN Discord-Rollen, frisch von Discord geladen (nicht aus der Nachricht).
 * Zusätzlich gelten bei allen Aufrufen ins System weiterhin die Rechte der API (verknüpftes Konto).
 */
export const RANK: Record<AccessLevel | 'none', number> = { admin: 5, leadership: 4, instructor: 3, officer: 2, readonly: 1, none: 0 };

/** Was Discord über ein Mitglied sagt (vom Bot frisch geladen). */
export interface MemberAccess { userId: string; roleIds: string[]; isOwner: boolean; administrator: boolean; manageGuild: boolean }

/** Ist das Stufen-System auf dem Server eingerichtet (mind. eine Rolle zugeordnet)? */
export const levelsConfigured = (cfg: GuildConfig) => ACCESS_LEVELS.some((l) => cfg.roles[l].length > 0);

/** Höchste Stufe des Mitglieds. Inhaber, „Administrator“ und „Server verwalten“ sind immer Serveradministrator. */
export function levelOf(m: MemberAccess, cfg: GuildConfig): AccessLevel | 'none' {
  if (m.isOwner || m.administrator || m.manageGuild) return 'admin';
  for (const l of ACCESS_LEVELS) if (cfg.roles[l].some((r) => m.roleIds.includes(r))) return l;
  return 'none';
}

/** Reicht die Stufe? Solange keine Rollen zugeordnet sind, gelten nur die Verwaltungsstufen (Admin/Führung/Ausbilder → Discord-Admin). */
export function allowed(m: MemberAccess, cfg: GuildConfig, need: AccessLevel): boolean {
  const have = levelOf(m, cfg);
  if (RANK[have] >= RANK[need]) return true;
  // noch nicht eingerichtet: Beamte/Lesende nicht aussperren (die API prüft ohnehin jedes Recht)
  return !levelsConfigured(cfg) && RANK[need] <= RANK.officer;
}

/**
 * Richtlinien: Befehl (`name` oder `name sub`) bzw. Interaktion (`prefix:aktion`) → Mindeststufe.
 * `sensitive`: vor der Ausführung ausdrücklich bestätigen lassen und dabei erneut prüfen.
 */
export interface Policy { level: AccessLevel; sensitive?: boolean }
export const POLICIES: Record<string, Policy> = {
  setup: { level: 'admin' },
  'setup:*': { level: 'admin' },
  'system status': { level: 'leadership' },
  'system diagnose': { level: 'admin' },
  'system integrations': { level: 'admin' },
  'sys:*': { level: 'admin' },
  backup: { level: 'admin' },
  'bak:*': { level: 'admin' },
  'bak:confirm': { level: 'admin', sensitive: true },
  'bak:apply': { level: 'admin', sensitive: true },
  'pruefung liste': { level: 'readonly' },
  'pruefung ergebnisse': { level: 'readonly' },
  'pruefung ausbildungen': { level: 'readonly' },
  'pruefung verwalten': { level: 'instructor' },
  'pruefung bewerten': { level: 'instructor' },
  'exam:open': { level: 'readonly' },
  'exam:*': { level: 'officer' },
  'exam:adm': { level: 'instructor' }, 'exam:admv': { level: 'instructor' }, 'exam:res': { level: 'instructor' }, 'exam:post': { level: 'instructor' },
  'exam:toggle': { level: 'instructor' }, 'exam:togglec': { level: 'instructor', sensitive: true },
  'exam:g': { level: 'instructor' }, 'exam:gin': { level: 'instructor' }, 'exam:gm': { level: 'instructor' },
  'exam:void': { level: 'instructor' }, 'exam:vm': { level: 'instructor', sensitive: true },
  'exam:pend': { level: 'instructor' },
};

/** Richtlinie für einen Befehl/eine Interaktion (genau → Wildcard `prefix:*`). */
export function policyFor(key: string): Policy | undefined {
  if (POLICIES[key]) return POLICIES[key];
  const [name] = key.split(/[ :]/);
  if (key.includes(':')) return POLICIES[`${name}:*`];
  return POLICIES[name!];
}

/** Hilfsdaten, die eine Prüfung braucht (in index.ts aus Discord, in Tests ein Fake). */
export interface AccessDeps { member(guildId: string, userId: string): Promise<MemberAccess | null>; config(guildId: string): Promise<GuildConfig> }

const deny = (text: string): Reply => ({ content: `⛔ ${text}`, ephemeral: true });

/** Prüft eine Richtlinie für den Aufrufer; liefert `null` (erlaubt) oder eine verständliche, private Ablehnung. */
export async function authorize(deps: AccessDeps | undefined, a: { guildId?: string; userId: string }, key: string): Promise<Reply | null> {
  const p = policyFor(key);
  if (!p) return null;
  if (!a.guildId) return deny('Das geht nur auf einem Discord-Server, nicht per Direktnachricht.');
  if (!deps) return deny('Die Rechteprüfung ist gerade nicht verfügbar – Aktion aus Sicherheitsgründen abgelehnt.');
  let member: MemberAccess | null; let cfg: GuildConfig;
  try { [member, cfg] = await Promise.all([deps.member(a.guildId, a.userId), deps.config(a.guildId)]); } catch {
    return deny('Deine Rollen konnten gerade nicht geprüft werden – Aktion aus Sicherheitsgründen abgelehnt. Bitte gleich noch einmal versuchen.');
  }
  if (!member) return deny('Du bist auf diesem Server nicht (mehr) Mitglied.');
  if (allowed(member, cfg, p.level)) return null;
  const have = levelOf(member, cfg);
  return deny(`Dafür brauchst du mindestens die Stufe **${LEVEL_LABEL[p.level]}**. Deine Stufe: **${have === 'none' ? 'keine' : LEVEL_LABEL[have]}**.\nDie Stufen ordnet ein Serveradministrator unter \`/setup\` → **Rollen** Discord-Rollen zu.`);
}

/** Kurzform für Befehle/Interaktionen: Prüfung mit den Laufzeit-Daten aus dem Kontext. */
export const guard = (c: { runtime?: { access: AccessDeps }; guildId?: string; discordId: string }, key: string) => authorize(c.runtime?.access, { guildId: c.guildId, userId: c.discordId }, key);
