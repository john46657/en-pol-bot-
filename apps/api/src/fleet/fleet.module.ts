import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

@Module({ imports: [MediaModule], controllers: [FleetController], providers: [FleetService], exports: [FleetService] })
export class FleetModule {}
