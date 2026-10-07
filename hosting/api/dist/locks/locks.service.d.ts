import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
/** Ohne Lebenszeichen (alle 30 s aus dem geöffneten Formular) läuft die Sperre nach 90 s ab. */
export declare const LOCK_TTL_MS = 90000;
/** Sperrbare Datensätze: wer die Sperre sehen darf (eins davon) und wer bearbeiten/sperren darf (eins davon). */
export declare const LOCK_TYPES: {
    readonly person: {
        readonly view: readonly ["persons.view"];
        readonly edit: readonly ["persons.edit"];
    };
    readonly incident: {
        readonly view: readonly ["incidents.view", "cad.view"];
        readonly edit: readonly ["incidents.edit", "cad.edit_incident"];
    };
    readonly report: {
        readonly view: readonly ["reports.view"];
        readonly edit: readonly ["reports.create"];
    };
    readonly personnel: {
        readonly view: readonly ["personnel.view"];
        readonly edit: readonly ["personnel.edit"];
    };
};
export type LockType = keyof typeof LOCK_TYPES;
export declare const LOCK_TYPE_KEYS: [LockType, ...LockType[]];
/**
 * Datensatz-Sperre beim Bearbeiten: Wer ein Formular öffnet, sperrt den Datensatz; andere sehen „wird gerade von X bearbeitet“
 * und können erst speichern, wenn die Sperre frei ist (oder sie sie bewusst übernehmen – wird protokolliert).
 * Ergänzt die Versionsprüfung (optimistic locking) der einzelnen Module.
 */
export declare class LocksService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly realtime;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, realtime: RealtimeService);
    private assertAny;
    private holder;
    private view;
    status(actor: Actor, type: LockType, id: string): Promise<{
        locked: boolean;
        mine: boolean;
        holder: {
            id: string;
            displayName: string;
        };
        since: Date;
        expiresAt: Date;
    } | {
        locked: boolean;
        mine: boolean;
        holder?: undefined;
        since?: undefined;
        expiresAt?: undefined;
    }>;
    /** Sperren oder verlängern. Gehört die Sperre jemand anderem: `ok: false` mit Name – außer bei `force` (Übernahme, protokolliert). */
    acquire(actor: Actor, type: LockType, id: string, force?: boolean): Promise<{
        locked: boolean;
        mine: boolean;
        holder: {
            id: string;
            displayName: string;
        };
        since: Date;
        expiresAt: Date;
        ok: boolean;
    } | {
        locked: boolean;
        mine: boolean;
        holder?: undefined;
        since?: undefined;
        expiresAt?: undefined;
        ok: boolean;
    }>;
    release(actor: Actor, type: LockType, id: string): Promise<void>;
    /** Beim Speichern: Hält jemand anderes die Sperre, wird abgelehnt. */
    assertFree(type: LockType, id: string, userId: string | null | undefined): Promise<void>;
}
