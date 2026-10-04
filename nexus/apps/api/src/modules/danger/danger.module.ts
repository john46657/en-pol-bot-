import { Module } from '@nestjs/common';
import { DangerController } from './danger.controller.js';

@Module({ controllers: [DangerController] })
export class DangerModule {}
