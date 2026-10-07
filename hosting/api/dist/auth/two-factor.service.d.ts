import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
/**
 * Zwei-Faktor-Anmeldung (TOTP) für den Passwort-Login. Das Geheimnis liegt verschlüsselt in der Datenbank
 * (gleicher Schlüssel wie die ER:LC-Server-Keys: `ERLC_SECRET_KEY` bzw. `SESSION_SECRET`). Zwischen Passwort und Code
 * bekommt der Browser nur ein kurzlebiges, signiertes Ticket – erst nach dem Code entsteht eine Session.
 */
export declare class TwoFactorService {
    private readonly prisma;
    private readonly audit;
    private readonly env;
    constructor(prisma: PrismaService, audit: AuditService);
    private sign;
    issueTicket(userId: string, now?: number): string;
    /** Benutzer-ID aus einem gültigen, nicht abgelaufenen Ticket – sonst `null`. */
    readTicket(ticket: string, now?: number): string | null;
    /**
     * Prüft einen Authenticator- oder Wiederherstellungscode und „verbraucht“ ihn (TOTP-Zeitschritt bzw. Code wird
     * entfernt). Atomar: zwei gleichzeitige Anmeldungen mit demselben Code gelingen nicht beide.
     */
    consume(userId: string, code: string): Promise<'totp' | 'recovery' | null>;
    status(userId: string): Promise<{
        enabled: boolean;
        enabledAt: Date | null;
        recoveryCodesLeft: number;
    }>;
    /** Schritt 1: neues Geheimnis erzeugen (noch nicht aktiv, bis ein Code bestätigt wurde). */
    setup(actor: Actor & {
        userId: string;
    }): Promise<{
        secret: string;
        otpauthUrl: string;
    }>;
    /** Schritt 2: Code aus der App bestätigen → aktiv; liefert die Wiederherstellungscodes (nur dieses eine Mal). */
    enable(actor: Actor & {
        userId: string;
    }, code: string): Promise<{
        recoveryCodes: string[];
    }>;
    disable(actor: Actor & {
        userId: string;
    }, code: string): Promise<void>;
    regenerateRecovery(actor: Actor & {
        userId: string;
    }, code: string): Promise<{
        recoveryCodes: string[];
    }>;
    static readonly cleared: {
        totpSecret: null;
        totpPending: null;
        totpEnabledAt: null;
        totpLastStep: null;
        totpRecovery: string[];
    };
}
