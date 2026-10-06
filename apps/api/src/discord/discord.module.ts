import { Global, Module } from '@nestjs/common';
import { BotController, DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';
import { DiscordLiveService } from './discord-live.service';
import { ApplicationsModule } from '../applications/applications.module';
import { DangerModule } from '../danger/danger.module';
import { DutyModule } from '../duty/duty.module';

@Global()
@Module({ imports: [DutyModule, DangerModule, ApplicationsModule], controllers: [DiscordController, BotController], providers: [DiscordService, DiscordLiveService], exports: [DiscordService, DiscordLiveService] })
export class DiscordModule {}
