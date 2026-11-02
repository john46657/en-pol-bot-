import { Prisma } from '@prisma/client';
import { type HelpArticleInput } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
/**
 * Hilfe-Center (Wissensdatenbank): Kategorien und Artikel (Artikel, Anleitung, FAQ) mit Veröffentlichungsstatus und
 * Änderungsverlauf. Lesen: `help.view` (nur veröffentlichte); Bearbeiten: `help.manage` (auch Entwürfe/Archiv).
 * Keine Inhalte sind vorgegeben – alles legen berechtigte Administratoren im Dashboard an.
 */
export declare class HelpService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService);
    private manager;
    categories(): Prisma.PrismaPromise<({
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
    saveCategory(actor: Actor, d: {
        name: string;
        description?: string | null;
        icon?: string | null;
        position?: number;
    }, id?: string): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        icon: string | null;
        position: number;
    }>;
    /** Suche (serverseitig, Titel/Zusammenfassung/Text/Schlagwörter), Filter nach Kategorie/Art/Status, Seiten. */
    list(actor: Actor, q: {
        q?: string;
        categoryId?: string;
        kind?: string;
        status?: string;
        page?: number;
    }): Promise<{
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
    get(actor: Actor, idOrSlug: string): Promise<{
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
    private uniqueSlug;
    save(actor: Actor, d: HelpArticleInput & {
        version?: number;
    }, id?: string): Promise<{
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
