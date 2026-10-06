import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotifyService } from './notify.service';

@Global()
@Module({ controllers: [NotificationsController], providers: [NotifyService], exports: [NotifyService] })
export class NotificationsModule {}
