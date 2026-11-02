import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

/** Organigramm: Organisationseinheiten, Führung/Stellvertretung, Zuordnungen mit Historie, bereichsbezogene Zugriffe. */
@Module({ controllers: [OrgController], providers: [OrgService], exports: [OrgService] })
export class OrgModule {}
