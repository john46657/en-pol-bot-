import { Module } from '@nestjs/common';
import { BotEmbedsController, EmbedsController } from './embeds.controller';
import { EmbedsService } from './embeds.service';

@Module({ controllers: [EmbedsController, BotEmbedsController], providers: [EmbedsService] })
export class EmbedsModule {}
