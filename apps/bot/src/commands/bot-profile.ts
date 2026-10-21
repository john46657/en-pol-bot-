import { guard } from '../access';
import { COLORS, errorReply, okReply, plain, type Reply } from '../format';
import { redact } from '../safety';
import type { CommandDef, Ctx } from './types';

/**
 * /botprofil – Name, Profilbild und Status des Bots direkt in Discord anpassen.
 *
 * Was Discord dabei erlaubt (geprüft gegen discord.js 14.27 / Discord-API):
 *  - Name und Profilbild gibt es je Server („Modify Current Member“: `nick`, `avatar`) und global für den Bot-Account
 *    (`PATCH /users/@me`). Je Server reicht ein Serveradministrator; global wirkt auf ALLE Server und ist deshalb nur dem
 *    Bot-Inhaber (Inhaber/Team der Discord-Anwendung) erlaubt. Discord begrenzt globale Änderungen stark (wenige pro Stunde).
 *  - Status und Aktivität (Presence) gibt es nur global – Discord kennt keinen Status je Server. Discord speichert ihn nicht;
 *    der Bot merkt ihn sich und setzt ihn nach jedem (Neu-)Start und jeder neuen Verbindung wieder.
 */

/** Discord-Grenzen. */
export const NICK_MAX = 32;
export const USERNAME_MIN = 2, USERNAME_MAX = 32;
export const ACTIVITY_MAX = 128;
/** Profilbild: von Discord dokumentierte Bildformate; Größe mit Puffer für die Base64-Übertragung. */
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
/** Mindestabstand zwischen zwei Status-Änderungen (Discord begrenzt Presence-Updates je Verbindung). */
export const STATUS_COOLDOWN_MS = 20_000;

export type Scope = 'server' | 'global';
export const STATUSES = { online: 'Online', idle: 'Abwesend', dnd: 'Bitte nicht stören', invisible: 'Unsichtbar' } as const;
export type PresenceStatus = keyof typeof STATUSES;
/** Aktivitätsarten, die Bots setzen dürfen (Discord ActivityType). */
export const ACTIVITIES = { keine: -1, spielt: 0, streamt: 1, hoert: 2, schaut: 3, benutzerdefiniert: 4, wettkampf: 5 } as const;
export type ActivityKind = keyof typeof ACTIVITIES;
const ACTIVITY_LABEL: Record<ActivityKind, string> = { keine: 'keine Aktivität', spielt: 'Spielt', streamt: 'Streamt', hoert: 'Hört', schaut: 'Schaut', benutzerdefiniert: 'Benutzerdefiniert', wettkampf: 'Tritt an in' };

/** Gespeicherter Status (wird nach Neustart/Neuverbindung wieder gesetzt). */
export interface SavedPresence { status: PresenceStatus; activity: ActivityKind; text: string | null; url: string | null }
export const DEFAULT_PRESENCE: SavedPresence = { status: 'online', activity: 'keine', text: null, url: null };

export interface ImageFile { url: string; name: string; contentType: string | null; size: number }

/** Discord-Aktionen (echte Umsetzung in index.ts, in Tests ein Fake). Fehler werden als Discord-Fehler weitergereicht. */
export interface BotProfileActions {
  /** Ist der Aufrufer Inhaber bzw. Team-Mitglied der Discord-Anwendung? */
  isBotOwner(userId: string): Promise<boolean>;
  /** Darf der Bot auf dem Server seinen Nickname ändern („Nickname ändern“)? */
  canChangeNickname(guildId: string): Promise<boolean>;
  setServerNick(guildId: string, nick: string | null): Promise<void>;
  setGlobalName(name: string): Promise<void>;
  /** Bild laden (höchstens `maxBytes`, sonst Fehler) */
  download(url: string, maxBytes: number): Promise<Buffer>;
  setServerAvatar(guildId: string, image: Buffer | null): Promise<void>;
  setGlobalAvatar(image: Buffer | null): Promise<void>;
  setPresence(p: SavedPresence): Promise<void>;
  loadPresence(): Promise<SavedPresence | null>;
  savePresence(p: SavedPresence): Promise<void>;
}

