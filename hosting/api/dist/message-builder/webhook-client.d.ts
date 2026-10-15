/** Discord-Webhook-URL (nur offizielle Discord-Hosts). Das Token in der URL ist geheim. */
export declare const WEBHOOK_URL: RegExp;
type FetchFn = (url: string, init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{
    status: number;
    headers: {
        get(name: string): string | null;
    };
    text(): Promise<string>;
}>;
export declare class DiscordHttpError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/**
 * Direkter Aufruf von Discord-Webhooks aus der API (der Bot-Token wird dafür nicht gebraucht).
 * Beachtet Discord-Rate-Limits: bei 429 wird `retry_after` abgewartet (höchstens 3 Versuche, je max. 30 s).
 * Fehlermeldungen enthalten nie die Webhook-URL.
 */
export declare class WebhookClient {
    /** In Tests ersetzbar. */
    fetch: FetchFn;
    /** In Tests verkürzbar. */
    sleep: (ms: number) => Promise<unknown>;
    private call;
    /** Webhook-Daten (Server, Kanal, Name) – prüft, dass die URL gültig ist. */
    info(url: string): Promise<{
        id: string;
        guildId: string | null;
        channelId: string | null;
        name: string | null;
    }>;
    /** Nachricht senden (`wait=true` → Discord liefert die Nachricht samt ID; `with_components=true` → Link-Buttons erlaubt). */
    execute(url: string, body: Record<string, unknown>): Promise<{
        messageId: string;
    }>;
}
export {};
