import { Module } from '@nestjs/common';
import { PromotionsController } from './promotions.controller.js';

@Module({ controllers: [PromotionsController] })
export class PromotionsModule {}
