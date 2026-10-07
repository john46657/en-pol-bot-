import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { MAX_BYTES, MediaService } from './media.service';
import { CurrentActor } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { zodBody } from '../common/zod.pipe';

const link = z.object({ linkedType: z.string().max(40), linkedId: z.string().max(64) });

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly m: MediaService) {}

  @Post() @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  upload(@CurrentActor() a: Actor, @UploadedFile() file: Express.Multer.File | undefined, @Body(zodBody(link)) b: z.infer<typeof link>) {
    if (!file) throw new AppError('VALIDATION_FAILED', 'Bitte eine Datei auswählen.');
    return this.m.upload(a, file, b);
  }

  @Get() list(@CurrentActor() a: Actor, @Query(zodBody(link)) q: z.infer<typeof link>) { return this.m.list(a, q.linkedType, q.linkedId); }

  @Get(':id')
  async download(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { media, data } = await this.m.download(a, id);
    // Nie inline ausliefern: erzwingt Download und verhindert Ausführung/Rendern von Inhalten im App-Origin.
    res.set({ 'Content-Type': media.mime, 'Content-Disposition': `attachment; filename="${media.originalName}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(data);
  }
}
