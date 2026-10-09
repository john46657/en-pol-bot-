import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, areaGrantsFor, defaultTicketButtons, PermissionKey } from '@enrp/shared';

const only = (...mods: string[]): PermissionKey[] => ALL_PERMISSIONS.filter((p) => mods.includes(p.split('.')[0] ?? ''));
const pick = (...keys: PermissionKey[]) => keys;

/** Startrollen – Administratoren können eigene Rollen anlegen und diese ändern. */
export const STARTER_ROLES: Record<string, { description: string; grants: readonly string[] }> = {
  'Police Member': { description: 'Standard-Polizeibenutzer', grants: [
    ...pick('dashboard.view', 'dashboard.customize', 'team.view', 'dispatch.view', 'incidents.view', 'incidents.create', 'persons.view', 'persons.create', 'vehicles.view', 'vehicles.create', 'weapons.view', 'weapons.create', 'reports.view', 'reports.create', 'reports.edit', 'reports.submit', 'tickets.view', 'tickets.create', 'complaints.create', 'wanted.view', 'evidence.view', 'evidence.create', 'communication.view', 'communication.send', 'leave.request', 'cad.view', 'cad.radio', 'fleet.view', 'fleet.view_details', 'dutyreports.view', 'dutyreports.create', 'announcements.view', 'polls.view', 'exam.view'),
  ] },
  'Senior Officer': { description: 'Erfahrener Officer', grants: [...pick('persons.edit', 'vehicles.edit', 'weapons.edit', 'incidents.edit', 'wanted.create', 'wanted.edit', 'evidence.transfer', 'investigations.view', 'academy.view')] },
  Supervisor: { description: 'Schichtleitung', grants: [...pick('team.manage', 'dispatch.assign', 'dispatch.edit', 'incidents.close', 'reports.review', 'reports.approve', 'reports.reject', 'tickets.void', 'complaints.view', 'complaints.assign', 'wanted.activate', 'wanted.clear', 'applications.view', 'applications.review', 'analytics.view', 'leave.view', 'dutyreports.view_all', 'dutyreports.review', 'personnel.view', 'promotion.view', 'promotion.create', 'promotion.review', 'transfer.view', 'transfer.create', 'training.view', 'awards.view', 'dienstnummer.view')] },
  Dispatch: { description: 'Leitstelle', grants: [...pick('dispatch.create', 'dispatch.edit', 'dispatch.assign', 'dispatch.close', 'dispatch.manage', 'incidents.create', 'incidents.edit', 'incidents.close', 'communication.moderate', 'cad.view', 'cad.create_incident', 'cad.edit_incident', 'cad.close_incident', 'cad.assign_unit', 'cad.manage_units', 'cad.view_persons', 'cad.view_vehicles', 'cad.view_erlc', 'cad.radio', 'cad.handover', 'cad.view_stats', 'fleet.view', 'fleet.view_details', 'fleet.edit', 'fleet.assign')] },
  Investigator: { description: 'Ermittler', grants: [...pick('investigations.view', 'investigations.create', 'investigations.edit', 'investigations.close', 'complaints.view', 'complaints.investigate', 'evidence.transfer', 'evidence.release', 'persons.edit')] },
  SEK: { description: 'Spezialeinsatzkommando (Mitglieder)', grants: [...pick('sek.view', 'sek.report', 'cad.view', 'cad.radio', 'fleet.view', 'fleet.view_details')] },
  'SEK Leitung': { description: 'Leitung des SEK (Mitglieder, Bewerbungen)', grants: [...only('sek'), ...pick('qualifications.view', 'qualifications.decide')] },
  'Ticket Support': { description: 'Bearbeitet Support-Tickets', grants: [...pick('ticket.view', 'ticket.create', 'ticket.claim', 'ticket.close', 'ticket.reopen', 'ticket.add_user', 'ticket.remove_user', 'ticket.change_status', 'ticket.change_priority', 'ticket.rename', 'ticket.lock', 'ticket.escalate', 'ticket.transcript', 'ticket.internal_notes', 'ticket.rate')] },
  'Ticket Leitung': { description: 'Leitung des Ticket-Systems (alle Ticket-Rechte inkl. Einstellungen)', grants: [...only('ticket')] },
  'Training Staff': { description: 'Academy-Ausbilder', grants: [...pick('academy.view', 'academy.manage', 'personnel.view', 'qualifications.view', 'qualifications.decide'), ...only('training', 'exam')] },
  'Police Administration': { description: 'Polizeiführung', grants: [...only('personnel', 'applications', 'analytics', 'sek', 'qualifications', 'ticket', 'leave', 'dutyreports', 'promotion', 'transfer', 'training', 'exam', 'warning', 'awards', 'announcements', 'polls', 'dienstnummer'), ...pick('persons.archive', 'vehicles.archive', 'complaints.resolve', 'complaints.close', 'audit.view', 'users.view', 'roles.view', 'dashboard.view', 'team.view', 'team.manage')] },
  'System Administrator': { description: 'Vollzugriff auf Systemverwaltung', grants: ['*'] },
};

