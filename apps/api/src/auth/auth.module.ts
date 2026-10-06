import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DiscordOAuthService } from './discord-oauth.service';

@Module({ controllers: [AuthController], providers: [AuthService, DiscordOAuthService], exports: [AuthService] })
export class AuthModule {}
