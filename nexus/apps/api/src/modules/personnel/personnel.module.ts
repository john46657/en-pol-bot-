import { Module } from '@nestjs/common';
import { PersonnelController, PersonnelStructureController } from './personnel.controller.js';

@Module({ controllers: [PersonnelController, PersonnelStructureController] })
export class PersonnelModule {}
