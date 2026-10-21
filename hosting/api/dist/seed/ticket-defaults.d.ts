import type { PrismaClient } from '@prisma/client';
import { type TicketQuestion } from '@enrp/shared';
/** Verbindliche Konfiguration „Sonstiges“ (Formular wie vorgegeben). */
export declare const SONSTIGES_FORM: TicketQuestion[];
/**
 * Premium-Ticket-System: fehlende Lebenszyklus-Status und Prioritäten ergänzen (jeder Start, nur Fehlendes) und einmalig
 * Abteilungen, die 8 Standard-Kategorien und ein Ticket-Center-Panel anlegen. Vorhandene Einträge (gleicher Name) werden
 * wiederverwendet und nie überschrieben.
 */
export declare function seedTicketPremium(prisma: PrismaClient): Promise<void>;
