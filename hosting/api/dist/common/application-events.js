"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicationEvents = void 0;
/**
 * Entkoppelt das Einreichen einer Bewerbung von Folgeaufgaben (z. B. automatische KI-Prüfung), ohne Modul-Abhängigkeit im Kreis.
 * Die Folgeaufgabe läuft im Hintergrund: Fehler dort stoppen oder verzögern das Speichern der Bewerbung nie.
 */
exports.applicationEvents = {
    handlers: [],
    on(h) { this.handlers.push(h); return () => { this.handlers = this.handlers.filter((x) => x !== h); }; },
    submitted(a) {
        for (const h of this.handlers) {
            try {
                h(a);
            }
            catch (e) {
                console.error(`application follow-up failed for ${a.number}: ${e instanceof Error ? e.message : e}`);
            }
        }
    },
};
//# sourceMappingURL=application-events.js.map