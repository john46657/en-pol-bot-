import { Module } from '@nestjs/common';
import { BackupModule } from '../backup/backup.module';
import { BotTrainingSessionsController, HrController, HrExamController, HrRequestsController, HrTrainingController, HrTrainingSessionsController, ServiceNumbersController } from './hr.controller';
import { HrTrainingSessionsService } from './hr-training-sessions.service';
import { HrCoreService } from './hr-core.service';
import { HrPeopleService } from './hr-people.service';
import { HrRequestsService } from './hr-requests.service';
import { HrTrainingService } from './hr-training.service';
import { HrExamService } from './hr-exam.service';
import { ServiceNumbersService } from './service-numbers.service';
import { HrCareerService } from './hr-career.service';

/** Personal- & Verwaltungssystem: Personalakte, Ränge/Beförderungen, Versetzungen, Ausbildungen/Prüfungen, Dienstnummern. */
@Module({
  imports: [BackupModule],
  controllers: [HrController, HrExamController, HrRequestsController, HrTrainingController, HrTrainingSessionsController, BotTrainingSessionsController, ServiceNumbersController],
  providers: [HrCoreService, HrPeopleService, HrRequestsService, HrTrainingService, HrExamService, HrTrainingSessionsService, ServiceNumbersService, HrCareerService],
  exports: [HrCoreService, ServiceNumbersService],
})
export class HrModule {}
