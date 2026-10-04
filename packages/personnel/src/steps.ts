import { registerAcceptStep, type PipelineContext } from '@nexus/automation';
import { PersonnelError } from './errors.js';
import {
  createRecord,
  entryRank,
  getRecordByUser,
  restoreRecord,
  setProbation,
  setRank,
  getNumberFormat,
  setServiceNumber,
  setTeam,
} from './service.js';

/**
 * Schritte der Annahme-Pipeline (Abschnitt 63), die die Personalakte betreffen. Sie hängen sich beim Import
 * dieses Pakets in `@nexus/automation` ein; vorher werden sie als „nicht verfügbar“ gemeldet.
 */
const opts = (ctx: PipelineContext) => ({
  automation: 'application-accept',
  permission: 'applications.submissions.accept',
  port: ctx.port,
});

async function recordOf(ctx: PipelineContext) {
  const record = await getRecordByUser(ctx.guildId, ctx.applicantId);
  if (!record) {
    throw new PersonnelError(
      'not-found',
      'Es gibt noch keine Personalakte (Schritt „Personalakte“ ist abgeschaltet oder fehlgeschlagen).',
    );
  }
  return record;
}

const testSkip = {
  skipped: true,
  detail: 'Test-Bewerbung: keine Änderung an Personalakten.',
} as const;

registerAcceptStep('personnelRecord', async (ctx) => {
  if (ctx.isTest) return testSkip;
  const existing = await getRecordByUser(ctx.guildId, ctx.applicantId);
  if (existing) {
    if (existing.status === 'ARCHIVED') {
      await restoreRecord(ctx.guildId, existing.id, ctx.reviewerId, opts(ctx));
      return { detail: `Archivierte Akte von „${existing.rpName}“ wiederhergestellt.` };
    }
    return { detail: `Bestehende Akte von „${existing.rpName}“ wird weiterverwendet.` };
  }
  const answered = ctx.onboarding.rpNameQuestionId
    ? ctx.answers[ctx.onboarding.rpNameQuestionId]
    : undefined;
  const fromAnswer = typeof answered === 'string' ? answered.trim() : '';
  const rpName = fromAnswer.length >= 2 ? fromAnswer.slice(0, 80) : ctx.displayName;
  const record = await createRecord(
    {
      guildId: ctx.guildId,
      userId: ctx.applicantId,
      rpName,
      actorId: ctx.reviewerId,
      sourceSubmissionId: ctx.submissionId,
    },
    opts(ctx),
  );
  return { detail: `Akte für „${record.rpName}“ angelegt.` };
});

registerAcceptStep('serviceNumber', async (ctx) => {
  if (ctx.isTest) return testSkip;
  const record = await recordOf(ctx);
  if (record.serviceNumber)
    return { detail: `Dienstnummer ${record.serviceNumber} war bereits vergeben.` };
  const mode = (await getNumberFormat(ctx.guildId)).assign;
  if (mode !== 'ACCEPT')
    return { skipped: true, detail: mode === 'TRAINING' ? 'Die Dienstnummer wird nach der ersten bestandenen Ausbildung vergeben.' : 'Die Dienstnummer wird manuell vergeben.' };
  const updated = await setServiceNumber(ctx.guildId, record.id, 'auto', ctx.reviewerId, opts(ctx));
  return { detail: `Dienstnummer ${updated.serviceNumber} vergeben.` };
});

registerAcceptStep('startRank', async (ctx) => {
  if (ctx.isTest) return testSkip;
  const record = await recordOf(ctx);
  if (record.rankId)
    return { skipped: true, detail: `Dienstgrad „${record.rank?.name}“ ist bereits gesetzt.` };
  const rank = await entryRank(ctx.guildId, ctx.onboarding.rankId);
  if (!rank)
    throw new PersonnelError(
      'invalid',
      'Kein Einstiegsdienstgrad konfiguriert (Dashboard → Personal → Dienstgrade).',
    );
  const { roleChange } = await setRank(ctx.guildId, record.id, rank.id, ctx.reviewerId, opts(ctx));
  if (roleChange && roleChange.status !== 'success') {
    throw new PersonnelError(
      'invalid',
      `Dienstgrad „${rank.name}“ gesetzt, aber die Rolle fehlt noch: ${roleChange.message}`,
    );
  }
  return { detail: `Dienstgrad „${rank.name}“ gesetzt.` };
});

registerAcceptStep('team', async (ctx) => {
  if (ctx.isTest) return testSkip;
  if (!ctx.onboarding.teamId) return { skipped: true, detail: 'Kein Team konfiguriert.' };
  const record = await recordOf(ctx);
  if (record.teamId === ctx.onboarding.teamId)
    return { skipped: true, detail: `Bereits im Team „${record.team?.name}“.` };
  const { record: updated, roleChange } = await setTeam(
    ctx.guildId,
    record.id,
    ctx.onboarding.teamId,
    ctx.reviewerId,
    opts(ctx),
  );
  if (roleChange && roleChange.status !== 'success') {
    throw new PersonnelError(
      'invalid',
      `Team „${updated.team?.name}“ gesetzt, aber die Teamrolle fehlt noch: ${roleChange.message}`,
    );
  }
  return { detail: `Team „${updated.team?.name}“ zugewiesen.` };
});

registerAcceptStep('probation', async (ctx) => {
  if (ctx.isTest) return testSkip;
  const days = ctx.onboarding.probationDays ?? 0;
  if (days <= 0) return { skipped: true, detail: 'Keine Probezeit konfiguriert.' };
  const record = await recordOf(ctx);
  const endsAt = new Date(Date.now() + days * 86_400_000);
  await setProbation(ctx.guildId, record.id, endsAt, ctx.reviewerId, opts(ctx));
  return { detail: `Probezeit bis ${endsAt.toLocaleDateString('de-DE')} (${days} Tage).` };
});
