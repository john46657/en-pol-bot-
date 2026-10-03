import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DiscordRolesService } from './discord-roles.service.js';
import { GuildModule } from '../guild/guild.module.js';

/**
 * AuthModule (§114): Discord OAuth2 + Session-JWT.
 *
 * DiscordRolesService wird auch vom PermissionGuard genutzt (Rollen
 * serverseitig autoritativ), daher exportiert.
 */
@Module({
  imports: [GuildModule],
  controllers: [AuthController],
  providers: [AuthService, DiscordRolesService],
  exports: [DiscordRolesService],
})
export class AuthModule {}
