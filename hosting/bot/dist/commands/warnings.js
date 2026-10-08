"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WARNING_COMMANDS = void 0;
const format_1 = require("../format");
const errors_1 = require("./errors");
/** /verwarnen: Verwarnung in die Personalakte – Meldung im Verwarnungs-Kanal, DM und Folgen bei der Grenze macht das System. */
exports.WARNING_COMMANDS = [{
        name: 'verwarnen', description: 'Teammitglied verwarnen (landet in der Personalakte)',
        options: [
            { name: 'mitglied', description: 'Wer wird verwarnt?', type: 'user', required: true },
            { name: 'grund', description: 'Grund, z. B. „Shift Abuse“', type: 'string', required: true, maxLength: 300 },
            { name: 'schweregrad', description: 'Standard: Verwarnung', type: 'string', choices: [{ name: 'Verwarnung', value: 'WARNING' }, { name: 'Abmahnung', value: 'REPRIMAND' }, { name: 'Schwerwiegender Verstoß', value: 'SEVERE' }] },
        ],
        async run(c) {
            try {
                const r = await c.api.asUser(c.discordId, 'POST', '/hr/warnings/discord', { discordId: String(c.opts.mitglied ?? ''), reason: String(c.opts.grund ?? '').trim(), ...(c.opts.schweregrad ? { severity: String(c.opts.schweregrad) } : {}) });
                return (0, format_1.okReply)(`<@${c.opts.mitglied}> wurde verwarnt – **${r.count}/${r.limit}**${r.count >= r.limit ? ' ⛔ Grenze erreicht.' : '.'}`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    }];
//# sourceMappingURL=warnings.js.map