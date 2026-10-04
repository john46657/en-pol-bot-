import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller.js';

@Module({ controllers: [AutomationController] })
export class AutomationModule {}
