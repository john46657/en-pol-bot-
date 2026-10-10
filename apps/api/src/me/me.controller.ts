import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { layoutsSchema, preferencesSchema } from './me.schemas';
import { UsersService } from '../users/users.service';
import { nameBody } from '../users/users.controller';

const prefsBody = z.object({ preferences: preferencesSchema });
const layoutsBody = z.object({ layouts: layoutsSchema.nullable() });

/**
 * Persönliche Einstellungen und Startseiten-Layouts – je Benutzer (bei Discord-Login: je Discord-Konto) in der Datenbank,
 * damit sie auf jedem Gerät gleich sind. Jeder ändert ausschließlich seine eigenen Daten (Benutzer-ID aus der Session).
 */
@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService) {}

  @Get('preferences') @RequirePermission('dashboard.view')
  async get(@CurrentActor() a: Actor) {
    const s = await this.prisma.userSettings.findUnique({ where: { userId: a.userId! } });
    return { preferences: s?.preferences ?? {}, layouts: s?.layouts ?? null, updatedAt: new Date() };
  }

  @Put('preferences') @RequirePermission('dashboard.view')
  async setPreferences(@CurrentActor() a: Actor, @Body(zodBody(prefsBody)) b: z.infer<typeof prefsBody>) {
    const value = b.preferences as Prisma.InputJsonValue;
    await this.prisma.userSettings.upsert({ where: { userId: a.userId! }, create: { userId: a.userId!, preferences: value }, update: { preferences: value } });
    return { preferences: b.preferences, savedAt: new Date() };
  }

  /** Eigenen Anzeigenamen ändern (steht in Teamliste, Dienst-Übersicht, Einsätzen …). */
  @Put('name') @RequirePermission('dashboard.view')
  setName(@CurrentActor() a: Actor, @Body(zodBody(nameBody)) b: z.infer<typeof nameBody>) { return this.users.setName(a, a.userId!, b.displayName); }

  /** Layouts (Widgets, Reihenfolge, Größe). `null` = auf den Standard zurücksetzen. */
  @Put('layouts') @RequirePermission('dashboard.customize')
  async setLayouts(@CurrentActor() a: Actor, @Body(zodBody(layoutsBody)) b: z.infer<typeof layoutsBody>) {
    const value = b.layouts === null ? Prisma.DbNull : (b.layouts as Prisma.InputJsonValue);
    await this.prisma.userSettings.upsert({ where: { userId: a.userId! }, create: { userId: a.userId!, layouts: value }, update: { layouts: value } });
    return { layouts: b.layouts, savedAt: new Date() };
  }
}
