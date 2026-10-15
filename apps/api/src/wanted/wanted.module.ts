import { Module } from '@nestjs/common';
import { WantedController } from './wanted.controller';
import { WantedHitsController } from './wanted-hits.controller';
import { WantedService } from './wanted.service';
import { WantedMatchService } from './wanted-match.service';

@Module({ controllers: [WantedController, WantedHitsController], providers: [WantedService, WantedMatchService], exports: [WantedService, WantedMatchService] })
export class WantedModule {}
