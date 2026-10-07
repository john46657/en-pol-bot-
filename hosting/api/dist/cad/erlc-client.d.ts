/**
 * HTTP-Client für die ER:LC Private Server API (https://apidocs.erlc.gg).
 * - Eine Warteschlange je Server: Anfragen laufen nacheinander, nie parallel.
 * - Rate-Limits: X-RateLimit-* wird ausgewertet; bei 429 wird bis Retry-After NICHTS mehr gesendet (sonst drohen Sperren).
 * - Befehle: eigener Bucket (laut Doku 1 Anfrage / 5 s) – lokal zusätzlich abgesichert.
 * - Zeitlimit je Anfrage; Fehler kommen als Ergebnis zurück (keine Ausnahmen, keine Endlosschleifen).
 * Der Server-Key wird nur im Header `server-key` gesendet und taucht nie in Ergebnissen oder Fehlermeldungen auf.
 */
export type ErlcResult<T> = {
    ok: true;
    status: number;
    data: T;
    latencyMs: number;
} | {
    ok: false;
    status: number;
    code?: number;
    message: string;
    retryAfterMs?: number;
    latencyMs: number;
    network?: boolean;
};
export interface RateState {
    bucket: string;
    limit: number | null;
    remaining: number | null;
    resetAt: number | null;
    blockedUntil: number | null;
}
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export declare class ErlcClient {
    private readonly fetchFn;
    private readonly base;
    private servers;
    constructor(fetchFn?: FetchFn, base?: string);
    private s;
    /** Rate-Limit-Stand für die Anzeige im Dashboard. */
    rate(id: string): {
        blockedUntil: number | null;
        buckets: RateState[];
    };
    /** Gesperrt bis (ms) – solange keine Anfragen senden. */
    blockedFor(id: string, bucket?: string): number;
    /** Neuer Key: Bucket-Stände vergessen, eine laufende Sperre (429/Retry-After) aber behalten. */
    forget(id: string): void;
    fetchServer(id: string, key: string, include: string[]): Promise<ErlcResult<Record<string, unknown>>>;
    runCommand(id: string, key: string, command: string): Promise<ErlcResult<{
        message?: string;
    }>>;
    private request;
    private readRate;
}
/** Sicherheitsnetz: den Key niemals in Texten weitergeben, auch wenn die Gegenseite ihn zurückspiegelt. */
export declare const scrub: (text: string, key: string) => string;
export {};
