import { Module } from '@nestjs/common';
import { ApplicationsController } from './controllers/applications.controller.js';
import { SubmissionsController } from './controllers/submissions.controller.js';
import { QuestionsController } from './controllers/questions.controller.js';
import { QuestionsService } from './services/questions.service.js';
import { PanelsController } from './controllers/panels.controller.js';
import { AnalyticsController } from './controllers/analytics.controller.js';
import { ApplicationsService } from './services/applications.service.js';
import { SubmissionsService } from './services/submissions.service.js';
import { RatingsService } from './services/ratings.service.js';
import { PanelsService } from './services/panels.service.js';
import { ApplicationAnalyticsService } from './services/analytics.service.js';

@Module({
  controllers: [
    ApplicationsController,
    SubmissionsController,
    PanelsController,
    QuestionsController,
    AnalyticsController,
  ],
  providers: [
    QuestionsService,
    ApplicationsService,
    SubmissionsService,
    RatingsService,
    PanelsService,
    ApplicationAnalyticsService,
  ],
  exports: [ApplicationsService, SubmissionsService],
})
export class ApplicationsModule {}
