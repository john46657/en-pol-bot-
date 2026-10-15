import { Module } from '@nestjs/common';
import { BackupModule } from '../backup/backup.module';
import { ServerLinksModule } from '../server-links/server-links.module';
import { MultiServerModule } from './multi-server.module';
import { MultiServerRestoreService } from './multi-server-restore.service';

/** Einmalige Rück-Umstellung vom Ein-Server-Betrieb (nach Server-Verbund, Modul-Katalog und Backups initialisiert). */
@Module({ imports: [BackupModule, ServerLinksModule, MultiServerModule], providers: [MultiServerRestoreService], exports: [MultiServerRestoreService] })
export class MultiServerRestoreModule {}