// ───────────── Prüfungen ─────────────

/** Nickname je Server: 1–32 Zeichen; leer = zurücksetzen. */
export function checkNick(raw: string): { nick?: string | null; error?: string } {
  const nick = raw.trim();
  if (!nick) return { nick: null };
  if (nick.length > NICK_MAX) return { error: `Der Name ist zu lang (höchstens ${NICK_MAX} Zeichen).` };
  return { nick };
}

/** Globaler Benutzername nach den Discord-Regeln für Namen. */
export function checkUsername(raw: string): { name?: string; error?: string } {
  const name = raw.trim();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) return { error: `Der globale Name muss ${USERNAME_MIN}–${USERNAME_MAX} Zeichen lang sein.` };
  if (/[@#:]|```/.test(name)) return { error: 'Der globale Name darf kein @, #, : oder ``` enthalten.' };
  if (/discord|clyde/i.test(name)) return { error: 'Discord erlaubt „discord“ und „clyde“ nicht im Namen.' };
  if (/^(everyone|here)$/i.test(name)) return { error: '„everyone“ und „here“ sind als Name nicht erlaubt.' };
  return { name };
}

/** Echter Bildtyp aus den ersten Bytes (Dateiendung/Angabe zählen nicht). */
export function imageType(b: Buffer): 'png' | 'jpeg' | 'gif' | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1'))) return 'gif';
  return null;
}

/** Vorprüfung des Anhangs (vor dem Herunterladen). */
export function checkAttachment(f: ImageFile | undefined): string | null {
  if (!f) return 'Bitte ein Bild anhängen oder „zuruecksetzen“ wählen.';
  if (f.size > AVATAR_MAX_BYTES) return `Das Bild ist zu groß (höchstens ${AVATAR_MAX_BYTES / 1024 / 1024} MB).`;
  if (f.contentType && !/^image\/(png|jpeg|gif)$/i.test(f.contentType.split(';')[0]!.trim())) return 'Erlaubt sind nur PNG, JPG und GIF.';
  return null;
}

/** Status-Eingaben prüfen. */
export function checkPresence(o: { status?: string; activity?: string; text?: string; url?: string }): { presence?: SavedPresence; error?: string } {
  const status = (o.status || 'online') as PresenceStatus;
  const activity = (o.activity || (o.text?.trim() ? 'benutzerdefiniert' : 'keine')) as ActivityKind;
  if (!(status in STATUSES)) return { error: 'Unbekannter Status.' };
  if (!(activity in ACTIVITIES)) return { error: 'Unbekannte Aktivitätsart.' };
  const text = o.text?.trim() || null;
  if (activity !== 'keine' && !text) return { error: 'Für eine Aktivität bitte einen Text angeben.' };
  if (text && text.length > ACTIVITY_MAX) return { error: `Der Aktivitätstext ist zu lang (höchstens ${ACTIVITY_MAX} Zeichen).` };
  const url = o.url?.trim() || null;
  if (activity === 'streamt' && !(url && /^https:\/\/(www\.)?(twitch\.tv|youtube\.com)\/\S+$/i.test(url))) return { error: 'Für „Streamt“ verlangt Discord einen Twitch- oder YouTube-Link (https://twitch.tv/… oder https://youtube.com/…).' };
  if (url && activity !== 'streamt') return { error: 'Ein Link ist nur bei „Streamt“ möglich.' };
  return { presence: { status, activity, text: activity === 'keine' ? null : text, url } };
}

