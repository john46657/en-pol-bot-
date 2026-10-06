import { Module } from '@nestjs/common';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { RobloxService } from './roblox.service';

@Module({ controllers: [PersonsController], providers: [PersonsService, RobloxService], exports: [PersonsService, RobloxService] })
export class PersonsModule {}
