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
import { OrgModule } from '../org/org.module';
import { PersonnelFileController, QualificationRegistryController, TrainingExtController } from './hr-ext.controller';
import { PersonnelFileService } from './personnel-file.service';
import { QualificationRegistryService } from './qualification-registry.service';
import { TrainingExtService } from './training-ext.service';
import { HrCareerService } from './hr-career.service';

/** Personal- & Verwaltungssystem: Personalakte, Ränge/Beförderungen, Versetzungen, Ausbildungen/Prüfungen, Dienstnummern. */
@Module({
  imports: [BackupModule, OrgModule],
  controllers: [HrController, HrExamController, HrRequestsController, HrTrainingController, HrTrainingSessionsController, BotTrainingSessionsController, ServiceNumbersController, PersonnelFileController, QualificationRegistryController, TrainingExtController],
  providers: [HrCoreService, HrPeopleService, HrRequestsService, HrTrainingService, HrExamService, HrTrainingSessionsService, ServiceNumbersService, QualificationRegistryService, PersonnelFileService, TrainingExtService, HrCareerService],
  exports: [HrCoreService, ServiceNumbersService, QualificationRegistryService, PersonnelFileService],
})
export class HrModule {}
