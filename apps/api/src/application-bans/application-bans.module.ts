import { Global, Module } from '@nestjs/common';
import { PersonsModule } from '../persons/persons.module';
import { ApplicationBansController, BotApplicationBansController } from './application-bans.controller';
import { ApplicationBansService } from './application-bans.service';

/** Bewerbungssperren – global, damit Polizei-Bewerbung und Qualifikationen beim Absenden prüfen können. */
@Global()
@Module({ imports: [PersonsModule], controllers: [ApplicationBansController, BotApplicationBansController], providers: [ApplicationBansService], exports: [ApplicationBansService] })
export class ApplicationBansModule {}
