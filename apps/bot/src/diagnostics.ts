import { PermissionFlagsBits } from 'discord.js';
import { ACCESS_LEVELS, CHANNEL_LABEL, LEVEL_LABEL, SETUP_CHANNELS, type GuildConfig } from './guild-config';
import { levelsConfigured } from './access';
import type { DiscordConfig } from './platform';

/** Was der Bot über einen Server weiß (in index.ts aus discord.js, in Tests von Hand gebaut). */
export interface GuildSnapshot {
  id: string; name: string;
  /** Rechte des Bots auf Server-Ebene */
  botPermissions: bigint;
  botTopRolePosition: number;
  channels: { id: string; name: string; kind: 'text' | 'voice' | 'category' | 'other'; perms: bigint }[];
  roles: { id: string; name: string; position: number; managed: boolean }[];
}
export interface RuntimeStatus { ready: boolean; wsPing: number; uptimeSec: number; guilds: number; intents: { content: boolean; members: boolean; presences: boolean } }
export type Severity = 'ok' | 'info' | 'warn' | 'error';
export interface Finding { severity: Severity; area: string; text: string; fix?: string }

const P = PermissionFlagsBits;
/** Server-Rechte, die der Bot braucht – mit der Funktion, die ohne sie nicht geht. */
export const REQUIRED_PERMISSIONS: { flag: bigint; name: string; needed: string; severity: Severity }[] = [
  { flag: P.ViewChannel, name: 'Kanäle ansehen', needed: 'alle Funktionen', severity: 'error' },
  { flag: P.SendMessages, name: 'Nachrichten senden', needed: 'alle Meldungen und Panels', severity: 'error' },
  { flag: P.EmbedLinks, name: 'Links einbetten', needed: 'Embeds (fast alle Bot-Nachrichten)', severity: 'error' },
  { flag: P.ReadMessageHistory, name: 'Nachrichtenverlauf lesen', needed: 'Panels aktualisieren, Ticket-Verläufe', severity: 'warn' },
  { flag: P.ManageRoles, name: 'Rollen verwalten', needed: 'Dienst-, Verifizierungs- und Begrüßungsrollen', severity: 'warn' },
  { flag: P.ManageChannels, name: 'Kanäle verwalten', needed: 'Support-Tickets, Sprach-Support', severity: 'warn' },
  { flag: P.ManageNicknames, name: 'Spitznamen verwalten', needed: 'Dienstnummer/Roblox-Name im Nickname', severity: 'warn' },
  { flag: P.ChangeNickname, name: 'Nickname ändern', needed: 'Anzeigename des Bots aus /setup', severity: 'info' },
  { flag: P.MoveMembers, name: 'Mitglieder verschieben', needed: 'Sprach-Support', severity: 'info' },
  { flag: P.CreatePublicThreads, name: 'Öffentliche Threads erstellen', needed: 'Staff-Threads zu Bewerbungen/Ausbildungen', severity: 'info' },
];
const CHANNEL_NEEDS: { flag: bigint; name: string }[] = [{ flag: P.ViewChannel, name: 'Kanal ansehen' }, { flag: P.SendMessages, name: 'Nachrichten senden' }, { flag: P.EmbedLinks, name: 'Links einbetten' }];

/** Kanäle aus den System-Einstellungen (Dashboard) mit verständlichem Namen. */
const SYSTEM_CHANNELS: Partial<Record<keyof DiscordConfig, string>> = { dispatch: 'Leitstelle', wanted: 'Fahndungen', applications: 'Bewerbungen', danger: 'Gefahrenstatus', sek: 'SEK', qualifications: 'Qualifikationen', duty: 'Dienst', teamlist: 'Teamliste', tickets: 'Support-Tickets', announcements: 'Ankündigungen' };
/** Rollen, die der Bot selbst vergibt – müssen unter der Bot-Rolle stehen. */
const ASSIGNED_ROLES: Partial<Record<keyof DiscordConfig, string>> = { dutyRole: 'Im Dienst', breakRole: 'Pause', radioRole: 'Funk', sekRole: 'SEK', trainingRole: 'Ausbildung', adminDutyRole: 'Admin-Dienst' };

const has = (perms: bigint, flag: bigint) => (perms & P.Administrator) === P.Administrator || (perms & flag) === flag;

