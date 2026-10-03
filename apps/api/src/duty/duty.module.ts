import { Module } from '@nestjs/common';
import { DutyController } from './duty.controller';
import { DutyService } from './duty.service';

@Module({ controllers: [DutyController], providers: [DutyService], exports: [DutyService] })
export class DutyModule {}
