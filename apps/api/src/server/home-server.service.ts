import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { firstGuildId, homeGuild, setStoredHomeGuild } from '../common/guild-context';

/**
 * Der eine Discord-Server dieses Systems (siehe guild-context.ts). Hält den gespeicherten Teil (Einstellung „Discord-Server-ID“
 * bzw. der einzige Server des Bots) aktuell – beim Start, alle 60 s und direkt nach dem Speichern der Einstellungen.
 */
@Injectable()
export class HomeServerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('HomeServer');
  private timer?: NodeJS.Timeout;
  private warned = false;
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((e) => this.log.warn(`Discord-Server nicht ermittelbar: ${e instanceof Error ? e.message : e}`));
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.refresh().catch(() => undefined), 60_000);
    this.timer.unref?.();
  }
  onModuleDestroy() { clearInterval(this.timer); }

  /** Gespeicherten Server neu bestimmen und zurückgeben (`DISCORD_GUILD_ID` hat immer Vorrang). */
  async refresh(): Promise<string | null> {
    const [channels, known] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }),
    ]);
    const guilds = (Array.isArray(known?.value) ? (known.value as { id?: unknown }[]) : []).map((g) => String(g.id ?? '')).filter((id) => /^\d{15,25}$/.test(id));
    const configured = firstGuildId((channels?.value as { guildId?: string } | null)?.guildId);
    setStoredHomeGuild(configured ?? (guilds.length === 1 ? guilds[0]! : null));
    const env = (process.env.DISCORD_GUILD_ID ?? '').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g));
    if (env.length > 1 && !this.warned) { this.warned = true; this.log.warn(`DISCORD_GUILD_ID enthält mehrere Server – verwendet wird nur ${env[0]}.`); }
    return homeGuild();
  }
}
