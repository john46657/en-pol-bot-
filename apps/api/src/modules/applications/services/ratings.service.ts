import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ratingConfigSchema } from '@nexus/validation';
import { assertGuildId, prisma } from '@nexus/database';

export interface RatingField {
  id: string;
  label: string;
  max: number;
}

/** Felder aus der Konfiguration einer Bewerbungsart (leer = Bewertung ausgeschaltet). */
export function ratingFieldsOf(config: unknown): RatingField[] {
  const raw = (config as { rating?: unknown } | null)?.rating;
  const parsed = ratingConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data.fields : [];
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/**
 * Interne Bewertung (nur Team): je Bearbeiter und Feld ein Wert von 1 bis Höchstwert. Jeder ändert nur die eigene Bewertung;
 * angezeigt werden alle Einzelbewertungen sowie Mittelwerte je Feld und insgesamt (jeweils in Prozent des Höchstwerts normiert).
 */
@Injectable()
export class RatingsService {
  private async load(guildId: string, submissionId: string) {
    const s = await prisma.applicationSubmission.findFirst({ where: { id: submissionId, guildId: assertGuildId(guildId) }, include: { application: { select: { config: true, name: true } } } });
    if (!s) throw new NotFoundException('Bewerbung nicht gefunden.');
    return s;
  }

  async get(guildId: string, submissionId: string, userId: string) {
    const s = await this.load(guildId, submissionId);
    const fields = ratingFieldsOf(s.application.config);
    const rows = await prisma.applicationRating.findMany({ where: { guildId, submissionId }, orderBy: { updatedAt: 'asc' } });
    const byReviewer = new Map<string, Record<string, number>>();
    for (const r of rows) byReviewer.set(r.reviewerId, { ...(byReviewer.get(r.reviewerId) ?? {}), [r.fieldId]: r.value });
    const averages: Record<string, number | null> = {};
    for (const f of fields) averages[f.id] = avg(rows.filter((r) => r.fieldId === f.id).map((r) => r.value));
    // Gesamtwert: Mittel der je Feld auf 0–100 % normierten Mittelwerte
    const pct = fields.flatMap((f) => (averages[f.id] === null ? [] : [((averages[f.id] as number) / f.max) * 100]));
    return {
      enabled: fields.length > 0,
      fields,
      mine: byReviewer.get(userId) ?? {},
      reviewers: [...byReviewer.entries()].map(([reviewerId, values]) => ({ reviewerId, values })),
      averages,
      overallPercent: avg(pct),
    };
  }

  /** Setzt die eigene Bewertung: `null` entfernt ein Feld. Nur für eingereichte Bewerbungen. */
  async setMine(guildId: string, submissionId: string, userId: string, values: unknown) {
    const gid = assertGuildId(guildId);
    const s = await this.load(gid, submissionId);
    if (!s.submittedAt) throw new BadRequestException('Eine Bewerbung lässt sich erst nach dem Einreichen bewerten.');
    const fields = ratingFieldsOf(s.application.config);
    if (fields.length === 0) throw new BadRequestException('Für diese Bewerbungsart ist keine Bewertung eingerichtet.');
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new BadRequestException('Ungültige Bewertung.');
    const input = values as Record<string, unknown>;
    const changes: { field: RatingField; value: number | null }[] = [];
    for (const [fieldId, v] of Object.entries(input)) {
      const field = fields.find((f) => f.id === fieldId);
      if (!field) throw new BadRequestException(`Unbekanntes Bewertungsfeld: ${fieldId}.`);
      if (v === null) changes.push({ field, value: null });
      else if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= field.max) changes.push({ field, value: v });
      else throw new BadRequestException(`„${field.label}“: Wert von 1 bis ${field.max} oder leer.`);
    }
    const before = (await prisma.applicationRating.findMany({ where: { submissionId, reviewerId: userId } })).map((r) => [r.fieldId, r.value] as const);
    await prisma.$transaction(async (tx) => {
      for (const c of changes) {
        if (c.value === null) await tx.applicationRating.deleteMany({ where: { submissionId, reviewerId: userId, fieldId: c.field.id } });
        else await tx.applicationRating.upsert({ where: { submissionId_reviewerId_fieldId: { submissionId, reviewerId: userId, fieldId: c.field.id } }, create: { guildId: gid, submissionId, reviewerId: userId, fieldId: c.field.id, value: c.value }, update: { value: c.value } });
      }
    });
    const after = (await prisma.applicationRating.findMany({ where: { submissionId, reviewerId: userId } })).map((r) => [r.fieldId, r.value] as const);
    await prisma.applicationAuditEvent.create({ data: { guildId: gid, submissionId, actorType: 'USER', actorId: userId, action: 'submission.rated', before: Object.fromEntries(before), after: Object.fromEntries(after) } });
    return this.get(gid, submissionId, userId);
  }
}
