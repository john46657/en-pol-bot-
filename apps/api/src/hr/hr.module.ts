import { Module } from '@nestjs/common';
import { HrCommsController, HrController, HrRequestsController, HrTrainingController, ServiceNumbersController } from './hr.controller';
import { HrCoreService } from './hr-core.service';
import { HrPeopleService } from './hr-people.service';
import { HrRequestsService } from './hr-requests.service';
import { HrTrainingService } from './hr-training.service';
import { HrCommsService } from './hr-comms.service';
import { ServiceNumbersService } from './service-numbers.service';

/** Personal- & Verwaltungssystem: Personalakte, Ränge/Beförderungen, Versetzungen, Ausbildungen/Prüfungen, Meldungen/Abstimmungen, Dienstnummern. */
@Module({
  controllers: [HrController, HrRequestsController, HrTrainingController, HrCommsController, ServiceNumbersController],
  providers: [HrCoreService, HrPeopleService, HrRequestsService, HrTrainingService, HrCommsService, ServiceNumbersService],
  exports: [HrCoreService, ServiceNumbersService],
})
export class HrModule {}
