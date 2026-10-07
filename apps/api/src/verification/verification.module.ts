import { Module } from '@nestjs/common';
import { PersonsModule } from '../persons/persons.module';
import { BotVerificationController, VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({ imports: [PersonsModule], controllers: [VerificationController, BotVerificationController], providers: [VerificationService], exports: [VerificationService] })
export class VerificationModule {}
