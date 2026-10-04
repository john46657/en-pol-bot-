import { Module } from '@nestjs/common';
import { OfficeController } from './office.controller.js';

@Module({ controllers: [OfficeController] })
export class OfficeModule {}
