import { Injectable } from '@nestjs/common';
import { type CadEvent } from '@enrp/shared';
import { isHomeGuild } from '../common/guild-context';
import { DiscordService } from '../discord/discord.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CadConfigService } from './cad-config.service';

/**
 * Überträgt CAD-Ereignisse nach Discord. Zielkanäle kommen ausschließlich aus der Konfiguration (CAD-Einstellungen → Discord).
 * Nichts ist hartcodiert; ohne Konfiguration wird nichts gesendet. Zuordnungen, die noch auf einen anderen Discord-Server
 * zeigen (aus der früheren Multi-Server-Zeit), werden nicht mehr bedient.
 */
@Injectable()
export class CadNotifyService {
  constructor(private readonly discord: DiscordService, private readonly cfg: CadConfigService, private readonly rt: RealtimeService) {}

  async targets(event: CadEvent) {
    const cfg = await this.cfg.get();
    const channels = new Set<string>(), pings = new Set<string>();
    for (const r of cfg.routes) {
      if (!r.enabled || r.event !== event || !isHomeGuild(r.guildId)) continue;
      r.channelIds.forEach((c) => channels.add(c));
      r.pingRoleIds?.forEach((x) => pings.add(x));
    }
    return { channelIds: [...channels], pingRoleIds: [...pings] };
  }

  /** Best effort: Fehler beim Benachrichtigen stören den Fachprozess nie. */
  async emit(event: CadEvent, payload: Record<string, unknown>) {
    this.rt.publish('cad', `cad.${event}`, { id: payload.id ?? null });
    try {
      const t = await this.targets(event);
      if (!t.channelIds.length) return t;
      await this.discord.enqueue('cad', `cad.${event}`, { ...payload, channelIds: t.channelIds, pingRoleIds: t.pingRoleIds }, { always: true });
      return t;
    } catch { return null; }
  }
}
