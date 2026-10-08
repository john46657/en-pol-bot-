import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { LegalCodesController } from '../legal-codes/legal-codes.controller';
import { CadModule } from '../cad/cad.module';

@Module({ imports: [CadModule], controllers: [TicketsController, LegalCodesController], providers: [TicketsService] })
export class TicketsModule {}
