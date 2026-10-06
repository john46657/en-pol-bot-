import { AsyncLocalStorage } from 'node:async_hooks';

/** Discord-Server der gerade bearbeiteten Interaktion – geht als `X-Guild-Id` an die API (Rechte gelten je Server). */
export const guildScope = new AsyncLocalStorage<string | null>();

/** Fehler der System-API (mit Request-ID, ohne Stacktrace). */
export class BotApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly requestId?: string, public readonly reason?: string) {
    super(message);
  }
}

/** Schmale Schnittstelle, die Befehle und Outbox brauchen – in Tests durch ein Fake ersetzbar. */
export interface Api {
  /** Im Namen eines verknüpften Discord-Benutzers (mit dessen Rechten). */
  asUser<T = unknown>(discordId: string, method: string, path: string, body?: unknown): Promise<T>;
  /** Dienst-zu-Dienst (kein Benutzerkontext): Verknüpfung, Outbox, Konfiguration. */
  service<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
}

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

export class HttpApi implements Api {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly doFetch: FetchFn = fetch as never) {}

  private async call<T>(method: string, path: string, discordId: string | null, body?: unknown): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    try {
      const res = await this.doFetch(`${this.baseUrl}/api/v1${path}`, {
        method, signal: ctl.signal,
        headers: { authorization: `Bot ${this.token}`, ...(discordId ? { 'x-discord-user': discordId } : {}), ...(discordId && guildScope.getStore() ? { 'x-guild-id': guildScope.getStore()! } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json: Record<string, unknown> | undefined;
      try { json = text ? (JSON.parse(text) as Record<string, unknown>) : undefined; } catch { json = undefined; }
      if (res.status >= 400) {
        const details = json?.details as { reason?: string } | undefined;
        throw new BotApiError(res.status, String(json?.code ?? 'ERROR'), String(json?.message ?? `HTTP ${res.status}`), json?.requestId as string | undefined, details?.reason);
      }
      return json as T;
    } catch (e) {
      if (e instanceof BotApiError) throw e;
      throw new BotApiError(0, 'UNREACHABLE', 'The EN Polizei API is not reachable.');
    } finally { clearTimeout(timer); }
  }

  asUser<T>(discordId: string, method: string, path: string, body?: unknown) { return this.call<T>(method, path, discordId, body); }
  service<T>(method: string, path: string, body?: unknown) { return this.call<T>(method, path, null, body); }
}
