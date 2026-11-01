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
        avatar: string | null;
    }>;
    /** Namen des Webhooks in Discord ändern (mit Token möglich; Kanal ändern geht nur mit Bot-Rechten und wird hier nicht angeboten). */
    rename(url: string, name: string): Promise<{
        name: string;
    }>;
    /** Vom Webhook gesendete Nachricht bearbeiten (im Thread: `thread_id`). */
    edit(url: string, messageId: string, body: Record<string, unknown>, threadId?: string | null): Promise<{
        messageId: string;
    }>;
    /** Nachricht senden (`wait=true` → Discord liefert die Nachricht samt ID; `with_components=true` → Link-Buttons erlaubt). */
    execute(url: string, body: Record<string, unknown>, opts?: {
        threadId?: string | null;
    }): Promise<{
        messageId: string;
        channelId: string | null;
    }>;
}
export {};
