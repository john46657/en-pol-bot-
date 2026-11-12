import { type CaseLinkType, type CaseStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PermissionService } from '../authz/permission.service';
/**
 * Intelligente Vorgangsverknüpfung: Vorgänge mit eindeutiger Vorgangsnummer bündeln Datensätze aus den bestehenden Modulen.
 * Verknüpft wird ausschließlich ausdrücklich durch berechtigte Personen; Duplikate werden nur VORGESCHLAGEN (gleicher verknüpfter
 * Datensatz oder sehr ähnlicher Titel in kurzem Abstand) und nur nach manueller Prüfung zusammengeführt. Verknüpfungen werden
 * nie gelöscht, sondern mit Begründung gelöst.
 */
export declare class CasesService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly perms;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, perms: PermissionService);
    private can;
    /** Fortlaufende Vorgangsnummer V-<Jahr>-00001 (global eindeutig, gezählt über alle Bereiche – nur die Nummer). */
    private nextNumber;
    /** Vertrauliche CAD-Einsätze nur für Berechtigte (wie im CAD). */
    private incidentVisible;
    /** Bezeichnung, Status und Zeitpunkt je Datensatz – nur, was die Person sehen darf (sonst `null` = nicht sichtbar/nicht vorhanden). */
    private resolve;
    list(actor: Actor, q: {
        q?: string;
        status?: string;
        from?: string;
        to?: string;
        incidentNumber?: string;
        entityType?: CaseLinkType;
        entityId?: string;
        page?: number;
        pageSize?: number;
    }): Promise<{
        items: {
            id: string;
            number: string;
            title: string;
            status: string;
            statusLabel: string;
            createdAt: Date;
            updatedAt: Date;
            links: number;
            mergedIntoId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    private load;
    /** Vorgang mit allen Verknüpfungen (aktuell und gelöst) und chronologischer Ereignisübersicht. */
    get(actor: Actor, id: string): Promise<{
        id: string;
        number: string;
        title: string;
        description: string | null;
        status: string;
        statusLabel: string;
        version: number;
        createdAt: Date;
        updatedAt: Date;
        closedAt: Date | null;
        createdBy: string;
        mergedIntoId: string | null;
        links: {
            id: string;
            entityType: string;
            typeLabel: string;
            entityId: string | null;
            role: string | null;
            note: string | null;
            label: string;
            visible: boolean;
            gone: boolean;
            status: string | null;
            occurredAt: Date | null;
            addedAt: Date;
            addedBy: string;
            removedAt: Date | null;
            removedBy: string | null;
            removeReason: string | null;
        }[];
        removedLinks: {
            id: string;
            entityType: string;
            typeLabel: string;
            entityId: string | null;
            role: string | null;
            note: string | null;
            label: string;
            visible: boolean;
            gone: boolean;
            status: string | null;
            occurredAt: Date | null;
            addedAt: Date;
            addedBy: string;
            removedAt: Date | null;
            removedBy: string | null;
            removeReason: string | null;
        }[];
        events: {
            at: Date;
            kind: string;
            text: string;
            actor: string | null;
            source: string;
        }[];
    }>;
    create(actor: Actor, d: {
        title: string;
        description?: string | null;
        links?: {
            entityType: CaseLinkType;
            entityId: string;
            role?: string | null;
            note?: string | null;
        }[];
    }): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        description: string | null;
        closedAt: Date | null;
        mergedIntoId: string | null;
    }>;
    update(actor: Actor, id: string, d: {
        version: number;
        title?: string;
        description?: string | null;
        status?: CaseStatus;
        reason?: string;
    }): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        description: string | null;
        closedAt: Date | null;
        mergedIntoId: string | null;
    }>;
    /** Darf diese Person diesen Datensatz verknüpfen? Er muss existieren und für sie sichtbar sein. */
    private assertLinkable;
    addLink(actor: Actor, id: string, d: {
        entityType: CaseLinkType;
        entityId: string;
        role?: string | null;
        note?: string | null;
    }): Promise<{
        role: string | null;
        id: string;
        note: string | null;
        addedById: string;
        occurredAt: Date | null;
        entityId: string;
        entityType: string;
        label: string;
        caseId: string;
        addedAt: Date;
        removedById: string | null;
        removedAt: Date | null;
        removeReason: string | null;
    }>;
    /** Verknüpfung lösen (mit Begründung) – sie bleibt als gelöste Verknüpfung im Vorgang sichtbar. */
    removeLink(actor: Actor, id: string, linkId: string, reason: string): Promise<void>;
    /**
     * Mögliche Duplikate unter den offenen Vorgängen. Stark: beide verknüpfen denselben Datensatz (Einsatz, Notruf, Bericht, Fahndung).
     * Schwach (nur Hinweis): sehr ähnlicher Titel und innerhalb von 48 Stunden angelegt. Personen allein reichen nie (ähnliche Namen sind
     * kein Beleg). Bereits geprüfte Paare erscheinen nicht erneut.
     */
    duplicates(): Promise<{
        a: {
            id: string;
            number: string;
            title: string;
        };
        b: {
            id: string;
            number: string;
            title: string;
        };
        strength: "STRONG" | "WEAK";
        reasons: string[];
    }[]>;
    /**
     * Entscheidung über einen Vorschlag: „kein Duplikat“ (wird nicht mehr vorgeschlagen) oder „zusammenführen“: aktive Verknüpfungen
     * des zweiten Vorgangs werden in den ersten übernommen (vorhandene übersprungen), der zweite wird abgeschlossen und verweist auf den ersten.
     * Nichts wird gelöscht.
     */
    decideDuplicate(actor: Actor, d: {
        keepId: string;
        otherId: string;
        decision: 'NOT_DUPLICATE' | 'MERGE';
        note?: string;
    }): Promise<{
        decision: "NOT_DUPLICATE" | "MERGE";
        moved: number;
    }>;
    /** Vorgänge zu einem Datensatz (z. B. Einsatz-Detail, Karte). */
    forEntity(entityType: CaseLinkType, entityId: string): Promise<{
        statusLabel: string;
        linkedAt: Date;
        linkedAtLabel: string;
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        title: string;
    }[]>;
}
