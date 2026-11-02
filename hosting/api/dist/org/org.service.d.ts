import { Prisma } from '@prisma/client';
import { type OrgUnitInput } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
/**
 * Organigramm: Einheiten (Führung, Abteilungen, Dienstgruppen …) als Baum. Abteilungs-Einheiten können mit einer Abteilung der
 * Personal-Einstellungen verknüpft werden – ihre Mitglieder sind dann die Personalakten dieser Abteilung (keine Doppelpflege,
 * Versetzungen laufen weiter über den Antrags-Workflow). Andere Einheiten haben ausdrückliche Zuordnungen mit Historie.
 * Einheiten werden deaktiviert, nie gelöscht.
 */
export declare class OrgService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly notify;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, notify: NotifyService);
    private units;
    /** Vollständige Struktur mit Führung, Stellvertretung und Mitgliedern (für Dashboard, MDT, Leitstelle). */
    structure(q?: {
        includeInactive?: boolean;
        members?: boolean;
    }): Promise<{
        id: string;
        parentId: string | null;
        name: string;
        kind: string;
        description: string | null;
        responsibilities: string | null;
        departmentName: string | null;
        color: string | null;
        position: number;
        active: boolean;
        version: number;
        leader: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | null;
        deputy: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | null;
        memberCount: number;
        members: ({
            function: string | null;
            since: Date;
            via: "ASSIGNMENT";
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | {
            function: null;
            since: null;
            via: "DEPARTMENT";
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        })[] | undefined;
    }[]>;
    /** Kurzfassung der Führungsstruktur (Bot, MDT, Leitstelle): ohne Mitgliederlisten. */
    summary(): Promise<{
        id: string;
        parentId: string | null;
        name: string;
        kind: string;
        description: string | null;
        responsibilities: string | null;
        departmentName: string | null;
        color: string | null;
        position: number;
        active: boolean;
        version: number;
        leader: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | null;
        deputy: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | null;
        memberCount: number;
    }[]>;
    detail(id: string): Promise<{
        formerMembers: {
            function: string | null;
            startedAt: Date;
            endedAt: Date | null;
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        }[];
        history: {
            id: string;
            action: string;
            at: Date;
            actor: string;
            before: Prisma.JsonValue;
            after: Prisma.JsonValue;
        }[];
        id: string;
        parentId: string | null;
        name: string;
        kind: string;
        description: string | null;
        responsibilities: string | null;
        departmentName: string | null;
        color: string | null;
        position: number;
        active: boolean;
        version: number;
        leader: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | null;
        deputy: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | null;
        memberCount: number;
        members: ({
            function: string | null;
            since: Date;
            via: "ASSIGNMENT";
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | {
            function: null;
            since: null;
            via: "DEPARTMENT";
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        })[] | undefined;
    }>;
    private assertPersonnel;
    /** Struktur-Änderungen (übergeordnete Einheit, Führung, Stellvertretung) brauchen zusätzlich `org.hierarchy`. */
    private assertHierarchy;
    create(actor: Actor, d: OrgUnitInput): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        color: string | null;
        description: string | null;
        active: boolean;
        name: string;
        kind: string;
        position: number;
        parentId: string | null;
        responsibilities: string | null;
        departmentName: string | null;
        leaderPersonnelId: string | null;
        deputyPersonnelId: string | null;
        deactivatedAt: Date | null;
    }>;
    update(actor: Actor, id: string, d: Partial<OrgUnitInput> & {
        version?: number;
    }): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        color: string | null;
        description: string | null;
        active: boolean;
        name: string;
        kind: string;
        position: number;
        parentId: string | null;
        responsibilities: string | null;
        departmentName: string | null;
        leaderPersonnelId: string | null;
        deputyPersonnelId: string | null;
        deactivatedAt: Date | null;
    }>;
    /** Deaktivieren (nicht löschen). Mit aktiven Untereinheiten nicht möglich. */
    setActive(actor: Actor, id: string, active: boolean): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        color: string | null;
        description: string | null;
        active: boolean;
        name: string;
        kind: string;
        position: number;
        parentId: string | null;
        responsibilities: string | null;
        departmentName: string | null;
        leaderPersonnelId: string | null;
        deputyPersonnelId: string | null;
        deactivatedAt: Date | null;
    }>;
    assign(actor: Actor, unitId: string, d: {
        personnelId: string;
        function?: string | null;
    }): Promise<{
        function: string | null;
        id: string;
        createdById: string;
        unitId: string;
        startedAt: Date;
        endedAt: Date | null;
        personnelId: string;
        endedById: string | null;
    }>;
    endAssignment(actor: Actor, assignmentId: string): Promise<{
        function: string | null;
        id: string;
        createdById: string;
        unitId: string;
        startedAt: Date;
        endedAt: Date | null;
        personnelId: string;
        endedById: string | null;
    }>;
    /** Zuordnungen anhand der aktiven Zuordnung (Person + Einheit) beenden – für das Dashboard. */
    unassign(actor: Actor, unitId: string, personnelId: string): Promise<{
        function: string | null;
        id: string;
        createdById: string;
        unitId: string;
        startedAt: Date;
        endedAt: Date | null;
        personnelId: string;
        endedById: string | null;
    }>;
    /**
     * Abteilungen aus den Personal-Einstellungen als Abteilungs-Einheiten übernehmen (nur fehlende; nichts wird erfunden oder
     * überschrieben). Optional unter einer übergeordneten Einheit.
     */
    importDepartments(actor: Actor, parentId?: string | null): Promise<{
        created: string[];
    }>;
    /**
     * Personalakten, für die ein Benutzer als Führung/Stellvertretung zuständig ist: Mitglieder seiner Einheiten und aller
     * Untereinheiten (abteilungsbezogen + ausdrückliche Zuordnungen). Grundlage für `personnel.view_unit`.
     */
    scopeOf(userId: string): Promise<Set<string>>;
    /** Einheiten einer Person inkl. übergeordneter Kette und zuständiger Führung (Personalakte, MDT, Leitstelle). */
    unitsOf(personnelId: string, team?: string | null): Promise<{
        id: string;
        name: string;
        kind: string;
        function: string | null;
        since: Date | null;
        role: string;
        path: string[];
        supervisor: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            serviceNumber: string | null;
        } | null;
    }[]>;
    /** Benachrichtigung bei Organigramm-Änderungen: Verwalter (org.edit) und betroffene Führungskräfte. */
    private changed;
    private sendChanged;
}
