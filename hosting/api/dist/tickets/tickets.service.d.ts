import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PageQuery } from '../common/pagination';
import { ErlcService } from '../cad/erlc.service';
import { NotifyService } from '../notifications/notify.service';
export declare class TicketsService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly erlc;
    private readonly notify;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, erlc: ErlcService, notify: NotifyService);
    /**
     * Spieler, die gerade auf einem verbundenen ER:LC-Server sind (ohne Polizei/Sheriff) – für „Strafzettel an Spieler im Spiel“.
     * Mit Personenakte (sofern schon vorhanden), Ort und den Kennzeichen ihrer gespawnten Fahrzeuge.
     */
    erlcPlayers(): Promise<{
        serverId: string;
        serverName: string;
        name: string;
        robloxUserId: string | null;
        team: string | null;
        location: string | null;
        plates: string[];
        personId: string | null;
        canMessage: boolean;
    }[]>;
    /** Personenakte zu einem Spieler aus ER:LC finden oder anlegen (wie der automatische Abgleich). */
    private personForErlc;
    /** Strafzettel – entweder für eine Personenakte oder direkt für einen Spieler im Spiel (ER:LC), optional mit Nachricht im Spiel. */
    issue(actor: Actor, d: {
        personId?: string;
        erlcPlayer?: {
            serverId: string;
            name: string;
        };
        notifyInGame?: boolean;
        legalCodeId?: string;
        reason: string;
        amount?: number;
        notes?: string;
        reportId?: string;
    }): Promise<{
        inGame: {
            ok: boolean;
            message: string;
        } | null;
        number: string;
        id: string;
        reason: string;
        updatedAt: Date;
        version: number;
        status: string;
        notes: string | null;
        personId: string;
        officerId: string;
        legalCodeId: string | null;
        amount: import("@prisma/client/runtime/library").Decimal;
        reportId: string | null;
        voidReason: string | null;
        voidedById: string | null;
        issuedAt: Date;
    }>;
    list(p: PageQuery, personId?: string): Promise<{
        items: ({
            person: {
                id: string;
                robloxUsername: string;
            };
        } & {
            number: string;
            id: string;
            reason: string;
            updatedAt: Date;
            version: number;
            status: string;
            notes: string | null;
            personId: string;
            officerId: string;
            legalCodeId: string | null;
            amount: import("@prisma/client/runtime/library").Decimal;
            reportId: string | null;
            voidReason: string | null;
            voidedById: string | null;
            issuedAt: Date;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        ticket: {
            person: {
                id: string;
                createdAt: Date;
                robloxUserId: string | null;
                robloxUsername: string;
                updatedAt: Date;
                version: number;
                serverId: string | null;
                createdById: string | null;
                status: string;
                custom: import("@prisma/client/runtime/library").JsonValue | null;
                aliases: string[];
                notes: string | null;
                fullName: string | null;
                dateOfBirth: Date | null;
                gender: string | null;
                phone: string | null;
                job: string | null;
                nationality: string | null;
                address: string | null;
                appearance: import("@prisma/client/runtime/library").JsonValue | null;
                licenses: string[];
                flags: string[];
                photoId: string | null;
            };
            legalCode: {
                id: string;
                code: string;
                category: string;
                expiresAt: Date | null;
                active: boolean;
                description: string | null;
                title: string;
                penalty: import("@prisma/client/runtime/library").JsonValue;
                effectiveDate: Date;
            } | null;
        } & {
            number: string;
            id: string;
            reason: string;
            updatedAt: Date;
            version: number;
            status: string;
            notes: string | null;
            personId: string;
            officerId: string;
            legalCodeId: string | null;
            amount: import("@prisma/client/runtime/library").Decimal;
            reportId: string | null;
            voidReason: string | null;
            voidedById: string | null;
            issuedAt: Date;
        };
        timeline: {
            id: string;
            action: string;
            entityType: string;
            entityId: string;
            createdAt: Date;
            summary: string;
            actorId: string | null;
        }[];
    }>;
    /** Ticket + Personenverknüpfung + Timeline + Audit + Notification in EINER Transaktion. */
    create(actor: Actor, d: {
        personId: string;
        legalCodeId?: string;
        reason: string;
        amount?: number;
        notes?: string;
        reportId?: string;
    }): Promise<{
        number: string;
        id: string;
        reason: string;
        updatedAt: Date;
        version: number;
        status: string;
        notes: string | null;
        personId: string;
        officerId: string;
        legalCodeId: string | null;
        amount: import("@prisma/client/runtime/library").Decimal;
        reportId: string | null;
        voidReason: string | null;
        voidedById: string | null;
        issuedAt: Date;
    }>;
    void(actor: Actor, id: string, reason: string): Promise<{
        number: string;
        id: string;
        reason: string;
        updatedAt: Date;
        version: number;
        status: string;
        notes: string | null;
        personId: string;
        officerId: string;
        legalCodeId: string | null;
        amount: import("@prisma/client/runtime/library").Decimal;
        reportId: string | null;
        voidReason: string | null;
        voidedById: string | null;
        issuedAt: Date;
    }>;
}
