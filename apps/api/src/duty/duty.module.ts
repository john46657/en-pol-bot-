import { Module } from '@nestjs/common';
import { DutyController } from './duty.controller';
import { DutyService } from './duty.service';
import { BotShiftsController, ShiftsController, ShiftsService } from './shifts';

@Module({ controllers: [DutyController, ShiftsController, BotShiftsController], providers: [DutyService, ShiftsService], exports: [DutyService, ShiftsService] })
export class DutyModule {}
