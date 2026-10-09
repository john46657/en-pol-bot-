import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { PersonsModule } from '../persons/persons.module';
import { MdtController } from './mdt.controller';
import { MdtService } from './mdt.service';

@Module({ imports: [MediaModule, PersonsModule], controllers: [MdtController], providers: [MdtService] })
export class MdtModule {}
