import { Module } from '@nestjs/common';
import { DispatchController, IncidentsController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({ controllers: [IncidentsController, DispatchController], providers: [DispatchService], exports: [DispatchService] })
export class DispatchModule {}
