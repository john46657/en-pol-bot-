import { Module } from '@nestjs/common';
import { BackupController, BotBackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({ controllers: [BackupController, BotBackupController], providers: [BackupService] })
export class BackupModule {}
