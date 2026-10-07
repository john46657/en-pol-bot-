import { Module } from '@nestjs/common';
import { DutyReportsController } from './duty-reports.controller';
import { DutyReportsService } from './duty-reports.service';

@Module({ controllers: [DutyReportsController], providers: [DutyReportsService], exports: [DutyReportsService] })
export class DutyReportsModule {}
