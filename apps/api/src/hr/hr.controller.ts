import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { dnSettingsSchema, DN_STATUSES, hrConfigSchema, rangeSchema, rankSchema, type DnSettings, type HrConfig, type RangeInput, type RankInput } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { HrCoreService } from './hr-core.service';
import { HrPeopleService, RECORD_TYPES } from './hr-people.service';
import { HrRequestsService } from './hr-requests.service';
import { examSchema, HrTrainingService, trainingSchema, TRAINING_STATUSES } from './hr-training.service';
import { announcementSchema, HrCommsService, pollSchema } from './hr-comms.service';
import { ServiceNumbersService } from './service-numbers.service';

const uuid = z.string().uuid();
const date = z.string().date();
const reason = z.object({ reason: z.string().trim().max(1000).optional() });

// ───────────── Personal ─────────────
const overviewQ = z.object({ q: z.string().max(80).optional(), status: z.string().max(32).optional(), rank: z.string().max(64).optional(), department: z.string().max(64).optional(), state: z.enum(['active', 'inactive', 'absent']).optional() });
const createP = z.object({ userId: uuid.optional(), discordId: z.string().regex(/^\d{15,25}$/).optional(), name: z.string().max(64).optional(), rank: z.string().max(64).nullable().optional(), department: z.string().max(64).nullable().optional(), status: z.string().max(32).optional(), joinDate: date.optional(), callsign: z.string().max(16).nullable().optional() });
const updateP = z.object({ department: z.string().max(64).nullable().optional(), office: z.string().max(64).nullable().optional(), status: z.string().max(32).optional(), joinDate: date.optional(), callsign: z.string().max(16).nullable().optional(), rank: z.string().max(64).nullable().optional(), rankSince: date.optional() });
const record = z.object({ type: z.enum(RECORD_TYPES), summary: z.string().trim().min(2).max(300), details: z.string().max(5000).optional(), category: z.string().max(60).optional(), severity: z.string().max(32).optional(), expiresAt: z.string().datetime({ offset: true }).nullable().optional(), awardId: uuid.optional(), attachments: z.array(uuid).max(10).optional() });
const editRecord = z.object({ summary: z.string().trim().min(2).max(300).optional(), details: z.string().max(5000).nullable().optional(), status: z.enum(['ACTIVE', 'REVOKED']).optional(), expiresAt: z.string().datetime({ offset: true }).nullable().optional(), category: z.string().max(60).optional() });

@ApiTags('hr')
@Controller('hr')
export class HrController {
  constructor(private readonly core: HrCoreService, private readonly people: HrPeopleService) {}
  @Get('config') @RequirePermission('personnel.view') config() { return this.core.config(); }
  /** Abwesenheitsarten für den Abmeldeantrag (alle im Dashboard). */
  @Get('absence-types') @RequirePermission('dashboard.view') async absenceTypes() { return (await this.core.config()).absenceTypes; }
  @Put('config') @RequirePermission('promotion.manage_settings') saveConfig(@CurrentActor() a: Actor, @Body(zodBody(hrConfigSchema)) b: HrConfig) { return this.core.saveConfig(a, b); }

