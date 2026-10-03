import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { LegalCodesController } from '../legal-codes/legal-codes.controller';

@Module({ controllers: [TicketsController, LegalCodesController], providers: [TicketsService] })
export class TicketsModule {}
