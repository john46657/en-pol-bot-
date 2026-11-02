import { Prisma } from '@prisma/client';
import { type PermissionContext } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { OrgService } from '../org/org.service';
import { HrCoreService } from './hr-core.service';
import { QualificationRegistryService } from './qualification-registry.service';
export interface NoteInput {
    summary: string;
    details?: string | null;
    category?: string | null;
    confidential?: boolean;
}
/**
 * Personalakte 2.0: ergänzt die bestehende Personalakte (HrPeopleService) um Diensthistorie, Personalvermerke mit Kategorie,
 * Vertraulichkeit und Änderungsverlauf, Dokumente, Qualifikationsregister, Organisationszugehörigkeit und Aktivitäten.
 *
 * Zugriff: `personnel.view` (alle Akten des Servers) ODER `personnel.view_unit` (nur Akten der Einheiten, die man führt bzw.
 * stellvertretend führt, inkl. Untereinheiten – Vererbung über das Organigramm). Fremde Akten verhalten sich wie „nicht gefunden“.
 * Vermerke: `personnel.notes_view`, vertrauliche zusätzlich `personnel.notes_confidential`. Dokumente: `personnel.documents`.
 */
export declare class PersonnelFileService {
    private readonly core;
    private readonly perms;
    private readonly org;
    private readonly quals;
    private readonly notify;
    constructor(core: HrCoreService, perms: PermissionService, org: OrgService, quals: QualificationRegistryService, notify: NotifyService);
    private get prisma();
    /** Zugriff auf eine Akte prüfen; liefert den Rechte-Kontext für die Feinprüfung. */
    access(actor: Actor, personnelId: string): Promise<{
        ctx: PermissionContext;
        full: boolean;
        personnel: {
            id: string;
            userId: string;
            team: string | null;
            rank: string | null;
        };
    }>;
    /** Personalübersicht für Führungskräfte mit `personnel.view_unit` (nur zuständige Akten). */
    unitOverview(actor: Actor): Promise<{
        id: string;
        name: string;
        robloxName: string | null;
        rank: string | null;
        department: string | null;
        status: string;
        serviceNumber: string | null;
        callsign: string | null;
        joinDate: Date;
    }[]>;
    private dutyStatus;
    /** Bereiche der Personalakte 2.0 (Grunddaten liefert weiterhin GET /hr/people/:id). Lesen wird protokolliert. */
    summary(actor: Actor, personnelId: string): Promise<{
        id: string;
        access: string;
        dutyStatus: {
            status: string;
            since: Date | null;
            callsign: string | null;
        };
        units: {
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
        }[];
        qualifications: {
            id: string;
            personnelId: string;
            personName: string;
            rank: string | null;
            department: string | null;
            definitionId: string | null;
            name: string;
            color: string | null;
            operational: boolean;
            status: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED";
            storedStatus: string;
            source: string;
            sourceLabel: string;
            sourceId: string | null;
            issuedAt: Date | null;
            issuedBy: string | null;
            expiresAt: Date | null;
            note: string | null;
            statusReason: string | null;
            statusChangedAt: Date | null;
            statusChangedBy: string | null;
            createdAt: Date;
        }[];
        dutyHistory: {
            days: number;
            minutesOnDuty: number;
            sessions: {
                id: string;
                status: string;
                callsign: string | null;
                startedAt: Date;
                endedAt: Date | null;
            }[];
        };
        dutyReports: {
            number: string;
            id: string;
            status: string;
            createdAt: Date;
            templateName: string;
            period: string;
            periodStart: Date;
        }[];
        trainings: {
            id: string;
            name: string;
            status: string;
            progress: number;
            completedAt: Date | null;
            certificateNo: string | null;
        }[];
        exams: {
            id: string;
            title: string;
            score: number | null;
            maxScore: number | null;
            passed: boolean | null;
            gradedAt: Date | null;
        }[];
        practicalExams: {
            id: string;
            title: string;
            total: number | null;
            maxPoints: number | null;
            passed: boolean | null;
            completedAt: Date | null;
        }[];
        permissions: {
            notes: boolean;
            notesCreate: boolean;
            confidential: boolean;
            documents: boolean;
            activity: boolean;
            qualificationGrant: boolean;
            qualificationRevoke: boolean;
        };
    }>;
    private noteWhere;
    notes(actor: Actor, personnelId: string, q: {
        category?: string;
    }): Promise<{
        id: string;
        summary: string;
        details: string | null;
        category: string | null;
        confidential: boolean;
        createdAt: Date;
        updatedAt: Date;
        author: string;
        authorId: string;
        revisions: number;
    }[]>;
    addNote(actor: Actor, personnelId: string, d: NoteInput): Promise<{
        details: string | null;
        id: string;
        status: string | null;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        expiresAt: Date | null;
        personnelId: string;
        attachments: string[];
        confidential: boolean;
        summary: string;
        data: Prisma.JsonValue | null;
        deletedAt: Date | null;
    }>;
    /** Bearbeiten: Verfasser oder personnel.edit; der vorherige Stand wird als Revision gespeichert. */
    editNote(actor: Actor, noteId: string, d: Partial<NoteInput> & {
        reason?: string;
    }): Promise<{
        details: string | null;
        id: string;
        status: string | null;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        expiresAt: Date | null;
        personnelId: string;
        attachments: string[];
        confidential: boolean;
        summary: string;
        data: Prisma.JsonValue | null;
        deletedAt: Date | null;
    }>;
    noteRevisions(actor: Actor, noteId: string): Promise<{
        editedBy: string;
        details: string | null;
        id: string;
        createdAt: Date;
        category: string | null;
        reason: string | null;
        confidential: boolean;
        summary: string;
        editedById: string;
        recordId: string;
    }[]>;
    documents(actor: Actor, personnelId: string, includeArchived?: boolean): Promise<{
        id: string;
        kind: string;
        title: string;
        note: string | null;
        confidential: boolean;
        fileName: string;
        mime: string;
        size: number;
        uploadedBy: string;
        createdAt: Date;
        archivedAt: Date | null;
    }[]>;
    /** Datei vorher über POST /media (linkedType PersonnelDocument, linkedId = Akte) hochladen, dann hier zuordnen. */
    addDocument(actor: Actor, personnelId: string, d: {
        mediaId: string;
        kind: string;
        title: string;
        note?: string | null;
        confidential?: boolean;
    }): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        title: string;
        kind: string;
        personnelId: string;
        note: string | null;
        mediaId: string;
        confidential: boolean;
        uploadedById: string;
        archivedAt: Date | null;
        archivedById: string | null;
    }>;
    archiveDocument(actor: Actor, docId: string): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        title: string;
        kind: string;
        personnelId: string;
        note: string | null;
        mediaId: string;
        confidential: boolean;
        uploadedById: string;
        archivedAt: Date | null;
        archivedById: string | null;
    }>;
    /** Download mit Akten- und Vertraulichkeitsprüfung; jeder Abruf wird protokolliert. */
    downloadDocument(actor: Actor, docId: string): Promise<{
        media: {
            id: string;
            createdAt: Date;
            originalName: string;
            mime: string;
            size: number;
            hash: string;
            storageKey: string;
            uploaderId: string;
            linkedType: string | null;
            linkedId: string | null;
        };
        data: NonSharedBuffer;
    }>;
    activity(actor: Actor, personnelId: string, page?: number): Promise<{
        total: number;
        page: number;
        rows: {
            id: string;
            action: string;
            at: Date;
            actor: string;
            before: Prisma.JsonValue;
            after: Prisma.JsonValue;
            reason: string | null;
        }[];
    }>;
    /** Dienstrelevante Personalinformationen (kein Vermerk, keine Verwarnung, keine Dokumente). Serverseitige Suche + Seiten. */
    directory(q: {
        q?: string;
        onDuty?: boolean;
        page?: number;
    }): Promise<{
        total: number;
        page: number;
        pageSize: number;
        rows: {
            id: string;
            name: string;
            rank: string | null;
            department: string | null;
            callsign: string | null;
            serviceNumber: string | null;
            dutyStatus: string;
            onDutySince: Date | null;
            qualifications: {
                name: string;
                color: string | null;
            }[];
            units: {
                id: string;
                name: string;
                role: string;
            }[];
        }[];
    }>;
    /** Bot: Auskunft per Discord-ID (Rechte wie im Dashboard: personnel.view oder zuständige Führungskraft). */
    lookup(actor: Actor, discordId: string): Promise<{
        id: string;
        name: string;
        robloxName: string | null;
        rank: string | null;
        department: string | null;
        status: string;
        serviceNumber: string | null;
        callsign: string | null;
        joinDate: Date;
        dutyStatus: {
            status: string;
            since: Date | null;
            callsign: string | null;
        };
        units: {
            name: string;
            role: string;
            supervisor: string | null;
        }[];
        qualifications: string[];
    }>;
    /** Personalstatus ändern (Grunddaten): bestehende Funktion nutzen, betroffene Person privat benachrichtigen (neutral). */
    notifyChanged(personnelId: string, title: string): Promise<void>;
    private names;
}
