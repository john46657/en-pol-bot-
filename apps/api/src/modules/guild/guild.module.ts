import { Module } from '@nestjs/common';
import { GuildController } from './guild.controller.js';
import { GuildService } from './guild.service.js';
import { DiscordService } from './discord.service.js';

/**
 * GuildModule: Server-Daten für das Dashboard (Overview/Health, Channels,
 * Roles). Alles Guild-scoped (§113) und permission-geschützt.
 */
@Module({
  controllers: [GuildController],
  providers: [GuildService, DiscordService],
  exports: [GuildService, DiscordService],
})
export class GuildModule {}
