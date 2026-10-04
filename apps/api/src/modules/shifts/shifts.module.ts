import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller.js';

@Module({ controllers: [ShiftsController] })
export class ShiftsModule {}
