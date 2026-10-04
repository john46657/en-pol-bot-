import { Module } from '@nestjs/common';
import { GuildModule } from '../guild/guild.module.js';
import { DesignController } from './design.controller.js';

@Module({ imports: [GuildModule], controllers: [DesignController] })
export class DesignModule {}
