import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BotServersController, ConnectionsController, ServersController } from './multi-server.controller';
import { ServersService } from './servers.service';
import { ConnectionsService } from './connections.service';
import { SyncService } from './sync.service';

/** Multi-Server: Server/Mandanten, Module je Server, Rollen & Rechte je Server, Verbindungen, Datenfreigaben, Synchronisierung. */
@Global()
@Module({ imports: [UsersModule], controllers: [ServersController, ConnectionsController, BotServersController], providers: [ServersService, ConnectionsService, SyncService], exports: [ServersService, ConnectionsService, SyncService] })
export class MultiServerModule {}
