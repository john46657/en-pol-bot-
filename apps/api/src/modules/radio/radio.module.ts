import { Module } from '@nestjs/common';
import { RadioController } from './radio.controller.js';

@Module({ controllers: [RadioController] })
export class RadioModule {}
