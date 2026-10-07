import { Injectable } from '@nestjs/common';
import { CAD_EVENT_SEND_TYPE, type CadEvent } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CadConfigService } from './cad-config.service';

/**
 * Überträgt CAD-Ereignisse nach Discord. Zielkanäle kommen ausschließlich aus der Konfiguration:
 * 1. Kanalzuordnungen (CAD-Einstellungen → Discord) des Heimat-Servers des Ereignisses,
 * 2. aktive Server-Verbindungen, deren Datenart das Ereignis erlaubt (Kanäle der Verbindung + Zuordnungen des Ziel-Servers).
 * Nichts ist hartcodiert; ohne Konfiguration wird nichts gesendet.
 */
@Injectable()
export class CadNotifyService {
  constructor(private readonly prisma: PrismaService, private readonly discord: DiscordService, private readonly cfg: CadConfigService, private readonly rt: RealtimeService) {}

  async targets(event: CadEvent, guildId: string | null) {
    const cfg = await this.cfg.get();
    const home = guildId ?? cfg.homeGuildId ?? null;
    const channels = new Set<string>(), pings = new Set<string>();
    const add = (route: { channelIds: string[]; pingRoleIds?: string[] }) => { route.channelIds.forEach((c) => channels.add(c)); route.pingRoleIds?.forEach((r) => pings.add(r)); };
    const routesFor = (g: string | null) => cfg.routes.filter((r) => r.enabled && r.event === event && (g === null || r.guildId === g));
    routesFor(home).forEach(add);
    const linked: string[] = [];
    if (home) {
      const sendType = CAD_EVENT_SEND_TYPE[event];
      const links = await this.prisma.cadServerLink.findMany({ where: { active: true, notify: true, sourceGuildId: home, sendTypes: { has: sendType } } });
      for (const l of links) {
        linked.push(l.targetGuildId);
        const own = ((l.channels ?? {}) as Record<string, string[]>)[sendType] ?? [];
        own.filter((c) => /^\d{15,25}$/.test(c)).forEach((c) => channels.add(c));
        routesFor(l.targetGuildId).forEach(add);
      }
    }
    return { channelIds: [...channels], pingRoleIds: [...pings], linkedGuilds: linked };
  }

  /** Best effort: Fehler beim Benachrichtigen stören den Fachprozess nie. */
  async emit(event: CadEvent, payload: Record<string, unknown>, guildId: string | null) {
    this.rt.publish('cad', `cad.${event}`, { id: payload.id ?? null });
    try {
      const t = await this.targets(event, guildId);
      if (!t.channelIds.length) return t;
      await this.discord.enqueue('cad', `cad.${event}`, { ...payload, channelIds: t.channelIds, pingRoleIds: t.pingRoleIds }, { always: true });
      return t;
    } catch { return null; }
  }
}
