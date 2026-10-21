import { Global, Module } from '@nestjs/common';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

/** Qualitätsprüfer (global: Berichte und CAD prüfen vor dem Einreichen/Abschluss, Lage und Prognose nutzen die Befunde). */
@Global()
@Module({ controllers: [QualityController], providers: [QualityService], exports: [QualityService] })
export class QualityModule {}
