"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hireEvents = void 0;
/**
 * Entkoppelt Bewerbungen vom Personal-/Dienstnummern-System (keine Modul-Abhängigkeit im Kreis):
 * das Personalmodul meldet sich beim Start an, Bewerbungen melden Annahmen. Fehler stoppen die Entscheidung nie.
 */
exports.hireEvents = {
    handler: null,
    async accepted(actor, a) {
        if (!this.handler)
            return;
        try {
            await this.handler(actor, a);
        }
        catch (e) {
            console.error(`hire automation failed for ${a.number}: ${e instanceof Error ? e.message : e}`);
        }
    },
};
//# sourceMappingURL=hire-events.js.map