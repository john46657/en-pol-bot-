import { Module } from '@nestjs/common';
import { BotPanelsController, PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';

@Module({ controllers: [PanelsController, BotPanelsController], providers: [PanelsService], exports: [PanelsService] })
export class PanelsModule {}
