import type { Response } from 'express';
import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { docForm, docMeta, DocumentsService } from './documents.service';
declare const listQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodEnum<["DIRECTIVE", "RULES", "TRAINING", "EXAM", "DISPATCH", "POLICY", "TEMPLATE", "OTHER"]>>;
    archived: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
}, "strip", z.ZodTypeAny, {
    category?: "OTHER" | "TRAINING" | "DISPATCH" | "TEMPLATE" | "EXAM" | "RULES" | "DIRECTIVE" | "POLICY" | undefined;
    q?: string | undefined;
    archived?: "true" | "false" | undefined;
}, {
    category?: "OTHER" | "TRAINING" | "DISPATCH" | "TEMPLATE" | "EXAM" | "RULES" | "DIRECTIVE" | "POLICY" | undefined;
    q?: string | undefined;
    archived?: "true" | "false" | undefined;
}>;
declare const versionForm: z.ZodObject<{
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    note?: string | undefined;
}, {
    note?: string | undefined;
}>;
declare const archiveBody: z.ZodObject<{
    archived: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    archived: boolean;
}, {
    archived: boolean;
}>;
/** Dokumente. Ansehen: documents.view (+ Zugriffsgruppe je Dokument) · hochladen/neue Version: documents.upload · Zugriff/Archiv/Wiederherstellen: documents.manage. */
export declare class DocumentsController {
    private readonly s;
    constructor(s: DocumentsService);
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
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
    get(a: Actor, id: string): Promise<{
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
    download(a: Actor, id: string, version: string | undefined, res: Response): Promise<void>;
    create(a: Actor, file: Express.Multer.File | undefined, b: z.infer<typeof docForm>): Promise<{
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
    addVersion(a: Actor, id: string, file: Express.Multer.File | undefined, b: z.infer<typeof versionForm>): Promise<{
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
    restore(a: Actor, id: string, n: number): Promise<{
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
    meta(a: Actor, id: string, b: z.infer<typeof docMeta> & {
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
    archive(a: Actor, id: string, b: z.infer<typeof archiveBody>): Promise<{
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
}
export {};