  @Get('people') @RequirePermission('personnel.view') overview(@CurrentActor() a: Actor, @Query(zodBody(overviewQ)) q: z.infer<typeof overviewQ>) { return this.people.overview(a, q); }
  @Post('people') @RequirePermission('personnel.create') create(@CurrentActor() a: Actor, @Body(zodBody(createP)) b: z.infer<typeof createP>) { return this.people.create(a, b); }
  @Get('people/:id') @RequirePermission('personnel.view') profile(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.people.profile(a, id); }
  @Patch('people/:id') @RequirePermission('personnel.edit') update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(updateP)) b: z.infer<typeof updateP>) { return this.people.update(a, id, b); }
  @Delete('people/:id') @HttpCode(204) @RequirePermission('personnel.delete') remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.people.remove(a, id); }
  /** Verwarnungen (Übersicht) und Verwarnen über Discord (/verwarnen). */
  @Get('warnings') @RequirePermission('warning.view') warnings(@CurrentActor() a: Actor, @Query(zodBody(z.object({ state: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ALL']).optional(), q: z.string().trim().max(80).optional() }))) q: { state?: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ALL'; q?: string }) { return this.people.warnings(a, q); }
  @Post('warnings/discord') @RequirePermission('warning.create') warnDiscord(@CurrentActor() a: Actor, @Body(zodBody(z.object({ discordId: z.string().regex(/^\d{15,25}$/), reason: z.string().trim().min(2).max(300), severity: z.string().max(32).optional() }))) b: { discordId: string; reason: string; severity?: string }) { return this.people.warnByDiscord(a, b); }
  @Post('people/:id/records') @RequirePermission('personnel.view') addRecord(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(record)) b: z.infer<typeof record>) { return this.people.addRecord(a, id, b); }
  @Patch('records/:id') @RequirePermission('personnel.view') editRecord(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(editRecord)) b: z.infer<typeof editRecord>) { return this.people.editRecord(a, id, b); }
  @Delete('records/:id') @HttpCode(204) @RequirePermission('personnel.view') deleteRecord(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(reason)) b: z.infer<typeof reason>) { return this.people.deleteRecord(a, id, b.reason); }
  @Put('people/:id/checks/:req') @RequirePermission('promotion.manage_requirements')
  check(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('req', ParseUUIDPipe) req: string, @Body(zodBody(z.object({ value: z.boolean() }))) b: { value: boolean }) { return this.people.setCheck(a, id, req, b.value); }

  // Ränge
  @Get('ranks') @RequirePermission('personnel.view') ranks() { return this.core.ranks(); }
  @Post('ranks') @RequirePermission('promotion.manage_ranks') createRank(@CurrentActor() a: Actor, @Body(zodBody(rankSchema)) b: RankInput) { return this.core.saveRank(a, b); }
  @Put('ranks/order') @RequirePermission('promotion.manage_ranks') order(@CurrentActor() a: Actor, @Body(zodBody(z.object({ ids: z.array(uuid).max(200) }))) b: { ids: string[] }) { return this.core.reorderRanks(a, b.ids); }
  @Put('ranks/:id') @RequirePermission('promotion.manage_ranks') saveRank(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(rankSchema)) b: RankInput) { return this.core.saveRank(a, b, id); }
  @Delete('ranks/:id') @HttpCode(204) @RequirePermission('promotion.manage_ranks') deleteRank(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.core.deleteRank(a, id); }
}

// ───────────── Beförderungen & Versetzungen ─────────────
const kind = z.enum(['PROMOTION', 'TRANSFER']);
const reqQ = z.object({ kind: kind.optional(), status: z.string().max(20).optional(), personnelId: uuid.optional(), rank: z.string().max(64).optional(), department: z.string().max(64).optional(), requesterId: uuid.optional(), approverId: uuid.optional(), from: date.optional(), to: date.optional(), q: z.string().max(80).optional() });
const createR = z.object({ kind, personnelId: uuid, to: z.string().min(1).max(64), reason: z.string().trim().max(2000).default(''), achievements: z.string().max(4000).optional(), internalNote: z.string().max(2000).optional(), attachments: z.array(uuid).max(10).optional() });
const editR = z.object({ reason: z.string().trim().min(1).max(2000).optional(), achievements: z.string().max(4000).nullable().optional(), internalNote: z.string().max(2000).nullable().optional(), attachments: z.array(uuid).max(10).optional(), version: z.number().int().optional() });
const decide = z.object({ decision: z.enum(['APPROVE', 'REJECT', 'REVIEW', 'DEFER', 'CANCEL']), comment: z.string().max(1000).optional() });

