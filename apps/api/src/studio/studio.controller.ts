import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StudioService } from './studio.service';

/** Für alle angemeldeten Benutzer lesbar (Branding, Theme, Feld-Definitionen); enthält keine sensiblen Daten. Änderungen laufen über PUT /admin/settings/:key. */
@ApiTags('studio')
@Controller('studio')
export class StudioController {
  constructor(private readonly s: StudioService) {}
  @Get('config') config() { return this.s.config(); }
}
