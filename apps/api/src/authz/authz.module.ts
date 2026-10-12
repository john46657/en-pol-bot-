import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { DiscordAccessService } from './discord-access.service';
import { AuthorizationService } from './authorization.service';

@Global()
@Module({ providers: [PermissionService, DiscordAccessService, AuthorizationService], exports: [PermissionService, DiscordAccessService, AuthorizationService] })
export class AuthzModule {}