@ApiTags('hr')
@Controller('hr/requests')
export class HrRequestsController {
  constructor(private readonly s: HrRequestsService) {}
  /** Liste braucht promotion.view ODER transfer.view – geprüft je Art */
  @Get() @RequirePermission('personnel.view') list(@CurrentActor() a: Actor, @Query(zodBody(reqQ)) q: z.infer<typeof reqQ>) { return this.s.list(a, q); }
  @Get('stats') @RequirePermission('promotion.view') stats() { return this.s.stats(); }
  @Get(':id') @RequirePermission('personnel.view') get(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(a, id); }
  @Post() @RequirePermission('personnel.view') create(@CurrentActor() a: Actor, @Body(zodBody(createR)) b: z.infer<typeof createR>) { return this.s.create(a, b); }
  @Patch(':id') @RequirePermission('personnel.view') edit(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(editR)) b: z.infer<typeof editR>) { return this.s.edit(a, id, b); }
  @Post(':id/decide') @HttpCode(200) @RequirePermission('personnel.view') decide(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(decide)) b: z.infer<typeof decide>) { return this.s.decide(a, id, b.decision, b.comment); }
  @Post(':id/execute') @HttpCode(200) @RequirePermission('personnel.view') execute(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.execute(a, id); }
}

// ───────────── Ausbildungen & Prüfungen ─────────────
const progress = z.object({ trainingId: uuid, personnelId: uuid, status: z.enum(TRAINING_STATUSES), progress: z.number().int().min(0).max(100).optional(), note: z.string().max(1000).nullable().optional() });

@ApiTags('hr')
@Controller('hr')
export class HrTrainingController {
  constructor(private readonly s: HrTrainingService) {}
  @Get('trainings') @RequirePermission('training.view') async trainings() { await this.s.expire(); return this.s.trainings(); }
  @Post('trainings') @RequirePermission('training.create') create(@CurrentActor() a: Actor, @Body(zodBody(trainingSchema)) b: z.infer<typeof trainingSchema>) { return this.s.saveTraining(a, b); }
  @Put('trainings/:id') @RequirePermission('training.manage') save(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(trainingSchema)) b: z.infer<typeof trainingSchema>) { return this.s.saveTraining(a, b, id); }
  @Delete('trainings/:id') @HttpCode(204) @RequirePermission('training.manage') remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteTraining(a, id); }
  @Get('trainings/:id/progress') @RequirePermission('training.view') progressOf(@Param('id', ParseUUIDPipe) id: string) { return this.s.progressOf(id); }
  @Put('training-progress') @RequirePermission('training.view') setProgress(@CurrentActor() a: Actor, @Body(zodBody(progress)) b: z.infer<typeof progress>) { return this.s.setProgress(a, b); }
  @Get('certificates/:no') @RequirePermission('dashboard.view') certificate(@CurrentActor() a: Actor, @Param('no') no: string) { return this.s.certificate(a, no.slice(0, 20)); }

  @Get('exams') @RequirePermission('exam.view') exams(@CurrentActor() a: Actor) { return this.s.exams(a); }
  @Post('exams') @RequirePermission('exam.create') createExam(@CurrentActor() a: Actor, @Body(zodBody(examSchema)) b: z.infer<typeof examSchema>) { return this.s.saveExam(a, b); }
  @Put('exams/:id') @RequirePermission('exam.manage') saveExam(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(examSchema)) b: z.infer<typeof examSchema>) { return this.s.saveExam(a, b, id); }
  @Delete('exams/:id') @HttpCode(204) @RequirePermission('exam.manage') deleteExam(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteExam(a, id); }
  @Post('exams/:id/start') @HttpCode(200) @RequirePermission('exam.view') start(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.start(a, id); }
  @Get('attempts') @RequirePermission('exam.view') attempts(@CurrentActor() a: Actor, @Query('examId') examId?: string) { return this.s.attempts(a, examId && /^[0-9a-f-]{36}$/.test(examId) ? examId : undefined); }
  @Get('attempts/:id') @RequirePermission('exam.view') attempt(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.view(id, a); }
  @Put('attempts/:id/answers') @RequirePermission('exam.view') answers(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ answers: z.record(z.string().max(40), z.unknown()) }))) b: { answers: Record<string, unknown> }) { return this.s.saveAnswers(a, id, b.answers); }
  @Post('attempts/:id/submit') @HttpCode(200) @RequirePermission('exam.view') submit(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ answers: z.record(z.string().max(40), z.unknown()) }))) b: { answers: Record<string, unknown> }) { return this.s.submit(a, id, b.answers); }
  @Post('attempts/:id/grade') @HttpCode(200) @RequirePermission('exam.view') grade(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ scores: z.record(z.string().max(40), z.number().min(0).max(100)), feedback: z.string().max(2000).optional() }))) b: { scores: Record<string, number>; feedback?: string }) { return this.s.grade(a, id, b); }
}

