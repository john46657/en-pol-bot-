import { Module } from '@nestjs/common';
import { FleetController, PenaltiesController } from './fleet.controller.js';

@Module({ controllers: [FleetController, PenaltiesController] })
export class FleetModule {}
