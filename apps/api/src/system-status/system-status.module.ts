import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { BackupModule } from '../backup/backup.module';
import { SystemStatusController } from './system-status.controller';
import { SystemStatusService } from './system-status.service';

@Module({ imports: [ApplicationsModule, BackupModule], controllers: [SystemStatusController], providers: [SystemStatusService] })
export class SystemStatusModule {}
