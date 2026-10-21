"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.visibleCommands = exports.moduleOfCommand = exports.toneColor = void 0;
exports.brand = brand;
exports.brandReply = brandReply;
const shared_1 = require("@enrp/shared");
const format_1 = require("./format");
const guild_config_1 = require("./guild-config");
const FALLBACK = { primary: format_1.COLORS.info, success: format_1.COLORS.success, warning: format_1.COLORS.warning, danger: format_1.COLORS.danger };
/** Farbe des Servers für einen Zweck (eigene Farben aus /setup, sonst die Standardfarben). */
const toneColor = (cfg, tone) => (0, guild_config_1.colorOf)(cfg?.colors[tone], FALLBACK[tone]);
exports.toneColor = toneColor;
/** Embed im Stil des Servers: Farbe, Kopfzeile mit Anzeigename + Logo, Servername in der Fußzeile. */
function brand(cfg, e, tone = 'primary') {
    const b = cfg?.branding;
    const head = b?.displayName || b?.serverName;
    return {
        ...e, color: (0, exports.toneColor)(cfg, tone),
        ...(head && !e.author ? { author: { name: head, ...(b?.logoUrl ? { iconUrl: b.logoUrl } : {}) } } : {}),
        ...(b?.serverName && !e.footer ? { footer: b.serverName } : {}),
    };
}
/** „Farben auf alle Bot-Antworten anwenden“: Standardfarben der übrigen Befehle durch die des Servers ersetzen. */
function brandReply(r, cfg) {
    if (!cfg?.branding.applyToAll || !r.embeds?.length)
        return r;
    const map = new Map([[format_1.COLORS.info, (0, exports.toneColor)(cfg, 'primary')], [format_1.COLORS.success, (0, exports.toneColor)(cfg, 'success')], [format_1.COLORS.warning, (0, exports.toneColor)(cfg, 'warning')], [format_1.COLORS.danger, (0, exports.toneColor)(cfg, 'danger')]]);
    return { ...r, embeds: r.embeds.map((e) => (e.color !== undefined && map.has(e.color) ? { ...e, color: map.get(e.color) } : e)) };
}
/** Neue Befehle des Bots, die zu einem Modul gehören (die übrigen stehen im gemeinsamen Katalog). */
const LOCAL_COMMAND_MODULES = { pruefung: 'personnel' };
const moduleOfCommand = (name) => shared_1.BOT_COMMAND_MODULES[name] ?? LOCAL_COMMAND_MODULES[name] ?? 'core';
exports.moduleOfCommand = moduleOfCommand;
/** Befehle, die auf einem Server sichtbar sind (Module aus im System ODER im Bot → ausgeblendet; Daten bleiben). */
const visibleCommands = (all, disabled) => all.filter((c) => !disabled.includes((0, exports.moduleOfCommand)(c.name)));
exports.visibleCommands = visibleCommands;
//# sourceMappingURL=branding.js.map