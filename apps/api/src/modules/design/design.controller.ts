import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UseFilters,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  activateTheme,
  createTheme,
  deleteTheme,
  DesignError,
  duplicateTheme,
  exportTheme,
  getDesign,
  deleteAsset,
  filterForViewer,
  listAssets,
  saveAsset,
  getEffective,
  getWidgetData,
  getTheme,
  importTheme,
  listVersions,
  normalizeConfig,
  previewImport,
  resetAll,
  resetPath,
  restoreVersion,
  setAutosave,
  setOverrides,
  updateTheme,
} from '@nexus/design';
import { permissions } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import { Access, type RequestAccess } from '../../common/decorators/scope.decorator.js';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator.js';
import { GuildId } from '../../common/decorators/guild-id.decorator.js';
import { RequireDashboardAccess } from '../../common/decorators/guild-admin.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { DiscordService } from '../guild/discord.service.js';
import { readBody } from './uploads.js';
import { DesignErrorFilter } from './design-error.filter.js';

type Body_ = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Dashboard-Design je Server. Lesen der wirksamen Konfiguration darf jeder mit Dashboard-Zugang (sonst ließe sich
 * das Design nicht anwenden); Ansehen aller Themes braucht `design.view`, Ändern `design.edit` – serverseitig geprüft.
 */
@ApiTags('Design')
@ApiBearerAuth()
@UseFilters(DesignErrorFilter)
@Controller('guilds/:guildId/design')
export class DesignController {
  constructor(private readonly discord: DiscordService) {}

  @Get('effective')
  @RequireDashboardAccess()
  async effective(@GuildId() guildId: string, @Access() access: RequestAccess) {
    const e = await getEffective(guildId);
    // Seiten, Widgets, Banner und Menüeinträge mit Rollen-Einschränkung verlassen den Server nur für Berechtigte
    const config = filterForViewer(e.config, { isAdmin: access.bypass, roleIds: access.roleIds });
    return { config, themeName: e.themeName, source: e.source };
  }

  /**
   * Daten für die Widgets. Jeder Bereich kommt nur, wenn der Benutzer das passende Recht hat (sonst `null`);
   * die Prüfung geschieht hier, nicht in der Oberfläche.
   */
  @Get('widget-data')
  @RequireDashboardAccess()
  widgetData(@GuildId() guildId: string, @Access() access: RequestAccess) {
    return getWidgetData(
      guildId,
      async (p) => access.bypass || (await permissions.can(access, p as Permission)),
    );
  }

