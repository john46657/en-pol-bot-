"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeVehicle = exports.CAPABILITY_MESSAGE = void 0;
exports.normalizePlayer = normalizePlayer;
exports.CAPABILITY_MESSAGE = 'ER:LC capability unavailable. The configured integration does not currently provide this functionality.';
/** "Name:Id" → getrennt. Ungültige Formate ergeben robloxUserId=null (keine Identität wird geraten). */
function normalizePlayer(p) {
    const i = p.Player.lastIndexOf(':');
    const id = i > 0 ? p.Player.slice(i + 1) : '';
    return { name: i > 0 ? p.Player.slice(0, i) : p.Player, robloxUserId: /^[1-9]\d{0,17}$/.test(id) ? id : null, permission: p.Permission, team: p.Team, callsign: p.Callsign ?? null };
}
const normalizeVehicle = (v) => ({ model: v.Name, owner: v.Owner, texture: v.Texture ?? null });
exports.normalizeVehicle = normalizeVehicle;
//# sourceMappingURL=erlc.types.js.map