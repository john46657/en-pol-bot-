export declare const ERLC_FETCH = "ERLC_FETCH";
export type FetchLike = (url: string, init: {
    headers: Record<string, string>;
    signal: AbortSignal;
}) => Promise<{
    status: number;
    headers: {
        get(n: string): string | null;
    };
    json(): Promise<unknown>;
}>;
export interface RateLimitInfo {
    bucket?: string;
    limit?: number;
    remaining?: number;
    resetAt?: Date;
}
export declare class ERLCError extends Error {
    readonly kind: 'NOT_CONFIGURED' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'UPSTREAM' | 'NETWORK' | 'INVALID_RESPONSE';
    readonly retryAfterSeconds?: number | undefined;
    constructor(kind: 'NOT_CONFIGURED' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'UPSTREAM' | 'NETWORK' | 'INVALID_RESPONSE', message: string, retryAfterSeconds?: number | undefined);
}
/** Dünner HTTP-Client für die dokumentierte ER:LC-API (Header `server-key`). Ruft nur Endpunkte auf, die in der Doku stehen. */
export declare class ERLCClient {
    private readonly env;
    private readonly doFetch;
    constructor(f?: FetchLike);
    get configured(): boolean;
    get<T>(path: string, opts?: {
        timeoutMs?: number;
        retries?: number;
    }): Promise<{
        data: T;
        latencyMs: number;
        rateLimit: RateLimitInfo;
    }>;
}
