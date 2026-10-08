import { type OnModuleInit } from '@nestjs/common';
import { type LoggingConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
/**
 * Logging: jede Aktion aus dem Audit-Log kann je Kategorie bzw. Typ in einen Discord-Kanal gemeldet werden.
 * Die Meldung entsteht in derselben Transaktion wie der Audit-Eintrag (Outbox → Bot).
 */
export declare class LoggingService implements OnModuleInit {
    private readonly prisma;
    private readonly audit;
    private cfg;
    constructor(prisma: PrismaService, audit: AuditService);
    onModuleInit(): Promise<void>;
    reload(): Promise<void>;
    get(): {
        enabled: boolean;
        categories: Record<string, string>;
        types: Record<string, string>;
    };
    save(actor: Actor, input: LoggingConfig): Promise<{
        enabled: boolean;
        categories: Record<string, string>;
        types: Record<string, string>;
    }>;
    /** Kategorien mit allen Typen: bekannte Aktionen plus alles, was schon im Audit-Log steht. */
    types(): Promise<{
        types: {
            action: string;
            module: string;
            label: string;
            count: number;
            lastAt: Date | null;
            defaultOff: boolean;
        }[];
        key: string;
        label: string;
        emoji: string;
    }[]>;
    /** Test-Meldung in den Kanal einer Kategorie. */
    test(actor: Actor, category: string): Promise<{
        queued: boolean;
    }>;
    private onAudit;
}
