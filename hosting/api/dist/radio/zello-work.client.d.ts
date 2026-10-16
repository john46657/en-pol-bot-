/**
 * Client für die offizielle Zello-Work-Server-API (https://zellowork.com/api, Version 1.1.0, geprüft am 16.10.2026).
 * Verwendet NUR dort dokumentierte Endpunkte:
 *   GET  /user/gettoken                       → token + sid
 *   POST /user/auth?sid=…                     → username, password (Klartext über TLS), api_mac = HMAC-SHA256(api_key, username + ":" + token)
 *   GET  /user/logout?sid=…
 *   GET  /channel/get/name/{name}?sid=…       → Kanal prüfen (Verbindungstest)
 *   POST /user/addto/{channel}?sid=…          → login[] (Benutzer in den Kanal)
 *   POST /user/removefrom/{channel}?sid=…     → login[] (Benutzer aus dem Kanal)
 * Antworten: JSON mit `status` und `code` ("200" = OK). Der API-Schlüssel wird nie gesendet, Zugangsdaten und Sitzungs-ID
 * erscheinen nie in Fehlermeldungen. Die kostenlose Zello-App (Consumer-Kanäle) hat KEINE solche API.
 * Hinweis: gegen ein echtes Zello-Work-Netzwerk ist dieser Client nicht getestet (keine Zugangsdaten vorhanden).
 */
export interface ZelloCredentials {
    network: string;
    username: string;
    password: string;
    apiKey: string;
}
type FetchFn = (url: string, init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    signal: AbortSignal;
}) => Promise<{
    status: number;
    text(): Promise<string>;
}>;
/** Fehlercodes laut Dokumentation (Auszug) → verständlicher Text. */
export declare const ZELLO_ERRORS: Record<string, string>;
export declare class ZelloError extends Error {
    readonly code: string | null;
    constructor(message: string, code?: string | null);
}
/** Basis-URL laut Dokumentation: https://<netzwerk>.zellowork.com (Netzwerkname = Subdomain der Web-Konsole). */
export declare function zelloBaseUrl(network: string): string;
export declare const zelloApiMac: (apiKey: string, username: string, token: string) => string;
export declare class ZelloWorkClient {
    private readonly creds;
    private readonly doFetch;
    private readonly timeoutMs;
    private sid;
    private readonly base;
    constructor(creds: ZelloCredentials, doFetch?: FetchFn, timeoutMs?: number);
    private call;
    /** Anmeldung in zwei Schritten (gettoken → auth). Nach einem Fehlversuch ist das Token laut Doku verbraucht. */
    login(): Promise<void>;
    logout(): Promise<void>;
    /** Prüft, ob der Kanal existiert (Code 404 → false). */
    channelExists(channel: string): Promise<boolean>;
    addToChannel(channel: string, logins: string[]): Promise<void>;
    removeFromChannel(channel: string, logins: string[]): Promise<void>;
}
export {};
