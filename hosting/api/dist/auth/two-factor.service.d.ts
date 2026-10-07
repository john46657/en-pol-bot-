import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
/**
 * Zwei-Faktor-Anmeldung (TOTP, Authenticator-App) für den Passwort-Login.
 * - Einrichten: Geheimnis erzeugen → in der App hinzufügen → mit einem Code bestätigen → 10 Wiederherstellungscodes (einmalig sichtbar).
 * - Anmelden: Passwort ok → kurzlebiges Ticket → Code oder Wiederherstellungscode → Sitzung.
 * - Geheimnis verschlüsselt (wie die ER:LC-Keys), Wiederherstellungscodes nur als Hash, jeder Code nur einmal gültig.
 * „Mit Discord anmelden“ nutzt die Zwei-Faktor-Sicherung von Discord und fragt hier nicht zusätzlich.
 */
export declare class TwoFactorService {
    private readonly prisma;
    private readonly audit;
    private readonly secret;
    constructor(prisma: PrismaService, audit: AuditService);
    ticket(userId: string): string;
    readTicket(ticket: string): string;
    /** Code (TOTP) oder Wiederherstellungscode prüfen und verbrauchen. */
    consume(userId: string, code: string): Promise<'totp' | 'recovery' | null>;
    status(userId: string): Promise<{
        enabled: boolean;
        enabledAt: Date | null;
        recoveryLeft: number;
    }>;
    setup(actor: Actor): Promise<{
        secret: string;
        otpauthUrl: string;
    }>;
    private recoveryCodes;
    enable(actor: Actor, code: string): Promise<{
        recoveryCodes: string[];
    }>;
    /** Abschalten mit aktuellem Code oder Wiederherstellungscode. */
    disable(actor: Actor, code: string): Promise<void>;
    regenerate(actor: Actor, code: string): Promise<{
        recoveryCodes: string[];
    }>;
    /** Verwaltung: Zwei-Faktor eines Kontos zurücksetzen (Handy verloren und keine Wiederherstellungscodes). */
    adminReset(actor: Actor, userId: string): Promise<void>;
    private clear;
}
