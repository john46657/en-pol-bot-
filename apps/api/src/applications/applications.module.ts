import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationsAnalyticsService } from './applications-analytics.service';

@Module({ controllers: [ApplicationsController], providers: [ApplicationsService, ApplicationsAnalyticsService], exports: [ApplicationsService] })
export class ApplicationsModule {}
