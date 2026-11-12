import { Module } from '@nestjs/common';
import { PersonsModule } from '../persons/persons.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationsAnalyticsService } from './applications-analytics.service';
import { BotApplicationProgressController } from './application-progress';
import { AiReviewService } from './ai-review/ai-review.service';
import { AiReviewSettingsController, BotAiReviewController, PoliceAiReviewController, QualificationAiReviewController } from './ai-review/ai-review.controller';

@Module({ imports: [PersonsModule], controllers: [ApplicationsController, BotApplicationProgressController, PoliceAiReviewController, QualificationAiReviewController, AiReviewSettingsController, BotAiReviewController], providers: [ApplicationsService, ApplicationsAnalyticsService, AiReviewService], exports: [ApplicationsService, AiReviewService] })
export class ApplicationsModule {}
