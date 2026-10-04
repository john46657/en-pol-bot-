import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
export type WebhookResult = {
    status: 'processed' | 'duplicate';
    eventId?: string;
};
/**
 * Pipeline: Receive → Authenticate → Validate → Normalize → Deduplicate → Process → Audit → Update.
 * Signatur: Ed25519 über (timestamp + rawBody) – laut ER:LC-Doku. Replay-Schutz: Zeitfenster + Dedupe-Key.
 */
export declare class ERLCWebhookService {
    private readonly prisma;
    private readonly audit;
    private readonly env;
    constructor(prisma: PrismaService, audit: AuditService);
    verifySignature(rawBody: Buffer, signatureHex: string | undefined, timestamp: string | undefined): boolean;
    private reject;
    receive(rawBody: Buffer | undefined, headers: {
        signature?: string;
        timestamp?: string;
    }, ctx: {
        ip?: string;
        requestId?: string;
    }): Promise<WebhookResult>;
}
