import { z } from 'zod';
import { helpCategorySchema, type HelpArticleInput } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { HelpService } from './help.service';
declare const listQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    kind: z.ZodOptional<z.ZodEnum<["ARTICLE", "GUIDE", "FAQ"]>>;
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "PUBLISHED", "ARCHIVED"]>>;
    page: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED" | undefined;
    kind?: "GUIDE" | "ARTICLE" | "FAQ" | undefined;
    categoryId?: string | undefined;
    page?: number | undefined;
    q?: string | undefined;
}, {
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED" | undefined;
    kind?: "GUIDE" | "ARTICLE" | "FAQ" | undefined;
    categoryId?: string | undefined;
    page?: number | undefined;
    q?: string | undefined;
}>;
/** Hilfe-Center (Dashboard + Bot `/hilfe`). */
export declare class HelpController {
    private readonly s;
    constructor(s: HelpService);
    categories(): import("@prisma/client").Prisma.PrismaPromise<({
        _count: {
            articles: number;
        };
    } & {
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        icon: string | null;
        position: number;
    })[]>;
    createCategory(a: Actor, b: z.infer<typeof helpCategorySchema>): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        icon: string | null;
        position: number;
    }>;
    saveCategory(a: Actor, id: string, b: z.infer<typeof helpCategorySchema>): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        icon: string | null;
        position: number;
    }>;
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
        total: number;
        page: number;
        pageSize: number;
        rows: {
            id: string;
            status: string;
            updatedAt: Date;
            version: number;
            title: string;
            category: {
                name: string;
            } | null;
            kind: string;
            categoryId: string | null;
            slug: string;
            summary: string | null;
            tags: string[];
            publishedAt: Date | null;
        }[];
    }>;
    get(a: Actor, id: string): Promise<{
        category: {
            id: string;
            name: string;
        } | null;
    } & {
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        kind: string;
        body: string;
        mediaIds: string[];
        updatedById: string | null;
        categoryId: string | null;
        slug: string;
        summary: string | null;
        tags: string[];
        publishedAt: Date | null;
    }>;
    create(a: Actor, b: HelpArticleInput & {
        version?: number;
    }): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        kind: string;
        body: string;
        mediaIds: string[];
        updatedById: string | null;
        categoryId: string | null;
        slug: string;
        summary: string | null;
        tags: string[];
        publishedAt: Date | null;
    }>;
    save(a: Actor, id: string, b: HelpArticleInput & {
        version?: number;
    }): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        kind: string;
        body: string;
        mediaIds: string[];
        updatedById: string | null;
        categoryId: string | null;
        slug: string;
        summary: string | null;
        tags: string[];
        publishedAt: Date | null;
    }>;
    revisions(id: string): Promise<{
        editedBy: string;
        id: string;
        status: string;
        createdAt: Date;
        version: number;
        title: string;
        body: string;
        summary: string | null;
        editedById: string;
        articleId: string;
        changeNote: string | null;
    }[]>;
}
export {};
