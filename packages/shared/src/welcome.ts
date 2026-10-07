/** Willkommens- und Abschiedsnachrichten (je Discord-Server einstellbar, Admin → Welcome & Goodbye). */
export interface WelcomeMessageDef { enabled: boolean; channelId: string | null; title: string; message: string; color: string; showAvatar: boolean; pingUser: boolean }
export interface WelcomeConfig {
  welcome: WelcomeMessageDef;
  /** Direktnachricht an neue Mitglieder. */
  dm: { enabled: boolean; message: string };
  /** Rollen, die neue Mitglieder automatisch bekommen (Bots ausgenommen). */
  autoRoleIds: string[];
  goodbye: WelcomeMessageDef;
}

export const DEFAULT_WELCOME_CONFIG: WelcomeConfig = {
  welcome: {
    enabled: false, channelId: null, title: '👋 Willkommen auf {server}!', color: '#3b82f6', showAvatar: true, pingUser: true,
    message: 'Hey {user}, schön, dass du da bist! Du bist Mitglied **#{memberCount}**.\n\nLies dir bitte die Regeln durch. Bewerben kannst du dich jederzeit über das Bewerbungs-Panel.',
  },
  dm: { enabled: false, message: 'Willkommen auf **{server}**, {username}! Bei Fragen öffne einfach ein Support-Ticket.' },
  autoRoleIds: [],
  goodbye: { enabled: false, channelId: null, title: 'Auf Wiedersehen', color: '#64748b', showAvatar: true, pingUser: false, message: '**{username}** hat den Server verlassen. Wir sind jetzt {memberCount} Mitglieder.' },
};

/** Platzhalter für Titel und Texte (Anzeige im Dashboard). */
export const WELCOME_VARIABLES = {
  '{user}': 'Erwähnung des Mitglieds (@Name)',
  '{username}': 'Benutzername',
  '{displayName}': 'Anzeigename auf dem Server',
  '{server}': 'Name des Servers',
  '{memberCount}': 'Anzahl Mitglieder (nach Beitritt/Austritt)',
  '{accountAge}': 'Alter des Discord-Kontos (z. B. „3 Tage“)',
} as const;

export interface WelcomeMember { id: string; username: string; displayName: string; server: string; memberCount: number; createdAt?: Date | string | null }

/** Alter des Discord-Kontos lesbar („heute“, „5 Tage“, „2 Jahre“). */
export function accountAge(created: Date | string | null | undefined, now = Date.now()): string {
  const t = created ? new Date(created).getTime() : NaN;
  if (!Number.isFinite(t)) return '—';
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  if (days === 0) return 'heute erstellt';
  if (days < 60) return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  if (days < 730) return `${Math.floor(days / 30)} Monate`;
  return `${Math.floor(days / 365)} Jahre`;
}

/** Platzhalter ersetzen; unbekannte bleiben stehen. */
export function renderWelcomeText(text: string, m: WelcomeMember, now = Date.now()): string {
  const vars: Record<string, string> = {
    '{user}': `<@${m.id}>`, '{username}': m.username, '{displayName}': m.displayName, '{server}': m.server,
    '{memberCount}': String(m.memberCount), '{accountAge}': accountAge(m.createdAt, now),
  };
  return text.replace(/\{[a-zA-Z]+\}/g, (k) => vars[k] ?? k);
}

/** Farbe „#rrggbb“ → Zahl für Discord-Embeds. */
export const hexColor = (c: string, fallback = 0x3b82f6) => (/^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : fallback);
