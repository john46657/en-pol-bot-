import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { TimelineService } from '../timeline/timeline.service';

@Global()
@Module({ providers: [AuditService, TimelineService], exports: [AuditService, TimelineService] })
export class AuditModule {}
