import { prisma } from './client.js';

/** Erlaubtes Präfix der Bewerbungs-ID: 1–8 Buchstaben/Ziffern. */
export const ID_PREFIX_PATTERN = /^[A-Za-z0-9]{1,8}$/;
export const DEFAULT_ID_PREFIX = 'SUB';
export const formatSubmissionNumber = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, '0')}`;

/**
 * Vergibt die menschenlesbare Bewerbungs-ID (z. B. POL-00152) beim Einreichen: fortlaufend je Server und Präfix, atomar,
 * höchstens einmal je Bewerbung (wiederholtes Aufrufen liefert dieselbe Nummer).
 */
export async function assignSubmissionNumber(submissionId: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const s = await tx.applicationSubmission.findUnique({
      where: { id: submissionId },
      select: { guildId: true, submissionNumber: true, isTest: true, application: { select: { idPrefix: true } } },
    });
    if (!s) return null;
    if (s.submissionNumber) return s.submissionNumber;
    const raw = s.application.idPrefix;
    const base = raw && ID_PREFIX_PATTERN.test(raw) ? raw.toUpperCase() : DEFAULT_ID_PREFIX;
    const prefix = s.isTest ? `T${base}`.slice(0, 9) : base; // Testbewerbungen zählen getrennt
    const c = await tx.applicationNumberCounter.upsert({
      where: { guildId_prefix: { guildId: s.guildId, prefix } },
      create: { guildId: s.guildId, prefix, last: 1 },
      update: { last: { increment: 1 } },
    });
    const number = formatSubmissionNumber(prefix, c.last);
    await tx.applicationSubmission.update({ where: { id: submissionId }, data: { submissionNumber: number } });
    return number;
  });
}
