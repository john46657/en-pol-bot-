import { Module } from '@nestjs/common';
import { RestrictionsController } from './restrictions.controller.js';

@Module({ controllers: [RestrictionsController] })
export class RestrictionsModule {}
