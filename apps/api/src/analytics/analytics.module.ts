import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { StatsService } from './stats.service';

@Module({ controllers: [AnalyticsController], providers: [StatsService], exports: [StatsService] })
export class AnalyticsModule {}
