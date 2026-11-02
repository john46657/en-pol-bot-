import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { learningMaterialSchema, PERSONNEL_DOCUMENT_KINDS, practicalExamSchema, qualificationDefSchema, type LearningMaterialInput, type PracticalExamInput } from '@enrp/shared';
import { CurrentActor, RequireAnyPermission, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { PersonnelFileService } from './personnel-file.service';
import { QualificationRegistryService } from './qualification-registry.service';
import { TrainingExtService } from './training-ext.service';

const uuid = z.string().uuid();
const note = z.object({ summary: z.string().trim().min(2).max(300), details: z.string().max(5000).nullable().optional(), category: z.string().trim().max(60).nullable().optional(), confidential: z.boolean().optional() });
const editNote = note.partial().extend({ reason: z.string().trim().max(300).optional() });
const doc = z.object({ mediaId: uuid, kind: z.enum(PERSONNEL_DOCUMENT_KINDS), title: z.string().trim().min(2).max(120), note: z.string().max(1000).nullable().optional(), confidential: z.boolean().optional() });
const page = z.coerce.number().int().min(1).max(10_000).optional();

/** Personalakte 2.0 (Dashboard), Personal-Auskunft (MDT/Leitstelle/Bot). */
@ApiTags('personnel-file')
@Controller('personnel-file')
export class PersonnelFileController {
  constructor(private readonly s: PersonnelFileService) {}
  /** Zuständige Akten für Führungskräfte (personnel.view_unit) */
  @Get('my-unit') @RequirePermission('personnel.view_unit') myUnit(@CurrentActor() a: Actor) { return this.s.unitOverview(a); }
  /** MDT/Leitstelle: dienstrelevante Auskunft, keine vertraulichen Inhalte */
  @Get('directory') @RequireAnyPermission('personnel.view', 'cad.view', 'team.view')
  directory(@Query(zodBody(z.object({ q: z.string().trim().max(80).optional(), onDuty: z.enum(['1', '0']).optional(), page }))) q: { q?: string; onDuty?: string; page?: number }) { return this.s.directory({ q: q.q, onDuty: q.onDuty === '1', page: q.page }); }
  @Get('lookup') @RequireAnyPermission('personnel.view', 'personnel.view_unit')
  lookup(@CurrentActor() a: Actor, @Query(zodBody(z.object({ discordId: z.string().regex(/^\d{15,25}$/) }))) q: { discordId: string }) { return this.s.lookup(a, q.discordId); }

  @Get(':id') @RequireAnyPermission('personnel.view', 'personnel.view_unit') summary(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.summary(a, id); }
  @Get(':id/activity') @RequireAnyPermission('personnel.view', 'personnel.view_unit')
  activity(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Query(zodBody(z.object({ page }))) q: { page?: number }) { return this.s.activity(a, id, q.page); }

  @Get(':id/notes') @RequirePermission('personnel.notes_view')
  notes(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Query(zodBody(z.object({ category: z.string().max(60).optional() }))) q: { category?: string }) { return this.s.notes(a, id, q); }
  @Post(':id/notes') @RequirePermission('personnel.notes_create') addNote(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(note)) b: z.infer<typeof note>) { return this.s.addNote(a, id, b); }
  @Patch('notes/:noteId') @RequirePermission('personnel.notes_view') editNote(@CurrentActor() a: Actor, @Param('noteId', ParseUUIDPipe) id: string, @Body(zodBody(editNote)) b: z.infer<typeof editNote>) { return this.s.editNote(a, id, b); }
  @Get('notes/:noteId/revisions') @RequirePermission('personnel.notes_view') revisions(@CurrentActor() a: Actor, @Param('noteId', ParseUUIDPipe) id: string) { return this.s.noteRevisions(a, id); }

  @Get(':id/documents') @RequirePermission('personnel.documents')
  documents(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Query(zodBody(z.object({ archived: z.enum(['1', '0']).optional() }))) q: { archived?: string }) { return this.s.documents(a, id, q.archived === '1'); }
  @Post(':id/documents') @RequirePermission('personnel.documents') addDocument(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(doc)) b: z.infer<typeof doc>) { return this.s.addDocument(a, id, b); }
  @Post('documents/:docId/archive') @HttpCode(200) @RequirePermission('personnel.documents') archive(@CurrentActor() a: Actor, @Param('docId', ParseUUIDPipe) id: string) { return this.s.archiveDocument(a, id); }
  @Get('documents/:docId/download') @RequirePermission('personnel.documents')
  async download(@CurrentActor() a: Actor, @Param('docId', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { media, data } = await this.s.downloadDocument(a, id);
    res.set({ 'Content-Type': media.mime, 'Content-Disposition': `attachment; filename="${media.originalName.replace(/["\r\n]/g, '')}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'no-store' });
    res.send(data);
  }
}

const defBody = qualificationDefSchema.extend({ trainingIds: z.array(uuid).max(50).default([]), examIds: z.array(uuid).max(50).default([]) });
const regQ = z.object({ personnelId: uuid.optional(), definitionId: uuid.optional(), status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']).optional(), operational: z.enum(['1', '0']).optional(), q: z.string().trim().max(80).optional(), page, pageSize: z.coerce.number().int().min(1).max(200).optional() });

/** Qualifikationsregister + Katalog. */
@ApiTags('qualification-registry')
@Controller('qualification-registry')
export class QualificationRegistryController {
  constructor(private readonly s: QualificationRegistryService) {}
  @Get('definitions') @RequireAnyPermission('qualification.view', 'qualification.manage') definitions(@Query(zodBody(z.object({ all: z.enum(['1', '0']).optional() }))) q: { all?: string }) { return this.s.definitions(q.all === '1'); }
  @Post('definitions') @RequirePermission('qualification.manage') create(@CurrentActor() a: Actor, @Body(zodBody(defBody)) b: z.infer<typeof defBody>) { return this.s.saveDefinition(a, b); }
  @Put('definitions/:id') @RequirePermission('qualification.manage') update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(defBody)) b: z.infer<typeof defBody>) { return this.s.saveDefinition(a, b, id); }
  /** Eigene Qualifikationen (jeder mit Personalakte; Bot-Befehl) */
  @Get('mine') @RequirePermission('dashboard.view') mine(@CurrentActor() a: Actor) { return this.s.mine(a.userId!); }
  @Get() @RequirePermission('qualification.view')
  list(@Query(zodBody(regQ)) q: z.infer<typeof regQ>) { return this.s.list({ ...q, operational: q.operational === '1' }); }
  /** Einsatzrelevante, aktive Qualifikationen einer Person (MDT/Leitstelle) */
  @Get('personnel/:id') @RequireAnyPermission('qualification.view', 'cad.view') ofPersonnel(@Param('id', ParseUUIDPipe) id: string, @Query(zodBody(z.object({ all: z.enum(['1', '0']).optional() }))) q: { all?: string }) { return this.s.ofPersonnel(id, q.all !== '1'); }
  @Post() @RequirePermission('qualification.grant')
  grant(@CurrentActor() a: Actor, @Body(zodBody(z.object({ personnelId: uuid, definitionId: uuid, issuedAt: z.string().date().optional(), expiresAt: z.string().date().nullable().optional(), note: z.string().max(500).optional() }))) b: { personnelId: string; definitionId: string; issuedAt?: string; expiresAt?: string | null; note?: string }) { return this.s.grant(a, b); }
  @Post(':id/status') @HttpCode(200) @RequireAnyPermission('qualification.grant', 'qualification.revoke')
  status(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']), reason: z.string().trim().max(500).optional() }))) b: { status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'; reason?: string }) { return this.s.setStatus(a, id, b); }
}

const matQ = z.object({ q: z.string().trim().max(80).optional(), trainingId: uuid.optional(), kind: z.string().max(10).optional() });
const matBody = learningMaterialSchema.and(z.object({ version: z.number().int().optional() }));

/** Lernmaterialien und praktische Prüfungen. */
@ApiTags('training')
@Controller('training-ext')
export class TrainingExtController {
  constructor(private readonly s: TrainingExtService) {}
  @Get('materials') @RequirePermission('training.view') materials(@CurrentActor() a: Actor, @Query(zodBody(matQ)) q: z.infer<typeof matQ>) { return this.s.materials(a, q); }
  @Get('materials/:id') @RequirePermission('training.view') material(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.material(a, id); }
  @Post('materials') @RequirePermission('training.materials') createMaterial(@CurrentActor() a: Actor, @Body(zodBody(matBody)) b: LearningMaterialInput & { version?: number }) { return this.s.saveMaterial(a, b); }
  @Put('materials/:id') @RequirePermission('training.materials') saveMaterial(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(matBody)) b: LearningMaterialInput & { version?: number }) { return this.s.saveMaterial(a, b, id); }
  @Post('materials/:id/archive') @HttpCode(200) @RequirePermission('training.materials') archiveMaterial(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.archiveMaterial(a, id); }

  @Get('practical') @RequireAnyPermission('exam.view', 'exam.conduct') practical(@Query(zodBody(z.object({ all: z.enum(['1', '0']).optional() }))) q: { all?: string }) { return this.s.practicalExams(q.all === '1'); }
  @Get('practical/:id') @RequireAnyPermission('exam.view', 'exam.conduct') practicalExam(@Param('id', ParseUUIDPipe) id: string) { return this.s.practicalExam(id); }
  @Post('practical') @RequirePermission('exam.create') createPractical(@CurrentActor() a: Actor, @Body(zodBody(practicalExamSchema)) b: PracticalExamInput) { return this.s.savePracticalExam(a, b); }
  @Put('practical/:id') @RequirePermission('exam.create') savePractical(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(practicalExamSchema)) b: PracticalExamInput) { return this.s.savePracticalExam(a, b, id); }

  @Get('assessments') @RequireAnyPermission('exam.conduct', 'exam.results', 'exam.manage')
  assessments(@CurrentActor() a: Actor, @Query(zodBody(z.object({ examId: uuid.optional(), status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(), personnelId: uuid.optional() }))) q: { examId?: string; status?: string; personnelId?: string }) { return this.s.assessments(a, q); }
  @Get('assessments/:id') @RequirePermission('dashboard.view') assessment(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.view(a, id); }
  @Post('practical/:id/assessments') @RequirePermission('exam.conduct')
  start(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ personnelId: uuid }))) b: { personnelId: string }) { return this.s.start(a, id, b.personnelId); }
  @Put('assessments/:id/scores') @RequirePermission('exam.conduct')
  scores(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ scores: z.record(z.string().max(40), z.object({ points: z.number(), note: z.string().max(1000).optional() })), remarks: z.string().max(4000).nullable().optional() }))) b: { scores: Record<string, { points: number; note?: string }>; remarks?: string | null }) { return this.s.saveScores(a, id, b); }
  @Post('assessments/:id/complete') @HttpCode(200) @RequirePermission('exam.conduct') complete(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.complete(a, id); }
  @Post('assessments/:id/cancel') @HttpCode(200) @RequirePermission('exam.conduct')
  cancel(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ reason: z.string().trim().min(3).max(500) }))) b: { reason: string }) { return this.s.cancel(a, id, b.reason); }
}
