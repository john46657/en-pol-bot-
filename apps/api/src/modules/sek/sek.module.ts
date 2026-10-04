import { Module } from '@nestjs/common';
import { SekController } from './sek.controller.js';

@Module({ controllers: [SekController] })
export class SekModule {}
