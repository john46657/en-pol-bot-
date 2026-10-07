import { Global, Module } from '@nestjs/common';
import { LocksController } from './locks.controller';
import { LocksService } from './locks.service';

@Global()
@Module({ controllers: [LocksController], providers: [LocksService], exports: [LocksService] })
export class LocksModule {}