// ───────────── Meldungen & Abstimmungen ─────────────
@ApiTags('hr')
@Controller('hr')
export class HrCommsController {
  constructor(private readonly s: HrCommsService) {}
  @Get('announcements') @RequirePermission('announcements.view') list(@CurrentActor() a: Actor, @Query('all') all?: string) { return this.s.announcements(a, all === '1'); }
  @Post('announcements') @RequirePermission('announcements.create') create(@CurrentActor() a: Actor, @Body(zodBody(announcementSchema)) b: z.infer<typeof announcementSchema>) { return this.s.saveAnnouncement(a, b); }
  @Put('announcements/:id') @RequirePermission('announcements.create') save(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(announcementSchema)) b: z.infer<typeof announcementSchema>) { return this.s.saveAnnouncement(a, b, id); }
  @Delete('announcements/:id') @HttpCode(204) @RequirePermission('announcements.create') remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteAnnouncement(a, id); }
  @Post('announcements/:id/ack') @HttpCode(200) @RequirePermission('announcements.view') ack(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.ack(a, id); }
  @Get('announcements/:id/readers') @RequirePermission('announcements.create') readers(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.readers(a, id); }

  @Get('polls') @RequirePermission('polls.view') polls(@CurrentActor() a: Actor) { return this.s.polls(a); }
  @Post('polls') @RequirePermission('polls.create') createPoll(@CurrentActor() a: Actor, @Body(zodBody(pollSchema)) b: z.infer<typeof pollSchema>) { return this.s.savePoll(a, b); }
  @Put('polls/:id') @RequirePermission('polls.create') savePoll(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(pollSchema)) b: z.infer<typeof pollSchema>) { return this.s.savePoll(a, b, id); }
  @Delete('polls/:id') @HttpCode(204) @RequirePermission('polls.create') deletePoll(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deletePoll(a, id); }
  @Post('polls/:id/vote') @HttpCode(200) @RequirePermission('polls.view') vote(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ optionIds: z.array(z.string().max(40)).min(1).max(20) }))) b: { optionIds: string[] }) { return this.s.vote(a, id, b.optionIds); }
}

// ───────────── Dienstnummern ─────────────
const listQ = z.object({ status: z.enum(DN_STATUSES).optional(), rangeId: uuid.optional(), q: z.string().max(80).optional(), department: z.string().max(64).optional(), rank: z.string().max(64).optional(), limit: z.coerce.number().int().min(1).max(1000).optional() });
const assign = z.object({ personnelId: uuid, display: z.string().trim().min(1).max(40).optional(), rangeId: uuid.optional(), reason: z.string().max(500).optional() });
const change = assign.extend({ reason: z.string().trim().min(3).max(500), approverId: uuid.nullable().optional() });
const status = z.object({ display: z.string().trim().min(1).max(40), reason: z.string().max(500).optional(), userId: uuid.optional() });

