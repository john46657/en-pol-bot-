import { Module } from '@nestjs/common';
import { AbsencesController } from './absences.controller.js';

@Module({ controllers: [AbsencesController] })
export class AbsencesModule {}
