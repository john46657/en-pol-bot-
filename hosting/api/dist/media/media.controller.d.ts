import type { Response } from 'express';
import { z } from 'zod';
import { MediaService } from './media.service';
import type { Actor } from '../audit/audit.service';
declare const link: z.ZodObject<{
    linkedType: z.ZodString;
    linkedId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    linkedType: string;
    linkedId: string;
}, {
    linkedType: string;
    linkedId: string;
}>;
export declare class MediaController {
    private readonly m;
    constructor(m: MediaService);
    upload(a: Actor, file: Express.Multer.File | undefined, b: z.infer<typeof link>): Promise<{
        id: string;
        originalName: string;
        mime: string;
        size: number;
        hash: string;
    }>;
    list(a: Actor, q: z.infer<typeof link>): Promise<{
        id: string;
        createdAt: Date;
        size: number;
        originalName: string;
        mime: string;
        hash: string;
    }[]>;
    download(a: Actor, id: string, res: Response): Promise<void>;
}
export {};
