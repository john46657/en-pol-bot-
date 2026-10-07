"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapError = mapError;
const api_1 = require("../api");
const format_1 = require("../format");
/** Übersetzt API-Fehler in kurze, verständliche Antworten (keine Stacktraces, Request-ID zur Fehlersuche). */
function mapError(e) {
    if (!(e instanceof api_1.BotApiError))
        return (0, format_1.errorReply)('Unerwarteter Fehler im Bot.');
    const rid = e.requestId ? ` (Request-ID \`${e.requestId}\`)` : '';
    if (e.status === 0)
        return (0, format_1.errorReply)('Das System ist gerade nicht erreichbar. Bitte später erneut versuchen.');
    if (e.status === 401 && e.reason === 'NOT_LINKED')
        return (0, format_1.errorReply)('Dein Discord-Konto ist nicht verknüpft. Erzeuge im Web (Menü → „Discord verknüpfen“) einen Code und nutze `/verknuepfen`.');
    if (e.status === 401)
        return (0, format_1.errorReply)(`Authentifizierung fehlgeschlagen.${rid}`);
    // Fachliche Begründungen (z. B. Server-Verbindung fehlt) mitgeben, die allgemeine Rechte-Meldung nicht (sonst doppelt)
    if (e.status === 403)
        return (0, format_1.errorReply)(/[äöüß]|Server|Einheit|Leitstelle/.test(e.message) && !/^You do not have permission|^This route|^Dafür fehlt dir die Berechtigung|steht dem Bot nicht zur Verfügung/.test(e.message) ? `Dazu hast du keine Berechtigung: ${e.message}` : 'Dazu hast du keine Berechtigung.');
    if (e.status === 404)
        return (0, format_1.errorReply)('Nicht gefunden.');
    if (e.status === 429)
        return (0, format_1.errorReply)('Zu viele Anfragen – bitte kurz warten.');
    if (e.status === 400 || e.status === 409)
        return (0, format_1.errorReply)(`${e.message}${rid}`);
    return (0, format_1.errorReply)(`Serverfehler.${rid}`);
}
//# sourceMappingURL=errors.js.map