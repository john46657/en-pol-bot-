import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { HELP_ARTICLE_KINDS, HELP_ARTICLE_STATUSES, helpArticleSchema, helpCategorySchema, type HelpArticleInput } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { HelpService } from './help.service';

const listQ = z.object({ q: z.string().trim().max(100).optional(), categoryId: z.string().uuid().optional(), kind: z.enum(HELP_ARTICLE_KINDS).optional(), status: z.enum(HELP_ARTICLE_STATUSES).optional(), page: z.coerce.number().int().min(1).max(1000).optional() });
const articleBody = helpArticleSchema.and(z.object({ version: z.number().int().optional() }));

/** Hilfe-Center (Dashboard + Bot `/hilfe`). */
@ApiTags('help')
@Controller('help')
export class HelpController {
  constructor(private readonly s: HelpService) {}
  @Get('categories') @RequirePermission('help.view') categories() { return this.s.categories(); }
  @Post('categories') @RequirePermission('help.manage') createCategory(@CurrentActor() a: Actor, @Body(zodBody(helpCategorySchema)) b: z.infer<typeof helpCategorySchema>) { return this.s.saveCategory(a, b); }
  @Put('categories/:id') @RequirePermission('help.manage') saveCategory(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(helpCategorySchema)) b: z.infer<typeof helpCategorySchema>) { return this.s.saveCategory(a, b, id); }
  @Get('articles') @RequirePermission('help.view') list(@CurrentActor() a: Actor, @Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(a, q); }
  @Get('articles/:idOrSlug') @RequirePermission('help.view') get(@CurrentActor() a: Actor, @Param('idOrSlug', zodBody(z.string().regex(/^[0-9a-z-]{1,80}$/i))) id: string) { return this.s.get(a, id); }
  @Post('articles') @RequirePermission('help.manage') create(@CurrentActor() a: Actor, @Body(zodBody(articleBody)) b: HelpArticleInput & { version?: number }) { return this.s.save(a, b); }
  @Put('articles/:id') @RequirePermission('help.manage') save(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(articleBody)) b: HelpArticleInput & { version?: number }) { return this.s.save(a, b, id); }
  @Get('articles/:id/revisions') @RequirePermission('help.manage') revisions(@Param('id', ParseUUIDPipe) id: string) { return this.s.revisions(id); }
}
