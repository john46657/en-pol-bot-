import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { PersonsModule } from '../persons/persons.module';
import { BotQualificationsController, QualificationsController, WebApplyController } from './qualifications.controller';
import { QualificationsService } from './qualifications.service';
import { WebApplyService } from './web-apply.service';

@Module({ imports: [PersonsModule, ApplicationsModule], controllers: [QualificationsController, BotQualificationsController, WebApplyController], providers: [QualificationsService, WebApplyService], exports: [QualificationsService] })
export class QualificationsModule {}
