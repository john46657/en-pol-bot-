import { SupportTicketsModule } from '../support-tickets/tickets.module';
import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';

@Module({ imports: [SupportTicketsModule], controllers: [SearchController] })
export class SearchModule {}