@ApiTags('hr')
@Controller('dienstnummern')
export class ServiceNumbersController {
  constructor(private readonly s: ServiceNumbersService) {}
  @Get() @RequirePermission('dienstnummer.view') list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(q); }
  @Get('ranges') @RequirePermission('dienstnummer.view') ranges() { return this.s.ranges(); }
  @Post('ranges') @RequirePermission('dienstnummer.manage_ranges') createRange(@CurrentActor() a: Actor, @Body(zodBody(rangeSchema)) b: RangeInput) { return this.s.saveRange(a, b); }
  @Put('ranges/:id') @RequirePermission('dienstnummer.manage_ranges') saveRange(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(rangeSchema)) b: RangeInput) { return this.s.saveRange(a, b, id); }
  @Delete('ranges/:id') @HttpCode(204) @RequirePermission('dienstnummer.manage_ranges') deleteRange(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.s.deleteRange(a, id); }
  @Get('settings') @RequirePermission('dienstnummer.view') settings() { return this.s.settings(); }
  @Put('settings') @RequirePermission('dienstnummer.manage_settings') saveSettings(@CurrentActor() a: Actor, @Body(zodBody(dnSettingsSchema)) b: DnSettings) { return this.s.saveSettings(a, b); }
  @Get('history') @RequirePermission('dienstnummer.history') history(@Query(zodBody(z.object({ display: z.string().max(40).optional(), personnelId: uuid.optional(), userId: uuid.optional() }))) q: { display?: string; personnelId?: string; userId?: string }) { return this.s.history(q); }
  @Get('pending') @RequirePermission('dienstnummer.view') pending() { return this.s.pending(); }
  /** Angenommene Bewerbungen ohne Personalakte nachträglich übernehmen. */
  @Post('from-applications') @HttpCode(200) @RequirePermission('personnel.create') fromApplications(@CurrentActor() a: Actor) { return this.s.profilesFromApplications(a); }
  @Post('pending/:id/confirm') @HttpCode(200) @RequirePermission('dienstnummer.assign') confirm(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(z.object({ display: z.string().trim().max(40).optional() }))) b: { display?: string }) { return this.s.confirmPending(a, id, b.display || undefined); }
  @Post('assign') @HttpCode(200) @RequirePermission('dienstnummer.assign') assign(@CurrentActor() a: Actor, @Body(zodBody(assign)) b: z.infer<typeof assign>) { return this.s.assignManual(a, b); }
  @Post('change') @HttpCode(200) @RequirePermission('dienstnummer.edit') change(@CurrentActor() a: Actor, @Body(zodBody(change)) b: z.infer<typeof change>) { return this.s.change(a, b); }
  @Post('release') @HttpCode(200) @RequirePermission('dienstnummer.release') release(@CurrentActor() a: Actor, @Body(zodBody(status.extend({ as: z.enum(['FREE', 'FORMER']).default('FREE') }))) b: z.infer<typeof status> & { as: 'FREE' | 'FORMER' }) { return this.s.setStatus(a, b.display, b.as, b.reason); }
  @Post('block') @HttpCode(200) @RequirePermission('dienstnummer.block') block(@CurrentActor() a: Actor, @Body(zodBody(status)) b: z.infer<typeof status>) { return this.s.setStatus(a, b.display, 'BLOCKED', b.reason); }
  @Post('unblock') @HttpCode(200) @RequirePermission('dienstnummer.block') unblock(@CurrentActor() a: Actor, @Body(zodBody(status)) b: z.infer<typeof status>) { return this.s.setStatus(a, b.display, 'UNBLOCK', b.reason); }
  @Post('reserve') @HttpCode(200) @RequirePermission('dienstnummer.create') reserve(@CurrentActor() a: Actor, @Body(zodBody(status)) b: z.infer<typeof status>) { return this.s.setStatus(a, b.display, 'RESERVED', b.reason, b.userId); }
}
