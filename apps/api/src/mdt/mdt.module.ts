import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { MdtController } from './mdt.controller';
import { MdtService } from './mdt.service';

@Module({ imports: [MediaModule], controllers: [MdtController], providers: [MdtService] })
export class MdtModule {}
