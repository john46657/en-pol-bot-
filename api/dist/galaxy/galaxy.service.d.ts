import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { ReportsService } from '../reports/reports.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { ComplaintsService } from '../complaints/complaints.service';
import { InvestigationsService } from '../investigations/investigations.service';
import { WantedService } from '../wanted/wanted.service';
import { GalaxyClient } from './galaxy.client';
export type Kind = 'incident' | 'report' | 'complaint' | 'investigation';
/** Einzige Aktionen, die die KI vorschlagen darf – jeweils mit Pflicht-Permission des BESTÄTIGENDEN Menschen. */
export declare const PROPOSABLE: {
    readonly 'complaint.close': {
        readonly permission: "complaints.close";
        readonly schema: z.ZodObject<{
            complaintId: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            complaintId: string;
        }, {
            complaintId: string;
        }>;
    };
    readonly 'wanted.clear': {
        readonly permission: "wanted.clear";
        readonly schema: z.ZodObject<{
            wantedId: z.ZodString;
            reason: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            reason: string;
            wantedId: string;
        }, {
            reason: string;
            wantedId: string;
        }>;
    };
};
export declare class GalaxyService {
    private readonly prisma;
    private readonly client;
    private readonly audit;
    private readonly perms;
    private readonly reports;
    private readonly dispatch;
    private readonly complaints;
    private readonly investigations;
    private readonly wanted;
    constructor(prisma: PrismaService, client: GalaxyClient, audit: AuditService, perms: PermissionService, reports: ReportsService, dispatch: DispatchService, complaints: ComplaintsService, investigations: InvestigationsService, wanted: WantedService);
    status(): {
        enabled: boolean;
        capability: string;
    };
    /** Lädt den Datensatz über dieselben Services wie die normale API → die KI sieht exakt das, was der Benutzer sehen darf. */
    private load;
    private run;
    summarize(actor: Actor, kind: Kind, id: string): Promise<{
        aiGenerated: true;
        label: string;
        text: string;
        proposals: ({
            id: string;
            action: string;
            params: import("@prisma/client/runtime/library").JsonValue;
            rationale: string | null;
            status: string;
        } | null)[];
    }>;
    draftReport(actor: Actor, notes: string): Promise<{
        aiGenerated: true;
        label: string;
        text: string;
        proposals: ({
            id: string;
            action: string;
            params: import("@prisma/client/runtime/library").JsonValue;
            rationale: string | null;
            status: string;
        } | null)[];
    }>;
    shiftSummary(actor: Actor): Promise<{
        aiGenerated: true;
        label: string;
        text: string;
        proposals: ({
            id: string;
            action: string;
            params: import("@prisma/client/runtime/library").JsonValue;
            rationale: string | null;
            status: string;
        } | null)[];
    }>;
    private splitProposal;
    private propose;
    /** Offene Vorschläge, die der Benutzer selbst bestätigen dürfte. */
    listProposals(actor: Actor): Promise<{
        params: import("@prisma/client/runtime/library").JsonValue;
        id: string;
        createdAt: Date;
        action: string;
        status: string;
        decidedById: string | null;
        requesterId: string;
        rationale: string | null;
        decidedAt: Date | null;
    }[]>;
    /** Menschliche Bestätigung: Es zählt die Permission des Bestätigenden; Ausführung läuft über die normalen Services (inkl. Audit/Timeline). */
    confirm(actor: Actor, id: string): Promise<{
        status: string;
    }>;
    reject(actor: Actor, id: string): Promise<{
        status: string;
    }>;
}
