import type { PrismaClient } from '@prisma/client';
import { defaultTicketButtons, TICKET_STATUS_KEYS, type TicketQuestion, type TicketStatusKey } from '@enrp/shared';

/** Merker: Abteilungen, Standard-Kategorien und das Ticket-Center-Panel wurden einmal angelegt (gelöschte kommen nicht zurück). */
const MARK = 'tickets.premiumSeeded';

/** Status mit fester Bedeutung, die der Lebenszyklus braucht (Name, Art, Farbe, Emoji). */
const LIFECYCLE: [TicketStatusKey, string, string, number, string][] = [
  ['OPEN', 'Offen', 'OPEN', 0x22c55e, '🟢'], ['CLAIMED', 'Übernommen', 'OPEN', 0x6366f1, '👤'], ['IN_PROGRESS', 'In Bearbeitung', 'OPEN', 0x3b82f6, '🔵'],
  ['WAITING_USER', 'Wartet auf Nutzer', 'OPEN', 0xeab308, '🟡'], ['WAITING_INTERNAL', 'Wartet auf interne Rückmeldung', 'OPEN', 0xf97316, '🟠'],
  ['RESOLVED', 'Gelöst', 'OPEN', 0x10b981, '✅'], ['CLOSED', 'Geschlossen', 'CLOSED', 0x64748b, '⚫'], ['ARCHIVED', 'Archiviert', 'ARCHIVED', 0x475569, '📦'],
];
const ALIASES: Partial<Record<TicketStatusKey, string[]>> = { WAITING_USER: ['wartet auf benutzer'], WAITING_INTERNAL: ['wartet auf team'] };

const DEPARTMENTS = [
  { name: 'Allgemeiner Support', emoji: '📩', description: 'Allgemeine Anliegen, Fragen und Vorschläge.' },
  { name: 'Technik', emoji: '🛠️', description: 'Technische Probleme mit Discord, Dashboard und Bot.' },
  { name: 'Personalabteilung', emoji: '🪪', description: 'Bewerbungen und Personalangelegenheiten (vertraulich).' },
  { name: 'Beschwerdestelle', emoji: '⚖️', description: 'Beschwerden über Mitglieder oder Abläufe (vertraulich).' },
  { name: 'Leitung', emoji: '🛡️', description: 'Leitung und vertrauliche Anliegen.' },
  { name: 'Öffentlichkeitsarbeit', emoji: '🤝', description: 'Partnerschaften und externe Anfragen.' },
];

const subject: TicketQuestion = { id: 'subject', label: 'Betreff', type: 'SHORT', required: true, options: [], maxLength: 100, placeholder: 'Kurz: Worum geht es?' };
const describe = (help: string): TicketQuestion => ({ id: 'description', label: 'Beschreibung des Anliegens', type: 'LONG', required: true, options: [], minLength: 10, maxLength: 2000, description: help });
const file: TicketQuestion = { id: 'attachment', label: 'Anhang oder Screenshot', type: 'FILE', required: false, options: [], max: 3, description: 'Optional: Bilder, PDF oder Text (max. 8 MB). Weitere Dateien kannst du im Ticket-Kanal anhängen.' };

/** Verbindliche Konfiguration „Sonstiges“ (Formular wie vorgegeben). */
export const SONSTIGES_FORM: TicketQuestion[] = [
  subject,
  { id: 'topic', label: 'Worum geht es?', type: 'SELECT', required: true, options: ['Allgemeine Frage', 'Verbesserungsvorschlag', 'Technisches Problem', 'Hilfe bei einer Funktion', 'Rückfrage zu einem bestehenden Vorgang', 'Anliegen an die Verwaltung', 'Sonstiges'] },
  describe('Beschreibe dein Anliegen möglichst genau. Nenne relevante Informationen und erkläre, wobei du Unterstützung benötigst.'),
  { id: 'area', label: 'Betroffener Bereich', type: 'SELECT', required: false, options: ['Discord-Server', 'Web-Dashboard', 'Bot-Funktion', 'Polizei-Rollenspiel', 'Personal oder Dienstbetrieb', 'Sonstiger Bereich', 'Nicht zutreffend'] },
  { id: 'details', label: 'Zusätzliche Informationen', type: 'LONG', required: false, options: [], maxLength: 2000 },
  file,
];

