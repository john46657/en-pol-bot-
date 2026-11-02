import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { MediaService } from '../media/media.service';
export declare const docMeta: z.ZodObject<{
    title: z.ZodString;
    category: z.ZodEnum<["DIRECTIVE", "RULES", "TRAINING", "EXAM", "DISPATCH", "POLICY", "TEMPLATE", "OTHER"]>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    access: z.ZodDefault<z.ZodEnum<["ALL", "ROLES", "CONFIDENTIAL"]>>;
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    title: string;
    category: "TRAINING" | "OTHER" | "DISPATCH" | "TEMPLATE" | "EXAM" | "DIRECTIVE" | "RULES" | "POLICY";
    roleIds: string[];
    access: "ALL" | "ROLES" | "CONFIDENTIAL";
    description?: string | null | undefined;
}, {
    title: string;
    category: "TRAINING" | "OTHER" | "DISPATCH" | "TEMPLATE" | "EXAM" | "DIRECTIVE" | "RULES" | "POLICY";
    description?: string | null | undefined;
    roleIds?: string[] | undefined;
    access?: "ALL" | "ROLES" | "CONFIDENTIAL" | undefined;
}>;
/** Formularfelder kommen als Text (multipart): roleIds als kommagetrennte Liste. */
export declare const docForm: z.ZodObject<{
    title: z.ZodString;
    category: z.ZodEnum<["DIRECTIVE", "RULES", "TRAINING", "EXAM", "DISPATCH", "POLICY", "TEMPLATE", "OTHER"]>;
    description: z.ZodOptional<z.ZodString>;
    access: z.ZodDefault<z.ZodEnum<["ALL", "ROLES", "CONFIDENTIAL"]>>;
    roleIds: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    category: "TRAINING" | "OTHER" | "DISPATCH" | "TEMPLATE" | "EXAM" | "DIRECTIVE" | "RULES" | "POLICY";
    access: "ALL" | "ROLES" | "CONFIDENTIAL";
    description?: string | undefined;
    roleIds?: string | undefined;
    note?: string | undefined;
}, {
    title: string;
    category: "TRAINING" | "OTHER" | "DISPATCH" | "TEMPLATE" | "EXAM" | "DIRECTIVE" | "RULES" | "POLICY";
    description?: string | undefined;
    roleIds?: string | undefined;
    note?: string | undefined;
    access?: "ALL" | "ROLES" | "CONFIDENTIAL" | undefined;
}>;
type File = {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
};
/**
 * Dokumentenverwaltung: Metadaten + Versionen (jede Version bleibt erhalten, Wiederherstellen erzeugt eine neue Version).
 * Zugriff serverseitig je Dokument (Zugriffsgruppe), Dateien nur über diesen Dienst (nie direkt über /media), Download im Audit.
 * Dateitypen per Allowlist + Signatur (MediaService), Größe max. 10 MB, Auslieferung nur als Anhang mit sandbox-CSP.
 */
