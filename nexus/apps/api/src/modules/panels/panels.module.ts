import { Module } from '@nestjs/common';
import { GuildModule } from '../guild/guild.module.js';
import { MessagePanelsController } from './panels.controller.js';
import { PanelsService } from './panels.service.js';

@Module({
  imports: [GuildModule],
  controllers: [MessagePanelsController],
  providers: [PanelsService],
})
export class MessagePanelsModule {}
