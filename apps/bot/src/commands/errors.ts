import { BotApiError } from '../api';
import { errorReply, type Reply } from '../format';

/** Übersetzt API-Fehler in kurze, verständliche Antworten (keine Stacktraces, Request-ID zur Fehlersuche). */
export function mapError(e: unknown): Reply {
  if (!(e instanceof BotApiError)) return errorReply('Unerwarteter Fehler im Bot.');
  const rid = e.requestId ? ` (Request-ID \`${e.requestId}\`)` : '';
  if (e.status === 0) return errorReply('Das System ist gerade nicht erreichbar. Bitte später erneut versuchen.');
  if (e.status === 401 && e.reason === 'NOT_LINKED') return errorReply('Dein Discord-Konto ist nicht verknüpft. Erzeuge im Web (Menü → „Discord verknüpfen“) einen Code und nutze `/verknuepfen`.');
  if (e.status === 401) return errorReply(`Authentifizierung fehlgeschlagen.${rid}`);
  // Fachliche Begründungen (z. B. Server-Verbindung fehlt) mitgeben, die allgemeine Rechte-Meldung nicht (sonst doppelt)
  if (e.status === 403) return errorReply(/[äöüß]|Server|Einheit|Leitstelle/.test(e.message) && !/^You do not have permission|^This route|^Dafür fehlt dir die Berechtigung|steht dem Bot nicht zur Verfügung/.test(e.message) ? `Dazu hast du keine Berechtigung: ${e.message}` : 'Dazu hast du keine Berechtigung.');
  if (e.status === 404) return errorReply('Nicht gefunden.');
  if (e.status === 429) return errorReply('Zu viele Anfragen – bitte kurz warten.');
  if (e.status === 400 || e.status === 409) return errorReply(`${e.message}${rid}`);
  return errorReply(`Serverfehler.${rid}`);
}
