import { Module } from '@nestjs/common';
import { BotEmbedsController, EmbedsController } from './embeds.controller';
import { EmbedsService } from './embeds.service';
import { MediaModule } from '../media/media.module';

@Module({ imports: [MediaModule], exports: [EmbedsService], controllers: [EmbedsController, BotEmbedsController], providers: [EmbedsService] })
export class EmbedsModule {}