/** Status in die Form von discord.js (`client.user.setPresence`). */
export function toPresenceData(p: SavedPresence): { status: PresenceStatus; activities: { name: string; type: number; state?: string; url?: string }[] } {
  if (p.activity === 'keine' || !p.text) return { status: p.status, activities: [] };
  const type = ACTIVITIES[p.activity];
  // Benutzerdefiniert: Discord zeigt `state`; `name` muss trotzdem gesetzt sein
  if (p.activity === 'benutzerdefiniert') return { status: p.status, activities: [{ name: 'Custom Status', type, state: p.text }] };
  return { status: p.status, activities: [{ name: p.text, type, ...(p.url ? { url: p.url } : {}) }] };
}

export const presenceText = (p: SavedPresence) => `${STATUSES[p.status]}${p.activity !== 'keine' && p.text ? ` · ${ACTIVITY_LABEL[p.activity]}${p.activity === 'benutzerdefiniert' ? ':' : ''} ${plain(p.text)}` : ''}`;

/** Fehler von Discord in verständliche Sätze (keine Stacktraces, keine Geheimnisse). */
export function discordErrorText(e: unknown, what: string): string {
  const x = e as { status?: number; code?: number | string; message?: string; rawError?: { errors?: unknown } } | null;
  const raw = JSON.stringify(x?.rawError?.errors ?? '') + (x?.message ?? '');
  if (x?.status === 429 || /RATE_LIMIT|too fast|zu schnell/i.test(raw)) return `Discord lässt ${what} gerade nicht zu: zu viele Änderungen in kurzer Zeit (Discord erlaubt nur wenige pro Stunde). Bitte später erneut versuchen.`;
  if (x?.code === 50013) return `Dem Bot fehlt auf diesem Server die nötige Berechtigung für ${what}.`;
  if (x?.code === 50001) return `Der Bot hat keinen Zugriff für ${what}.`;
  if (x?.code === 50035) return `Discord hat ${what} abgelehnt (ungültiger Wert${/USERNAME_TOO_MANY_USERS/.test(raw) ? ': dieser Name wird schon zu oft verwendet' : /BINARY_TYPE_MAX_SIZE|too large/i.test(raw) ? ': Bild zu groß' : /IMAGE|AVATAR/i.test(raw) ? ': Bild wird nicht akzeptiert' : ''}).`;
  if (x?.code === 'TOO_LARGE') return 'Das Bild ist zu groß.';
  if (typeof x?.status === 'number' && x.status >= 500) return `Discord ist gerade gestört – ${what} hat nicht geklappt. Bitte später erneut versuchen.`;
  return `${what[0]!.toUpperCase()}${what.slice(1)} hat nicht geklappt${x?.message ? `: ${redact(String(x.message)).slice(0, 200)}` : '.'}`;
}

// ───────────── Befehl ─────────────

let lastStatusChange = 0;
export const _resetStatusCooldown = () => { lastStatusChange = 0; };

async function scopeAllowed(c: Ctx, scope: Scope, p: BotProfileActions): Promise<Reply | null> {
  if (scope === 'global' && !(await p.isBotOwner(c.discordId).catch(() => false))) return errorReply('Globale Änderungen wirken auf **alle** Server des Bots und sind deshalb nur dem Bot-Inhaber (Inhaber bzw. Team der Discord-Anwendung) erlaubt. Für diesen Server: `bereich: server`.');
  return null;
}

async function setName(c: Ctx, p: BotProfileActions, scope: Scope): Promise<Reply> {
  const input = String(c.opts.name ?? '');
  if (scope === 'server') {
    const r = checkNick(input);
    if (r.error) return errorReply(r.error);
    if (!(await p.canChangeNickname(c.guildId!).catch(() => false))) return errorReply('Dem Bot fehlt auf diesem Server das Recht „Nickname ändern“. Servereinstellungen → Rollen → Bot-Rolle → „Nickname ändern“ aktivieren.');
    try { await p.setServerNick(c.guildId!, r.nick ?? null); } catch (e) { return errorReply(discordErrorText(e, 'die Namensänderung')); }
    return okReply(r.nick ? `Der Bot heißt auf diesem Server jetzt **${plain(r.nick)}**.` : 'Der Name des Bots auf diesem Server wurde zurückgesetzt (globaler Name).');
  }
  const r = checkUsername(input);
  if (r.error) return errorReply(r.error);
  try { await p.setGlobalName(r.name!); } catch (e) { return errorReply(discordErrorText(e, 'die Namensänderung')); }
  return okReply(`Der globale Name des Bots ist jetzt **${plain(r.name)}** (gilt auf allen Servern, außer wo ein eigener Server-Name gesetzt ist).`);
}

