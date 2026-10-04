import { Module } from '@nestjs/common';
import { WantedController } from './wanted.controller.js';

@Module({ controllers: [WantedController] })
export class WantedModule {}
