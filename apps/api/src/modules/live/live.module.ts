import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LiveService } from './live.service.js';

@Module({ imports: [AuthModule], providers: [LiveService] })
export class LiveModule {}
