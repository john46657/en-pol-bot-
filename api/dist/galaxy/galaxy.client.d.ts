export declare const GALAXY_FETCH = "GALAXY_FETCH";
export type LLMFetch = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
}) => Promise<{
    status: number;
    json(): Promise<unknown>;
}>;
/** Minimaler Claude-Messages-Client. Ohne AI_API_KEY ist Galaxy AI schlicht UNAVAILABLE (keine Fake-Antworten). */
export declare class GalaxyClient {
    private readonly env;
    private readonly doFetch;
    constructor(f?: LLMFetch);
    get enabled(): boolean;
    complete(system: string, user: string): Promise<string>;
}