/** Alle Prüfungen eines Servers; Ergebnis nach Schwere sortiert (Fehler zuerst). */
export function diagnoseGuild(g: GuildSnapshot, cfg: GuildConfig, sys: DiscordConfig | null, rt: RuntimeStatus): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);

  if (!rt.ready) add({ severity: 'error', area: 'Discord', text: 'Der Bot ist nicht mit Discord verbunden.', fix: 'Bot-Prozess und Netzwerk prüfen; Token im Developer Portal gültig?' });
  else if (rt.wsPing > 1000) add({ severity: 'warn', area: 'Discord', text: `Hohe Verzögerung zu Discord (${rt.wsPing} ms).`, fix: 'Meist vorübergehend; bleibt es so, Hosting-Standort/Netzwerk prüfen.' });

  const missing = REQUIRED_PERMISSIONS.filter((r) => !has(g.botPermissions, r.flag));
  for (const r of missing) add({ severity: r.severity, area: 'Bot-Rechte', text: `Dem Bot fehlt das Server-Recht „${r.name}“ – betroffen: ${r.needed}.`, fix: 'Servereinstellungen → Rollen → Bot-Rolle → Recht aktivieren (oder den Bot mit dem Einladungslink aus dem Log neu einladen).' });
  if (!missing.length) add({ severity: 'ok', area: 'Bot-Rechte', text: 'Alle benötigten Server-Rechte sind vorhanden.' });

  const channel = (id: string, label: string) => {
    const c = g.channels.find((x) => x.id === id);
    if (!c) { add({ severity: 'error', area: 'Kanäle', text: `Kanal „${label}“ ist eingestellt, existiert aber nicht mehr.`, fix: 'Kanal neu auswählen.' }); return; }
    const lack = CHANNEL_NEEDS.filter((n) => !has(c.perms, n.flag)).map((n) => n.name);
    if (lack.length) add({ severity: 'error', area: 'Kanäle', text: `Im Kanal #${c.name} („${label}“) fehlt dem Bot: ${lack.join(', ')}.`, fix: `Kanal-Einstellungen von #${c.name} → Berechtigungen → Bot-Rolle erlauben.` });
  };
  const unset: string[] = [];
  for (const k of SETUP_CHANNELS) { const id = cfg.channels[k]; if (id) channel(id, CHANNEL_LABEL[k]); else unset.push(CHANNEL_LABEL[k]); }
  if (sys) for (const [k, label] of Object.entries(SYSTEM_CHANNELS)) { const id = sys[k as keyof DiscordConfig]; if (id && g.channels.some((c) => c.id === id)) channel(id, label!); }
  if (unset.length) add({ severity: 'info', area: 'Kanäle', text: `Nicht konfiguriert: ${unset.join(', ')}.`, fix: '`/setup` → Kanäle.' });

  const roleIds = new Set(g.roles.map((r) => r.id));
  for (const l of ACCESS_LEVELS) for (const id of cfg.roles[l]) if (!roleIds.has(id)) add({ severity: 'warn', area: 'Rollen', text: `Eine Rolle der Stufe „${LEVEL_LABEL[l]}“ existiert nicht mehr.`, fix: '`/setup` → Rollen neu zuordnen.' });
  if (!levelsConfigured(cfg)) add({ severity: 'info', area: 'Rollen', text: 'Noch keine Discord-Rollen den Stufen zugeordnet – Verwaltungsbefehle dürfen nur Mitglieder mit „Server verwalten“.', fix: '`/setup` → Rollen.' });
  else { const empty = ACCESS_LEVELS.filter((l) => !cfg.roles[l].length).map((l) => LEVEL_LABEL[l]); if (empty.length) add({ severity: 'info', area: 'Rollen', text: `Ohne zugeordnete Rolle: ${empty.join(', ')}.` }); }
  if (sys) for (const [k, label] of Object.entries(ASSIGNED_ROLES)) {
    const id = sys[k as keyof DiscordConfig];
    if (!id || !roleIds.has(id)) continue;
    const r = g.roles.find((x) => x.id === id)!;
    if (r.managed) add({ severity: 'error', area: 'Rollen', text: `Rolle „${r.name}“ (${label}) gehört einer Integration und kann nicht vergeben werden.` });
    else if (r.position >= g.botTopRolePosition) add({ severity: 'error', area: 'Rollen', text: `Rolle „${r.name}“ (${label}) steht über oder auf Höhe der Bot-Rolle – der Bot kann sie nicht vergeben.`, fix: 'Servereinstellungen → Rollen → Bot-Rolle über diese Rolle ziehen.' });
  }

  if (!rt.intents.members) add({ severity: 'warn', area: 'Discord', text: 'Privilegierter Intent „Server Members“ ist aus: keine Begrüßung/Abschied, Teamliste nur aus dem Cache.', fix: 'Developer Portal → Bot → Privileged Gateway Intents → „Server Members Intent“ an, Bot neu starten.' });
  if (!rt.intents.content) add({ severity: 'info', area: 'Discord', text: 'Intent „Message Content“ ist aus: Ticket-Verläufe ohne Nachrichtentext.', fix: 'Developer Portal → Bot → „Message Content Intent“.' });
  if (cfg.modules.disabled.length) add({ severity: 'info', area: 'Module', text: `Im Bot ausgeblendet: ${cfg.modules.disabled.join(', ')} (Daten bleiben erhalten).` });

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export const SEVERITY_ICON: Record<Severity, string> = { ok: '✅', info: 'ℹ️', warn: '⚠️', error: '❌' };

/** Befunde als Text (für ein Embed; höchstens ~3800 Zeichen). */
export function findingsText(list: Finding[], max = 3800): string {
  const lines: string[] = [];
  let len = 0;
  for (const f of list) {
    const line = `${SEVERITY_ICON[f.severity]} **${f.area}:** ${f.text}${f.fix ? `\n  ↳ ${f.fix}` : ''}`;
    if (len + line.length > max) { lines.push(`… ${list.length - lines.length} weitere`); break; }
    lines.push(line); len += line.length + 1;
  }
  return lines.join('\n') || '✅ Keine Auffälligkeiten.';
}
