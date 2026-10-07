import { Module } from '@nestjs/common';
import { PersonsModule } from '../persons/persons.module';
import { BotQualificationsController, QualificationsController } from './qualifications.controller';
import { QualificationsService } from './qualifications.service';

@Module({ imports: [PersonsModule], controllers: [QualificationsController, BotQualificationsController], providers: [QualificationsService] })
export class QualificationsModule {}
