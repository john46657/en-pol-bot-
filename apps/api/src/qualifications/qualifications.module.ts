import { Module } from '@nestjs/common';
import { BotQualificationsController, QualificationsController } from './qualifications.controller';
import { QualificationsService } from './qualifications.service';

@Module({ controllers: [QualificationsController, BotQualificationsController], providers: [QualificationsService] })
export class QualificationsModule {}
