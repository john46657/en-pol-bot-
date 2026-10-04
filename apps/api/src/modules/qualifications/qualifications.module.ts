import { Module } from '@nestjs/common';
import { QualificationsController } from './qualifications.controller.js';

@Module({ controllers: [QualificationsController] })
export class QualificationsModule {}
