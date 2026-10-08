"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hireEvents = void 0;
const guild_context_1 = require("./guild-context");
/**
 * Entkoppelt Bewerbungen vom Personal-/Dienstnummern-System (keine Modul-Abhängigkeit im Kreis):
 * das Personalmodul meldet sich beim Start an, Bewerbungen melden Annahmen. Fehler stoppen die Entscheidung nie.
 * Personalakte und Dienstnummer entstehen auf dem Server der Bewerbung (sonst auf dem gewählten Server).
 */
exports.hireEvents = {
    handler: null,
    async accepted(actor, a) {
        if (!this.handler)
            return;
        try {
            const h = this.handler;
            await (0, guild_context_1.runInGuild)(a.guildId || (0, guild_context_1.currentGuild)(), () => h(actor, a));
        }
        catch (e) {
            console.error(`Einstellungs-Automatik für ${a.number} fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
        }
    },
};
//# sourceMappingURL=hire-events.js.map