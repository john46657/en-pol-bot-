import { Module } from '@nestjs/common';
import { SekController } from './sek.controller';
import { SekService } from './sek.service';

@Module({ controllers: [SekController], providers: [SekService] })
export class SekModule {}
