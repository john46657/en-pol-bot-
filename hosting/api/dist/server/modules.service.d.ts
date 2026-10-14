import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
export declare const MODULES_KEY = "modules.config";
/**
 * Module zentral an- und ausschalten (Administration → Module). Ohne Eintrag ist ein Modul an. Abgeschaltete Module sperrt der
 * AuthorizationService im Dashboard, in der API und bei Discord-Befehlen; der Bot registriert ihre Befehle nicht.
 */
export declare class ModulesService {
    private readonly prisma;
    private readonly audit;
    private cache;
    constructor(prisma: PrismaService, audit: AuditService);
    private read;
    /** Abgeschaltete Module (5 s zwischengespeichert; diese Instanz nach Änderungen sofort). */
    disabled(): Promise<Set<string>>;
    list(): Promise<{
        version: number;
        modules: {
            key: string;
            name: string;
            description: string;
            system: boolean;
            dependsOn: string[];
            enabled: boolean;
        }[];
    }>;
    /** Modul an/aus. `version` = gelesener Stand; ein veralteter Stand wird mit 409 abgelehnt. Abhängigkeiten werden geprüft. */
    set(actor: Actor, key: string, enabled: boolean, version: number): Promise<{
        version: number;
        modules: {
            key: string;
            name: string;
            description: string;
            system: boolean;
            dependsOn: string[];
            enabled: boolean;
        }[];
    }>;
}
