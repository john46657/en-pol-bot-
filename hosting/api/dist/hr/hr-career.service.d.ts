import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
export type CareerKind = 'JOINED' | 'PROMOTION' | 'TRANSFER' | 'TRAINING' | 'EXAM' | 'AWARD' | 'WARNING' | 'DISCIPLINE' | 'RECOMMENDATION' | 'NOTE' | 'SERVICE_NUMBER' | 'STATUS' | 'DECISION' | 'DUTY' | 'ACTIVITY' | 'ABSENCE';
export interface CareerEntry {
    at: Date;
    kind: CareerKind;
    title: string;
    description: string | null;
    actor: string | null;
    source: string;
    sensitive?: boolean;
}
/**
 * Digitale Beamtenlaufbahn: chronologische Übersicht aus den vorhandenen, unveränderten Quellen (Personalakten-Einträge, Anträge mit
 * Entscheidungen, Bewerbung, Dienstzeiten, Berichte, Abmeldungen). Nichts wird überschrieben – frühere Dienstgrade bleiben als
 * Einträge erhalten. Geschützte Einträge (Verwarnungen, Notizen) nur mit den jeweiligen Rechten.
 */
export declare class HrCareerService {
    private readonly core;
    private readonly perms;
    constructor(core: HrCoreService, perms: PermissionService);
    private get prisma();
    career(actor: Actor, personnelId: string): Promise<{
        personnelId: string;
        name: string;
        rank: string | null;
        rankSince: Date;
        department: string | null;
        joinDate: Date;
        status: string;
        totals: {
            dutyMinutes: number;
            reports: number;
            incidentsCreated: number;
            promotions: number;
            trainings: number;
        };
        next: import("@enrp/shared").PromotionCheck[];
        entries: CareerEntry[];
    }>;
}
