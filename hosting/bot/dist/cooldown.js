"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cooldownText = void 0;
exports.createCooldowns = createCooldowns;
/** Obergrenze der gemerkten Einträge, damit der Speicher nicht wächst. */
const MAX_ENTRIES = 10_000;
function createCooldowns(seconds, now = Date.now) {
    const ms = Math.max(0, seconds) * 1000;
    const last = new Map();
    return {
        hit(userId, key) {
            if (ms === 0)
                return null;
            const id = `${userId}:${key}`;
            const t = now();
            const prev = last.get(id);
            if (prev !== undefined && t - prev < ms)
                return Math.ceil((ms - (t - prev)) / 1000);
            if (last.size >= MAX_ENTRIES) {
                for (const [k, v] of last)
                    if (t - v >= ms)
                        last.delete(k);
                if (last.size >= MAX_ENTRIES)
                    last.delete(last.keys().next().value); // ältesten Eintrag verwerfen
            }
            last.delete(id); // neu einfügen → Reihenfolge = Alter
            last.set(id, t);
            return null;
        },
    };
}
/** Verständlicher Hinweis für den Nutzer. */
const cooldownText = (left) => `⏳ Bitte kurz warten – du kannst diesen Befehl in ${left} Sekunde${left === 1 ? '' : 'n'} wieder nutzen.`;
exports.cooldownText = cooldownText;
//# sourceMappingURL=cooldown.js.map