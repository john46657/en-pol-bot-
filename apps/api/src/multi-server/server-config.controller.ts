import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { BRANDING_IMAGES } from '@enrp/shared';
import { CurrentActor, ServiceAuthorized } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { ServerConfigService } from './server-config.service';

const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const version = z.number().int().min(0);
const save = z.object({ data: z.record(z.string(), z.unknown()), version, note: z.string().trim().max(200).optional() }).strict();
const setup = z.object({ step: z.number().int().min(0).max(7), complete: z.boolean().optional() }).strict();
const restore = z.object({ version, modules: z.boolean().default(false) }).strict();
const upload = z.object({ kind: z.enum(Object.keys(BRANDING_IMAGES) as [string, ...string[]]) });
const MAX_UPLOAD = Math.max(...Object.values(BRANDING_IMAGES).map((r) => r.maxBytes));
const UPLOAD_RATE = { default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 30, ttl: 60_000 } };

/**
 * Server-Konfiguration: Name, Branding, Bilder, Design, Einrichtungsassistent, Versionen.
 * Autorisierung im Service gegen den Server aus dem PFAD (Mitgliedschaft + Recht genau dort); Header/Body können ihn nicht ändern.
 */
@ApiTags('servers')
@ServiceAuthorized()
@Controller('servers')
export class ServerConfigController {
  constructor(private readonly c: ServerConfigService) {}
  /** Branding des gewählten Servers fürs Dashboard (nur Mitglieder dieses Servers). */
  @Get('branding/:guildId') branding(@CurrentActor() a: Actor, @Param('guildId', zodBody(sf)) guildId: string) { return this.c.branding(a, guildId); }
  @Get(':serverId/config') get(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.c.get(a, id); }
  @Put(':serverId/config') save(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Body(zodBody(save)) b: z.infer<typeof save>) { return this.c.save(a, id, b); }
  @Post(':serverId/config/setup') setup(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Body(zodBody(setup)) b: z.infer<typeof setup>) { return this.c.setup(a, id, b); }
  @Get(':serverId/config/revisions') revisions(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string) { return this.c.revisions(a, id); }
  @Post(':serverId/config/revisions/:version/restore') restore(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) v: number, @Body(zodBody(restore)) b: z.infer<typeof restore>) { return this.c.restore(a, id, v, b); }
  @Post(':serverId/assets') @Throttle(UPLOAD_RATE) @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1, fields: 5 } }))
  upload(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body(zodBody(upload)) b: z.infer<typeof upload>) { return this.c.upload(a, id, b.kind, file); }
  @Get(':serverId/assets/:assetId')
  async asset(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Res() res: Response) {
    const f = await this.c.asset(a, id, assetId);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', 'inline');
    // Bilder ändern sich nie (neue Datei = neue ID); nur im eigenen Browser zwischenspeichern
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.send(f.data);
  }
  @Delete(':serverId/assets/:assetId') remove(@CurrentActor() a: Actor, @Param('serverId', ParseUUIDPipe) id: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Query('confirm') confirm: string | undefined) { return this.c.removeAsset(a, id, assetId, confirm === 'true'); }
}
