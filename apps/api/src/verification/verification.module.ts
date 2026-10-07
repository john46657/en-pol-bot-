import { Module } from '@nestjs/common';
import { PersonsModule } from '../persons/persons.module';
import { BotVerificationController, RobloxOAuthController, VerificationController } from './verification.controller';
import { RobloxOAuthService } from './roblox-oauth.service';
import { VerificationService } from './verification.service';

@Module({ imports: [PersonsModule], controllers: [VerificationController, BotVerificationController, RobloxOAuthController], providers: [VerificationService, RobloxOAuthService], exports: [VerificationService] })
export class VerificationModule {}
