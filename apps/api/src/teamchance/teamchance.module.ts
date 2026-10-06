import { Global, Module } from '@nestjs/common';
import { TeamChanceController } from './teamchance.controller';
import { TeamChanceService } from './teamchance.service';

@Global()
@Module({ controllers: [TeamChanceController], providers: [TeamChanceService], exports: [TeamChanceService] })
export class TeamChanceModule {}