async function setAvatar(c: Ctx, p: BotProfileActions, scope: Scope): Promise<Reply> {
  const reset = c.opts.zuruecksetzen === true;
  const file = c.attachments?.bild;
  let image: Buffer | null = null;
  if (!reset) {
    const pre = checkAttachment(file);
    if (pre) return errorReply(pre);
    try { image = await p.download(file!.url, AVATAR_MAX_BYTES); } catch (e) { return errorReply((e as { code?: string })?.code === 'TOO_LARGE' ? `Das Bild ist zu groß (höchstens ${AVATAR_MAX_BYTES / 1024 / 1024} MB).` : 'Das Bild konnte nicht geladen werden. Bitte erneut anhängen.'); }
    if (image.length > AVATAR_MAX_BYTES) return errorReply(`Das Bild ist zu groß (höchstens ${AVATAR_MAX_BYTES / 1024 / 1024} MB).`);
    if (!imageType(image)) return errorReply('Die Datei ist kein PNG-, JPG- oder GIF-Bild (geprüft wird der Inhalt, nicht die Endung).');
  }
  try {
    if (scope === 'server') await p.setServerAvatar(c.guildId!, image);
    else await p.setGlobalAvatar(image);
  } catch (e) { return errorReply(discordErrorText(e, 'die Änderung des Profilbilds')); }
  if (scope === 'server') return okReply(image ? 'Das Profilbild des Bots auf diesem Server wurde geändert.' : 'Das Profilbild des Bots auf diesem Server wurde zurückgesetzt (globales Profilbild).');
  return okReply(image ? 'Das globale Profilbild des Bots wurde geändert (gilt auf allen Servern ohne eigenes Server-Profilbild).' : 'Das globale Profilbild des Bots wurde entfernt (Discord-Standardbild).');
}

async function setStatus(c: Ctx, p: BotProfileActions): Promise<Reply> {
  if (!(await p.isBotOwner(c.discordId).catch(() => false))) return errorReply('Der Status des Bots gilt bei Discord immer für **alle** Server (einen Status je Server gibt es nicht). Ändern darf ihn deshalb nur der Bot-Inhaber (Inhaber bzw. Team der Discord-Anwendung).');
  const r = checkPresence({ status: c.opts.status as string | undefined, activity: c.opts.art as string | undefined, text: c.opts.text as string | undefined, url: c.opts.link as string | undefined });
  if (r.error) return errorReply(r.error);
  const wait = lastStatusChange + STATUS_COOLDOWN_MS - Date.now();
  if (wait > 0) return errorReply(`Bitte ${Math.ceil(wait / 1000)} Sekunden warten – Discord begrenzt, wie oft der Status geändert werden darf.`);
  try { await p.setPresence(r.presence!); } catch (e) { return errorReply(discordErrorText(e, 'die Statusänderung')); }
  lastStatusChange = Date.now();
  const saved = await p.savePresence(r.presence!).then(() => true, () => false);
  return { ephemeral: true, embeds: [{ title: '✅ Status geändert', description: `${presenceText(r.presence!)}${saved ? '' : '\n\n⚠️ Konnte nicht gespeichert werden (System nicht erreichbar?) – nach einem Neustart gilt wieder der vorherige Status.'}`, color: COLORS.success }] };
}