interface CatDef { name: string; emoji: string; description: string; department: string; confidential?: boolean; priority?: string; form: TicketQuestion[]; welcome?: string }
const CATEGORIES: CatDef[] = [
  { name: 'Beschwerden', emoji: '⚖️', description: 'Beschwerde über ein Mitglied oder einen Ablauf', department: 'Beschwerdestelle', confidential: true, form: [subject,
    { id: 'concerns', label: 'Wen oder was betrifft die Beschwerde?', type: 'SHORT', required: true, options: [], maxLength: 200 },
    { id: 'when', label: 'Wann ist es passiert?', type: 'DATE', required: false, options: [] },
    describe('Schildere den Vorfall sachlich und möglichst vollständig.'), file] },
  { name: 'Support und technische Probleme', emoji: '🛠️', description: 'Fehler, Störungen, Probleme mit Discord, Dashboard oder Bot', department: 'Technik', form: [subject,
    { id: 'area', label: 'Wo tritt das Problem auf?', type: 'SELECT', required: true, options: ['Discord-Server', 'Web-Dashboard', 'Bot-Funktion', 'Sonstiges'] },
    describe('Was hast du gemacht, was ist passiert und was hättest du erwartet?'), file] },
  { name: 'Allgemeine Fragen', emoji: '❓', description: 'Fragen rund um den Server und das Team', department: 'Allgemeiner Support', form: [subject, describe('Stelle deine Frage möglichst konkret.')] },
  { name: 'Bewerbungen und Personalangelegenheiten', emoji: '🪪', description: 'Fragen zu Bewerbungen, Rang, Dienst und Personalakte', department: 'Personalabteilung', confidential: true, form: [subject,
    { id: 'topic', label: 'Thema', type: 'SELECT', required: true, options: ['Bewerbung', 'Beförderung / Rang', 'Abmeldung / Dienst', 'Personalakte', 'Sonstiges'] },
    describe('Beschreibe dein Anliegen. Vertrauliche Angaben sieht nur die Personalabteilung.')] },
  { name: 'Leitung und vertrauliche Anliegen', emoji: '🛡️', description: 'Nur für die Leitung bestimmte Anliegen', department: 'Leitung', confidential: true, priority: 'Hoch', form: [subject, describe('Dein Anliegen wird ausschließlich von der Leitung gelesen.')] },
  { name: 'Vorschläge und Verbesserungen', emoji: '💡', description: 'Ideen für Server, Dashboard oder Abläufe', department: 'Allgemeiner Support', form: [subject,
    { id: 'area', label: 'Bereich', type: 'SELECT', required: false, options: ['Discord-Server', 'Web-Dashboard', 'Bot-Funktion', 'Polizei-Rollenspiel', 'Sonstiges'] },
    describe('Beschreibe deinen Vorschlag und welchen Nutzen er bringt.')] },
  { name: 'Partnerschaften und externe Anfragen', emoji: '🤝', description: 'Partneranfragen und Anfragen von außen', department: 'Öffentlichkeitsarbeit', form: [subject,
    { id: 'org', label: 'Organisation / Server', type: 'SHORT', required: true, options: [], maxLength: 100 },
    describe('Stelle dich bzw. deine Organisation kurz vor und beschreibe die Anfrage.')] },
  { name: 'Sonstiges', emoji: '📩', description: 'Für alle Anliegen, die keiner anderen Kategorie zugeordnet werden können.', department: 'Allgemeiner Support', priority: 'Normal', form: SONSTIGES_FORM,
    welcome: 'Hallo {user}!\n\nDanke für dein Ticket **{ticket_ref}**. Ein Mitglied des allgemeinen Supports kümmert sich darum. Dateien kannst du jederzeit hier im Kanal anhängen.' },
];

/**
 * Premium-Ticket-System: fehlende Lebenszyklus-Status und Prioritäten ergänzen (jeder Start, nur Fehlendes) und einmalig
 * Abteilungen, die 8 Standard-Kategorien und ein Ticket-Center-Panel anlegen. Vorhandene Einträge (gleicher Name) werden
 * wiederverwendet und nie überschrieben.
 */
