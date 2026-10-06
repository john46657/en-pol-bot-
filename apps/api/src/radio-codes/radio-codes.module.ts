import { Module } from '@nestjs/common';
import { RadioCodesController } from './radio-codes.controller';
import { RadioCodesService } from './radio-codes.service';

@Module({ controllers: [RadioCodesController], providers: [RadioCodesService], exports: [RadioCodesService] })
export class RadioCodesModule {}
