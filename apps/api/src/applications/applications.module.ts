import { Module } from '@nestjs/common';
import { PersonsModule } from '../persons/persons.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationsAnalyticsService } from './applications-analytics.service';
import { BotApplicationProgressController } from './application-progress';

@Module({ imports: [PersonsModule], controllers: [ApplicationsController, BotApplicationProgressController], providers: [ApplicationsService, ApplicationsAnalyticsService], exports: [ApplicationsService] })
export class ApplicationsModule {}
