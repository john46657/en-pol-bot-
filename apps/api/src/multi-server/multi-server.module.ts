import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BotServersController, ServersController } from './multi-server.controller';
import { ServersService } from './servers.service';

/** Multi-Server: Server/Mandanten, Module je Server, Rollen & Rechte je Server. */
@Global()
@Module({ imports: [UsersModule], controllers: [ServersController, BotServersController], providers: [ServersService], exports: [ServersService] })
export class MultiServerModule {}
