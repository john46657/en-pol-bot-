import { Module } from '@nestjs/common';
import { BotVoiceSupportController, VoiceSupportController } from './voice-support.controller';
import { VoiceSupportService } from './voice-support.service';

@Module({ controllers: [VoiceSupportController, BotVoiceSupportController], providers: [VoiceSupportService] })
export class VoiceSupportModule {}
