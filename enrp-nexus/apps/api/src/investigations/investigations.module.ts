import { Module } from '@nestjs/common';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

@Module({ controllers: [InvestigationsController], providers: [InvestigationsService] })
export class InvestigationsModule {}
