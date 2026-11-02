import { z } from 'zod';
import { type OrgUnitInput } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { OrgService } from './org.service';
declare const updateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    kind: z.ZodOptional<z.ZodEnum<["LEADERSHIP", "DEPUTY_LEADERSHIP", "DEPARTMENT", "DUTY_GROUP", "UNIT", "OTHER"]>>;
    parentId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    responsibilities: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    departmentName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    leaderPersonnelId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    deputyPersonnelId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    color: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    position: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
} & {
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    version?: number | undefined;
    color?: string | null | undefined;
    description?: string | null | undefined;
    name?: string | undefined;
    kind?: "DEPARTMENT" | "OTHER" | "LEADERSHIP" | "DEPUTY_LEADERSHIP" | "DUTY_GROUP" | "UNIT" | undefined;
    position?: number | undefined;
    parentId?: string | null | undefined;
    responsibilities?: string | null | undefined;
    departmentName?: string | null | undefined;
    leaderPersonnelId?: string | null | undefined;
    deputyPersonnelId?: string | null | undefined;
}, {
    version?: number | undefined;
    color?: string | null | undefined;
    description?: string | null | undefined;
    name?: string | undefined;
    kind?: "DEPARTMENT" | "OTHER" | "LEADERSHIP" | "DEPUTY_LEADERSHIP" | "DUTY_GROUP" | "UNIT" | undefined;
    position?: number | undefined;
    parentId?: string | null | undefined;
    responsibilities?: string | null | undefined;
    departmentName?: string | null | undefined;
    leaderPersonnelId?: string | null | undefined;
    deputyPersonnelId?: string | null | undefined;
}>;
/** Organigramm (Dashboard-Editor, MDT-/Leitstellen-Übersicht, Bot). */
export declare class OrgController {
    private readonly s;
    constructor(s: OrgService);
    units(q: {
        inactive?: string;
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
    /** Führungsstruktur ohne Mitgliederlisten (MDT, Leitstelle, Bot) */
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
            before: import("@prisma/client/runtime/library").JsonValue;
            after: import("@prisma/client/runtime/library").JsonValue;
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
    unitsOf(id: string): Promise<{
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
    create(a: Actor, b: OrgUnitInput): Promise<{
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
    update(a: Actor, id: string, b: z.infer<typeof updateSchema>): Promise<{
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
    deactivate(a: Actor, id: string): Promise<{
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
    activate(a: Actor, id: string): Promise<{
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
    assign(a: Actor, id: string, b: {
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
    unassign(a: Actor, id: string, pid: string): Promise<{
        function: string | null;
        id: string;
        createdById: string;
        unitId: string;
        startedAt: Date;
        endedAt: Date | null;
        personnelId: string;
        endedById: string | null;
    }>;
    importDepartments(a: Actor, b: {
        parentId?: string | null;
    }): Promise<{
        created: string[];
    }>;
}
export {};
