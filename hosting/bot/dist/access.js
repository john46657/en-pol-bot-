"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guard = exports.POLICIES = exports.levelsConfigured = exports.RANK = void 0;
exports.levelOf = levelOf;
exports.allowed = allowed;
exports.policyFor = policyFor;
exports.authorize = authorize;
const guild_config_1 = require("./guild-config");
/**
 * Zentrales Stufen-Rechtesystem des Bots: Serveradministrator > Polizeiführung > Ausbilder > Beamter > Nur lesend.
 * Geprüft wird immer gegen die TATSÄCHLICHEN Discord-Rollen, frisch von Discord geladen (nicht aus der Nachricht).
 * Zusätzlich gelten bei allen Aufrufen ins System weiterhin die Rechte der API (verknüpftes Konto).
 */
exports.RANK = { admin: 5, leadership: 4, instructor: 3, officer: 2, readonly: 1, none: 0 };
/** Ist das Stufen-System auf dem Server eingerichtet (mind. eine Rolle zugeordnet)? */
const levelsConfigured = (cfg) => guild_config_1.ACCESS_LEVELS.some((l) => cfg.roles[l].length > 0);
exports.levelsConfigured = levelsConfigured;
/** Höchste Stufe des Mitglieds. Inhaber, „Administrator“ und „Server verwalten“ sind immer Serveradministrator. */
function levelOf(m, cfg) {
    if (m.isOwner || m.administrator || m.manageGuild)
        return 'admin';
    for (const l of guild_config_1.ACCESS_LEVELS)
        if (cfg.roles[l].some((r) => m.roleIds.includes(r)))
            return l;
    return 'none';
}
/** Reicht die Stufe? Solange keine Rollen zugeordnet sind, gelten nur die Verwaltungsstufen (Admin/Führung/Ausbilder → Discord-Admin). */
function allowed(m, cfg, need) {
    const have = levelOf(m, cfg);
    if (exports.RANK[have] >= exports.RANK[need])
        return true;
    // noch nicht eingerichtet: Beamte/Lesende nicht aussperren (die API prüft ohnehin jedes Recht)
    return !(0, exports.levelsConfigured)(cfg) && exports.RANK[need] <= exports.RANK.officer;
}
exports.POLICIES = {
    setup: { level: 'admin' },
    'setup:*': { level: 'admin' },
    'system status': { level: 'leadership' },
    'system diagnose': { level: 'admin' },
    'system integrations': { level: 'admin' },
    'sys:*': { level: 'admin' },
    backup: { level: 'admin' },
    'bak:*': { level: 'admin' },
    'bak:confirm': { level: 'admin', sensitive: true },
    'bak:apply': { level: 'admin', sensitive: true },
    'pruefung liste': { level: 'readonly' },
    'pruefung ergebnisse': { level: 'readonly' },
    'pruefung ausbildungen': { level: 'readonly' },
    'pruefung verwalten': { level: 'instructor' },
    'pruefung bewerten': { level: 'instructor' },
    'exam:open': { level: 'readonly' },
    'exam:*': { level: 'officer' },
    'exam:adm': { level: 'instructor' }, 'exam:admv': { level: 'instructor' }, 'exam:res': { level: 'instructor' }, 'exam:post': { level: 'instructor' },
    'exam:toggle': { level: 'instructor' }, 'exam:togglec': { level: 'instructor', sensitive: true },
    'exam:g': { level: 'instructor' }, 'exam:gin': { level: 'instructor' }, 'exam:gm': { level: 'instructor' },
    'exam:void': { level: 'instructor' }, 'exam:vm': { level: 'instructor', sensitive: true },
    'exam:pend': { level: 'instructor' },
    botprofil: { level: 'admin' },
};
/** Richtlinie für einen Befehl/eine Interaktion (genau → Wildcard `prefix:*`). */
function policyFor(key) {
    if (exports.POLICIES[key])
        return exports.POLICIES[key];
    const [name] = key.split(/[ :]/);
    if (key.includes(':'))
        return exports.POLICIES[`${name}:*`];
    return exports.POLICIES[name];
}
const deny = (text) => ({ content: `⛔ ${text}`, ephemeral: true });
/** Prüft eine Richtlinie für den Aufrufer; liefert `null` (erlaubt) oder eine verständliche, private Ablehnung. */
async function authorize(deps, a, key) {
    const p = policyFor(key);
    if (!p)
        return null;
    if (!a.guildId)
        return deny('Das geht nur auf einem Discord-Server, nicht per Direktnachricht.');
    if (!deps)
        return deny('Die Rechteprüfung ist gerade nicht verfügbar – Aktion aus Sicherheitsgründen abgelehnt.');
    let member;
    let cfg;
    try {
        [member, cfg] = await Promise.all([deps.member(a.guildId, a.userId), deps.config(a.guildId)]);
    }
    catch {
        return deny('Deine Rollen konnten gerade nicht geprüft werden – Aktion aus Sicherheitsgründen abgelehnt. Bitte gleich noch einmal versuchen.');
    }
    if (!member)
        return deny('Du bist auf diesem Server nicht (mehr) Mitglied.');
    if (allowed(member, cfg, p.level))
        return null;
    const have = levelOf(member, cfg);
    return deny(`Dafür brauchst du mindestens die Stufe **${guild_config_1.LEVEL_LABEL[p.level]}**. Deine Stufe: **${have === 'none' ? 'keine' : guild_config_1.LEVEL_LABEL[have]}**.\nDie Stufen ordnet ein Serveradministrator unter \`/setup\` → **Rollen** Discord-Rollen zu.`);
}
/** Kurzform für Befehle/Interaktionen: Prüfung mit den Laufzeit-Daten aus dem Kontext. */
const guard = (c, key) => authorize(c.runtime?.access, { guildId: c.guildId, userId: c.discordId }, key);
exports.guard = guard;
//# sourceMappingURL=access.js.map