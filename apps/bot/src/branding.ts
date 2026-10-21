import { BOT_COMMAND_MODULES } from '@enrp/shared';
import { COLORS, type EmbedData, type Reply } from './format';
import { colorOf, type GuildConfig } from './guild-config';

export type Tone = 'primary' | 'success' | 'warning' | 'danger';
const FALLBACK: Record<Tone, number> = { primary: COLORS.info, success: COLORS.success, warning: COLORS.warning, danger: COLORS.danger };

/** Farbe des Servers für einen Zweck (eigene Farben aus /setup, sonst die Standardfarben). */
export const toneColor = (cfg: GuildConfig | null | undefined, tone: Tone) => colorOf(cfg?.colors[tone], FALLBACK[tone]);

/** Embed im Stil des Servers: Farbe, Kopfzeile mit Anzeigename + Logo, Servername in der Fußzeile. */
export function brand(cfg: GuildConfig | null | undefined, e: EmbedData, tone: Tone = 'primary'): EmbedData {
  const b = cfg?.branding;
  const head = b?.displayName || b?.serverName;
  return {
    ...e, color: toneColor(cfg, tone),
    ...(head && !e.author ? { author: { name: head, ...(b?.logoUrl ? { iconUrl: b.logoUrl } : {}) } } : {}),
    ...(b?.serverName && !e.footer ? { footer: b.serverName } : {}),
  };
}

/** „Farben auf alle Bot-Antworten anwenden“: Standardfarben der übrigen Befehle durch die des Servers ersetzen. */
export function brandReply(r: Reply, cfg: GuildConfig | null | undefined): Reply {
  if (!cfg?.branding.applyToAll || !r.embeds?.length) return r;
  const map = new Map<number, number>([[COLORS.info, toneColor(cfg, 'primary')], [COLORS.success, toneColor(cfg, 'success')], [COLORS.warning, toneColor(cfg, 'warning')], [COLORS.danger, toneColor(cfg, 'danger')]]);
  return { ...r, embeds: r.embeds.map((e) => (e.color !== undefined && map.has(e.color) ? { ...e, color: map.get(e.color)! } : e)) };
}

/** Neue Befehle des Bots, die zu einem Modul gehören (die übrigen stehen im gemeinsamen Katalog). */
const LOCAL_COMMAND_MODULES: Record<string, string> = { pruefung: 'personnel' };
export const moduleOfCommand = (name: string) => BOT_COMMAND_MODULES[name] ?? LOCAL_COMMAND_MODULES[name] ?? 'core';
/** Befehle, die auf einem Server sichtbar sind (Module aus im System ODER im Bot → ausgeblendet; Daten bleiben). */
export const visibleCommands = <T extends { name: string }>(all: T[], disabled: readonly string[]) => all.filter((c) => !disabled.includes(moduleOfCommand(c.name)));