export async function seedTicketPremium(prisma: PrismaClient) {
  const statuses = await prisma.ticketStatus.findMany({ orderBy: { position: 'asc' } });
  let pos = statuses.reduce((m, s) => Math.max(m, s.position), -1) + 1;
  for (const [key, name, kind, color, emoji] of LIFECYCLE) {
    if (statuses.some((s) => s.key === key)) continue;
    const names = [name.toLowerCase(), ...(ALIASES[key] ?? [])];
    const same = statuses.find((s) => !s.key && s.kind === kind && names.includes(s.name.toLowerCase()));
    if (same) { await prisma.ticketStatus.update({ where: { id: same.id }, data: { key } }); same.key = key; continue; }
    statuses.push(await prisma.ticketStatus.create({ data: { key, name: TICKET_STATUS_KEYS[key], kind, color, emoji, position: pos++ } }));
  }
  const prios = await prisma.ticketPriority.findMany();
  let ppos = prios.reduce((m, p) => Math.max(m, p.position), -1) + 1;
  for (const [name, emoji, color] of [['Niedrig', '🔵', 0x3b82f6], ['Normal', '🟢', 0x22c55e], ['Hoch', '🟡', 0xeab308], ['Dringend', '🟠', 0xf97316]] as const) {
    if (!prios.some((p) => p.name.toLowerCase() === name.toLowerCase())) prios.push(await prisma.ticketPriority.create({ data: { name, emoji, color, position: ppos++ } }));
  }

  if (await prisma.systemSetting.findUnique({ where: { key: MARK } })) return;
  const deps = new Map<string, string>();
  for (const [i, d] of DEPARTMENTS.entries()) {
    const found = await prisma.ticketDepartment.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } });
    deps.set(d.name, (found ?? await prisma.ticketDepartment.create({ data: { ...d, position: i } })).id);
  }
  const ids: string[] = [];
  const existing = await prisma.ticketCategory.findMany({ select: { id: true, name: true, position: true } });
  let cpos = existing.reduce((m, c) => Math.max(m, c.position), -1) + 1;
  for (const c of CATEGORIES) {
    const found = existing.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
    if (found) { ids.push(found.id); continue; } // gleichnamige Kategorie: wiederverwenden, nicht verändern
    const priority = c.priority ? prios.find((p) => p.name === c.priority) : null;
    const cat = await prisma.ticketCategory.create({ data: {
      name: c.name, emoji: c.emoji, description: c.description, position: cpos++, departmentId: deps.get(c.department) ?? null, confidential: !!c.confidential,
      formMode: 'MODAL', formVersion: 1, questions: c.form as unknown as object, buttons: defaultTicketButtons() as unknown as object,
      channelNameFormat: `${c.confidential ? 'vertraulich' : 'ticket'}-{ticket_id}`, defaultPriorityId: priority?.id ?? null,
      welcomeTitle: `${c.emoji} {category} · {ticket_ref}`,
      welcomeMessage: c.welcome ?? 'Hallo {user}!\n\nDanke für dein Ticket **{ticket_ref}**. Das zuständige Team meldet sich hier. Dateien kannst du jederzeit hier im Kanal anhängen.',
      ...(c.confidential ? { transcriptToUser: false, closeRemovesAccess: true, creatorCanAddUsers: false } : {}),
    } });
    await prisma.ticketFormVersion.create({ data: { categoryId: cat.id, version: 1, fields: c.form as unknown as object, createdByName: 'Standardkonfiguration' } });
    ids.push(cat.id);
  }
  if (!(await prisma.ticketPanel.findFirst({ where: { name: 'Ticket-Center' } }))) {
    await prisma.ticketPanel.create({ data: {
      name: 'Ticket-Center', emoji: '🎫', title: 'EN | POLIZEI – STADT EMDEN NETWORK · Ticket-Center', style: 'DROPDOWN', placeholder: 'Wähle die Art deines Anliegens …', categoryIds: ids, color: 0x1e3a8a,
      description: 'Wähle unten die passende Kategorie. Danach öffnet sich ein kurzes Formular; dein Ticket erhält eine eindeutige Ticket-ID.\n\nVertrauliche Anliegen sieht nur die zuständige Abteilung.',
    } });
  }
  await prisma.systemSetting.create({ data: { key: MARK, value: { at: new Date().toISOString(), categories: ids.length } } });
}
