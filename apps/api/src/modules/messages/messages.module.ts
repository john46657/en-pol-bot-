import { Module } from '@nestjs/common';
import { GuildModule } from '../guild/guild.module.js';
import { ScheduledMessagesController } from './scheduled-messages.controller.js';

@Module({ imports: [GuildModule], controllers: [ScheduledMessagesController] })
export class MessagesModule {}