  /** Rollen des Servers für die Menü-Sichtbarkeit (nur Name/Farbe, ohne Verwaltbarkeits-Details). */
  @Get('roles')
  @RequirePermissions('design.view')
  async roles(@GuildId() guildId: string) {
    const roles = await this.discord.listRoles(guildId);
    return roles
      .filter((r) => r.id !== guildId)
      .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position }))
      .sort((a, b) => b.position - a.position);
  }

  @Get()
  @RequirePermissions('design.view')
  overview(@GuildId() guildId: string) {
    return getDesign(guildId);
  }

  @Get('themes/:id')
  @RequirePermissions('design.view')
  async theme(@GuildId() guildId: string, @Param('id') id: string) {
    const t = await getTheme(guildId, id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      version: t.version,
      builtin: t.builtin,
      config: normalizeConfig(t.config),
    };
  }

  @Get('themes/:id/versions')
  @RequirePermissions('design.view')
  versions(@GuildId() guildId: string, @Param('id') id: string) {
    return listVersions(guildId, id);
  }

  @Get('themes/:id/export')
  @RequirePermissions('design.view')
  export(@GuildId() guildId: string, @Param('id') id: string) {
    return exportTheme(guildId, id);
  }

  @Post('themes')
  @RequirePermissions('design.edit')
  create(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return createTheme({
      guildId,
      actorId: user.id,
      name: str(b['name']) ?? '',
      description: str(b['description']),
      config: b['config'],
    });
  }

  @Post('themes/:id/duplicate')
  @RequirePermissions('design.edit')
  duplicate(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return duplicateTheme(guildId, id, user.id);
  }

  @Put('themes/:id')
  @RequirePermissions('design.edit')
  update(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Body() b: Body_,
    @CurrentUser() user: RequestUser,
  ) {
    return updateTheme({
      guildId,
      themeId: id,
      actorId: user.id,
      name: str(b['name']),
      description: str(b['description']),
      config: b['config'],
    });
  }

  @Delete('themes/:id')
  @RequirePermissions('design.edit')
  async remove(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await deleteTheme(guildId, id, user.id);
    return { ok: true };
  }

  @Post('themes/:id/activate')
  @RequirePermissions('design.edit')
  activate(@GuildId() guildId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return activateTheme(guildId, id, user.id);
  }

  @Post('themes/:id/restore/:version')
  @RequirePermissions('design.edit')
  restore(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @Param('version') version: string,
    @CurrentUser() user: RequestUser,
  ) {
    const n = Number(version);
    if (!Number.isInteger(n) || n < 1)
      throw new DesignError('invalid', 'Ungültige Versionsnummer.');
    return restoreVersion(guildId, id, n, user.id);
  }

  @Put('overrides')
  @RequirePermissions('design.edit')
  overrides(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return setOverrides({ guildId, actorId: user.id, overrides: b['overrides'] ?? null });
  }

  @Post('reset')
  @RequirePermissions('design.edit')
  reset(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    // Ein einzelner Wert (path) oder – nur mit ausdrücklicher Bestätigung – das gesamte Design
    const path = str(b['path']);
    if (path) return resetPath(guildId, path, user.id);
    if (b['confirm'] !== true)
      throw new DesignError(
        'invalid',
        'Zum Zurücksetzen des gesamten Designs ist eine Bestätigung nötig.',
      );
    return resetAll(guildId, user.id);
  }

  @Put('autosave')
  @RequirePermissions('design.edit')
  async autosave(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return { autosave: await setAutosave(guildId, b['autosave'] === true, user.id) };
  }

  /** Bilder-Bibliothek des Servers (Logo, Hintergründe, Widget-Bilder). */
  @Get('assets')
  @RequirePermissions('design.view')
  assets(@GuildId() guildId: string) {
    return listAssets(guildId);
  }

  /**
   * Bild hochladen: der Körper ist die Datei selbst (`application/octet-stream`), der Dateiname steht (URL-kodiert) in
   * `X-Filename`. Das Format wird am Dateikopf geprüft, das Bild neu kodiert (WebP/GIF), Größe und Speicher sind begrenzt.
   */
  @Post('assets')
  @RequirePermissions('design.edit')
  async upload(
    @GuildId() guildId: string,
    @Req() req: Request,
    @Headers('x-filename') filename: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    const bytes = await readBody(req);
    const name = (() => {
      try {
        return decodeURIComponent(filename ?? '');
      } catch {
        return ''; // ungültig kodierter Name: egal, der Name dient nur der Anzeige
      }
    })();
    return saveAsset({ guildId, actorId: user.id, bytes, originalName: name });
  }

  @Delete('assets/:id')
  @RequirePermissions('design.edit')
  async deleteAsset(
    @GuildId() guildId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await deleteAsset(guildId, id, user.id);
    return { ok: true };
  }

  @Post('import/preview')
  @RequirePermissions('design.edit')
  importPreview(@Body() b: Body_) {
    return previewImport(b['data']);
  }

  @Post('import')
  @RequirePermissions('design.edit')
  import(@GuildId() guildId: string, @Body() b: Body_, @CurrentUser() user: RequestUser) {
    return importTheme({ guildId, actorId: user.id, data: b['data'], name: str(b['name']) });
  }
}
