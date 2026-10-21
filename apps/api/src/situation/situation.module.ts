import { Module } from '@nestjs/common';
import { CadModule } from '../cad/cad.module';
import { SituationController } from './situation.controller';
import { SituationService } from './situation.service';

@Module({ imports: [CadModule], controllers: [SituationController], providers: [SituationService] })
export class SituationModule {}
