import { Global, Module } from '@nestjs/common';
import { BotController, DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';

@Global()
@Module({ controllers: [DiscordController, BotController], providers: [DiscordService], exports: [DiscordService] })
export class DiscordModule {}