/** Rangfolge der Startrollen (kleiner = höher). Im Dashboard unter Rollen & Rechte frei änderbar. */
const STARTER_PRIORITY: Record<string, number> = {
  'System Administrator': 1, 'Police Administration': 10, Supervisor: 20, 'Ticket Leitung': 25, 'SEK Leitung': 30, 'Training Staff': 40,
  Investigator: 50, Dispatch: 50, 'Senior Officer': 60, 'Ticket Support': 70, SEK: 70, 'Police Member': 90,
};

export async function seedBase(prisma: PrismaClient) {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key, module: key.split('.')[0] ?? key }, update: {} });
  }
  await prisma.permission.upsert({ where: { key: '*' }, create: { key: '*', module: '*' }, update: {} });
  for (const [name, def] of Object.entries(STARTER_ROLES)) {
    const role = await prisma.role.upsert({ where: { name }, create: { name, description: def.description, system: true, priority: STARTER_PRIORITY[name] ?? 100 }, update: {} });
    const existing = await prisma.rolePermission.count({ where: { roleId: role.id } });
    if (existing === 0) {
      // wie die Migration: Funk-Codes sieht das Team, Team-Chance sieht/verwaltet, wer Bewerbungen sieht/entscheidet
      const has = (k: string) => def.grants.some((g) => g === k || g === `${k.split('.')[0]}.*`);
      const extra = [...(has('team.view') ? ['radio.view'] : []), ...(has('settings.manage') ? ['radio.manage'] : []), ...(has('applications.view') ? ['teamchance.view'] : []), ...(has('applications.decide') ? ['teamchance.manage'] : [])];
      const base = [...def.grants, ...extra];
      const grants = def.grants.includes('*') ? def.grants : [...base, ...areaGrantsFor(base)];
      await prisma.rolePermission.createMany({ data: grants.map((permissionKey) => ({ roleId: role.id, permissionKey, effect: 'ALLOW' })), skipDuplicates: true });
    }
  }
}

/** Ticket-System: Beispiel-Startwerte (nur wenn noch nichts angelegt ist) – alles im Dashboard änderbar/löschbar. */
export async function seedTickets(prisma: PrismaClient) {
  if (!(await prisma.ticketStatus.count())) {
    await prisma.ticketStatus.createMany({ data: [
      { name: 'Offen', emoji: '🟢', color: 0x22c55e, position: 0, kind: 'OPEN', isDefault: true },
      { name: 'In Bearbeitung', emoji: '🔵', color: 0x3b82f6, position: 1, kind: 'OPEN', isClaimed: true },
      { name: 'Wartet auf Benutzer', emoji: '🟡', color: 0xeab308, position: 2, kind: 'OPEN' },
      { name: 'Wartet auf Team', emoji: '🟠', color: 0xf97316, position: 3, kind: 'OPEN' },
      { name: 'Eskaliert', emoji: '🔴', color: 0xef4444, position: 4, kind: 'OPEN', isEscalation: true },
      { name: 'Geschlossen', emoji: '⚫', color: 0x64748b, position: 5, kind: 'CLOSED', isClose: true },
      { name: 'Archiviert', emoji: '📦', color: 0x475569, position: 6, kind: 'ARCHIVED' },
    ] });
  }
  if (!(await prisma.ticketPriority.count())) {
    await prisma.ticketPriority.createMany({ data: [
      { name: 'Niedrig', emoji: '🔵', color: 0x3b82f6, position: 0 },
      { name: 'Normal', emoji: '🟢', color: 0x22c55e, position: 1, isDefault: true },
      { name: 'Hoch', emoji: '🟡', color: 0xeab308, position: 2 },
      { name: 'Dringend', emoji: '🟠', color: 0xf97316, position: 3 },
      { name: 'Kritisch', emoji: '🔴', color: 0xef4444, position: 4 },
    ] });
  }
  if (!(await prisma.ticketCloseReason.count())) {
    await prisma.ticketCloseReason.createMany({ data: ['Problem gelöst', 'Benutzer nicht mehr erreichbar', 'Anfrage erledigt', 'Regelverstoß', 'Falsche Kategorie', 'Duplikat', 'Kein weiterer Support notwendig'].map((text, position) => ({ text, position })) });
  }
  if (!(await prisma.ticketCategory.count()) && !(await prisma.ticketPanel.count())) {
    const support = await prisma.ticketCategory.create({ data: {
      name: 'Support', emoji: '🎫', description: 'Allgemeine Fragen und Hilfe', position: 0, channelNameFormat: 'support-{username}',
      questions: [], // keine Startfrage – Tickets starten direkt; Fragen bei Bedarf unter Categories anlegen
      buttons: defaultTicketButtons() as unknown as object,
    } });
    await prisma.ticketPanel.create({ data: {
      name: 'Support-Panel', title: '🎫 EN | POLIZEI Support', description: 'Willkommen beim Support.\n\nWähle unten aus, wobei du Hilfe benötigst.', style: 'BUTTONS', categoryIds: [support.id],
    } });
  }
}
