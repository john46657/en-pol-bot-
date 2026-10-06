import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { DiscordAccessService } from './discord-access.service';

@Global()
@Module({ providers: [PermissionService, DiscordAccessService], exports: [PermissionService, DiscordAccessService] })
export class AuthzModule {}
