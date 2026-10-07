import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
export declare const MAX_BYTES: number;
export declare class MediaService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly dir;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService);
    upload(actor: Actor, file: {
        originalname: string;
        mimetype: string;
        buffer: Buffer;
        size: number;
    }, link: {
        linkedType: string;
        linkedId: string;
    }, maxBytes?: number): Promise<{
        id: string;
        originalName: string;
        mime: string;
        size: number;
        hash: string;
    }>;
    download(actor: Actor, id: string): Promise<{
        media: {
            id: string;
            createdAt: Date;
            size: number;
            originalName: string;
            mime: string;
            hash: string;
            storageKey: string;
            uploaderId: string;
            linkedType: string | null;
            linkedId: string | null;
        };
        data: NonSharedBuffer;
    }>;
    list(actor: Actor, linkedType: string, linkedId: string): Promise<{
        id: string;
        createdAt: Date;
        size: number;
        originalName: string;
        mime: string;
        hash: string;
    }[]>;
    /** Für den Bot (ohne Benutzer): nur als Willkommens-Banner hochgeladene Bilder. */
    welcomeBanner(id: string): Promise<{
        mime: string;
        name: string;
        data: NonSharedBuffer;
    }>;
    /** Für den Bot: im Embed-Baukasten hochgeladene Bilder (Banner, Thumbnail, Icons). */
    embedAsset(id: string): Promise<{
        mime: string;
        name: string;
        data: NonSharedBuffer;
    }>;
    private botImage;
}
