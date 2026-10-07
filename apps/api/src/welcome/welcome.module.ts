import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { QualificationsModule } from '../qualifications/qualifications.module';
import { SupportTicketsModule } from '../support-tickets/tickets.module';
import { BotWelcomeController, WelcomeController } from './welcome.controller';
import { WelcomeService } from './welcome.service';

@Module({ imports: [ApplicationsModule, QualificationsModule, SupportTicketsModule], controllers: [WelcomeController, BotWelcomeController], providers: [WelcomeService] })
export class WelcomeModule {}