export declare class DocumentsService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly notify;
    private readonly media;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, notify: NotifyService, media: MediaService);
    private who;
    private assertSee;
    private parseRoles;
    private checkFile;
    private checkAccess;
    private view;
    private names;
    /** Suche/Filter; nur sichtbare Dokumente (Zugriffsgruppe), Archiv nur für Verwalter. */
    list(actor: Actor, f: {
        q?: string;
        category?: string;
        archived?: boolean;
    }): Promise<{
        canUpload: boolean;
        canManage: boolean;
        canConfidential: boolean;
        items: {
            versions?: {
                number: number;
                note: string | null;
                createdAt: Date;
                by: string;
                restoredFrom: number | null;
                file: {
                    originalName: string;
                    size: number;
                    mime: string;
                } | null;
            }[] | undefined;
            id: string;
            title: string;
            category: string;
            categoryLabel: string;
            description: string | null;
            access: string;
            roleIds: string[];
            status: string;
            currentVersion: number;
            url: string;
            createdAt: Date;
            updatedAt: Date;
            createdByName: string;
            updatedByName: string | null;
            version: number;
        }[];
    }>;
    get(actor: Actor, id: string): Promise<{
        versions?: {
            number: number;
            note: string | null;
            createdAt: Date;
            by: string;
            restoredFrom: number | null;
            file: {
                originalName: string;
                size: number;
                mime: string;
            } | null;
        }[] | undefined;
        id: string;
        title: string;
        category: string;
        categoryLabel: string;
        description: string | null;
        access: string;
        roleIds: string[];
        status: string;
        currentVersion: number;
        url: string;
        createdAt: Date;
        updatedAt: Date;
        createdByName: string;
        updatedByName: string | null;
        version: number;
    }>;
    create(actor: Actor, meta: z.infer<typeof docForm>, file?: File): Promise<{
        versions?: {
            number: number;
            note: string | null;
            createdAt: Date;
            by: string;
            restoredFrom: number | null;
            file: {
                originalName: string;
                size: number;
                mime: string;
            } | null;
        }[] | undefined;
        id: string;
        title: string;
        category: string;
        categoryLabel: string;
        description: string | null;
        access: string;
        roleIds: string[];
        status: string;
        currentVersion: number;
        url: string;
        createdAt: Date;
        updatedAt: Date;
        createdByName: string;
        updatedByName: string | null;
        version: number;
    }>;
    /** Neue Version hochladen – die bisherige bleibt erhalten. */
    addVersion(actor: Actor, id: string, note: string | undefined, file?: File): Promise<{
        versions?: {
            number: number;
            note: string | null;
            createdAt: Date;
            by: string;
            restoredFrom: number | null;
            file: {
                originalName: string;
                size: number;
                mime: string;
            } | null;
        }[] | undefined;
        id: string;
        title: string;
        category: string;
        categoryLabel: string;
        description: string | null;
        access: string;
        roleIds: string[];
        status: string;
        currentVersion: number;
        url: string;
        createdAt: Date;
        updatedAt: Date;
        createdByName: string;
        updatedByName: string | null;
        version: number;
    }>;
    private nextVersion;
    /** Ältere Version wiederherstellen = als neue Version übernehmen (nichts geht verloren). */
    restoreVersion(actor: Actor, id: string, number: number): Promise<{
        versions?: {
            number: number;
            note: string | null;
            createdAt: Date;
            by: string;
            restoredFrom: number | null;
            file: {
                originalName: string;
                size: number;
                mime: string;
            } | null;
        }[] | undefined;
        id: string;
        title: string;
        category: string;
        categoryLabel: string;
        description: string | null;
        access: string;
        roleIds: string[];
        status: string;
        currentVersion: number;
        url: string;
        createdAt: Date;
        updatedAt: Date;
        createdByName: string;
        updatedByName: string | null;
        version: number;
    }>;
    updateMeta(actor: Actor, id: string, m: z.infer<typeof docMeta> & {
        version: number;
    }): Promise<{
        versions?: {
            number: number;
            note: string | null;
            createdAt: Date;
            by: string;
            restoredFrom: number | null;
            file: {
                originalName: string;
                size: number;
                mime: string;
            } | null;
        }[] | undefined;
        id: string;
        title: string;
        category: string;
        categoryLabel: string;
        description: string | null;
        access: string;
        roleIds: string[];
        status: string;
        currentVersion: number;
        url: string;
        createdAt: Date;
        updatedAt: Date;
        createdByName: string;
        updatedByName: string | null;
        version: number;
    }>;
    setArchived(actor: Actor, id: string, archived: boolean): Promise<{
        versions?: {
            number: number;
            note: string | null;
            createdAt: Date;
            by: string;
            restoredFrom: number | null;
            file: {
                originalName: string;
                size: number;
                mime: string;
            } | null;
        }[] | undefined;
        id: string;
        title: string;
        category: string;
        categoryLabel: string;
        description: string | null;
        access: string;
        roleIds: string[];
        status: string;
        currentVersion: number;
        url: string;
        createdAt: Date;
        updatedAt: Date;
        createdByName: string;
        updatedByName: string | null;
        version: number;
    }>;
    /** Download (aktuelle oder bestimmte Version) – Zugriff je Abruf geprüft und im Audit festgehalten. */
    download(actor: Actor, id: string, number?: number): Promise<{
        filename: string;
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
}
export type DocumentRow = Prisma.DocumentGetPayload<{
    include: {
        versions: true;
    };
}>;
export {};
