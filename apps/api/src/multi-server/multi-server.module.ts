import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BotServersController, ServersController } from './multi-server.controller';
import { ServersService } from './servers.service';
import { ServerConfigController } from './server-config.controller';
import { ServerConfigService } from './server-config.service';

/** Multi-Server: Server/Mandanten, Module je Server, Rollen & Rechte je Server, Konfiguration & Branding je Server. */
@Global()
@Module({ imports: [UsersModule], controllers: [ServerConfigController, ServersController, BotServersController], providers: [ServersService, ServerConfigService], exports: [ServersService, ServerConfigService] })
export class MultiServerModule {}