export const BOT_PROFILE_COMMANDS: CommandDef[] = [{
  name: 'botprofil', description: 'Name, Profilbild und Status des Bots anpassen',
  subcommands: [
    { name: 'name', description: 'Bot-Namen ändern (leer lassen = Server-Name zurücksetzen)', options: [
      { name: 'name', description: 'Neuer Name (Server: bis 32 Zeichen, leer = zurücksetzen)', type: 'string', maxLength: USERNAME_MAX },
      { name: 'bereich', description: 'Nur dieser Server (Standard) oder global für alle Server (nur Bot-Inhaber)', type: 'string', choices: [{ name: 'dieser Server', value: 'server' }, { name: 'global (alle Server)', value: 'global' }] },
    ] },
    { name: 'avatar', description: 'Profilbild des Bots ändern (PNG, JPG oder GIF)', options: [
      { name: 'bild', description: 'Neues Profilbild (PNG, JPG oder GIF, bis 8 MB)', type: 'attachment' },
      { name: 'bereich', description: 'Nur dieser Server (Standard) oder global für alle Server (nur Bot-Inhaber)', type: 'string', choices: [{ name: 'dieser Server', value: 'server' }, { name: 'global (alle Server)', value: 'global' }] },
      { name: 'zuruecksetzen', description: 'Profilbild zurücksetzen statt ein neues zu setzen', type: 'boolean' },
    ] },
    { name: 'status', description: 'Status und Aktivitätstext des Bots (gilt auf allen Servern, nur Bot-Inhaber)', options: [
      { name: 'status', description: 'Online-Status', type: 'string', choices: (Object.keys(STATUSES) as PresenceStatus[]).map((k) => ({ name: STATUSES[k], value: k })) },
      { name: 'art', description: 'Art der Aktivität (Standard: benutzerdefiniert, wenn ein Text angegeben ist)', type: 'string', choices: (Object.keys(ACTIVITIES) as ActivityKind[]).map((k) => ({ name: ACTIVITY_LABEL[k], value: k })) },
      { name: 'text', description: `Aktivitätstext (bis ${ACTIVITY_MAX} Zeichen)`, type: 'string', maxLength: ACTIVITY_MAX },
      { name: 'link', description: 'Nur bei „Streamt“: Twitch- oder YouTube-Link', type: 'string', maxLength: 200 },
    ] },
  ],
  async run(c) {
    const sub = String(c.opts._sub ?? '');
    const denied = await guard(c, `botprofil ${sub}`); if (denied) return denied;
    const p = c.botProfile;
    if (!p || !c.guildId) return errorReply('Das geht nur auf einem Discord-Server.');
    const scope: Scope = c.opts.bereich === 'global' ? 'global' : 'server';
    const blocked = await scopeAllowed(c, scope, p); if (blocked) return blocked;
    if (sub === 'name') return setName(c, p, scope);
    if (sub === 'avatar') return setAvatar(c, p, scope);
    if (sub === 'status') return setStatus(c, p);
    return errorReply('Unbekannter Unterbefehl.');
  },
}];

/** Gespeicherten Status setzen (nach dem Start und nach jeder neuen Verbindung). */
export async function restorePresence(p: Pick<BotProfileActions, 'loadPresence' | 'setPresence'>, log: (m: string) => void = console.error): Promise<SavedPresence | null> {
  const saved = await p.loadPresence().catch((e) => { log(`bot status not loaded: ${e instanceof Error ? e.message : e}`); return null; });
  if (!saved) return null;
  const ok = checkPresence({ status: saved.status, activity: saved.activity, text: saved.text ?? undefined, url: saved.url ?? undefined });
  if (!ok.presence) { log('saved bot status is invalid – ignored'); return null; }
  await p.setPresence(ok.presence).catch((e) => log(`bot status not set: ${e instanceof Error ? e.message : e}`));
  return ok.presence;
}
