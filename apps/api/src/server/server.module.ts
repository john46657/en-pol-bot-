import { Global, Module } from '@nestjs/common';
import { BackupModule } from '../backup/backup.module';
import { HomeServerService } from './home-server.service';
import { ModulesService } from './modules.service';
import { BotServerController, ModulesController } from './modules.controller';
import { SingleServerMigrationService } from './single-server-migration.service';

/** Der eine Discord-Server dieses Systems, zentrale Module und die einmalige Zusammenführung der früheren Daten je Server. */
@Global()
@Module({ imports: [BackupModule], controllers: [ModulesController, BotServerController], providers: [HomeServerService, ModulesService, SingleServerMigrationService], exports: [HomeServerService, ModulesService, SingleServerMigrationService] })
export class ServerModule {}
