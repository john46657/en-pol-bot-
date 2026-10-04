import { Module } from '@nestjs/common';
import { DutyController } from './duty.controller.js';
import { ShiftsController } from './shifts.controller.js';

@Module({ controllers: [ShiftsController, DutyController] })
export class ShiftsModule {}
