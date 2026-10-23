"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_COMMANDS = void 0;
const access_1 = require("../access");
const branding_1 = require("../branding");
const diagnostics_1 = require("../diagnostics");
const format_1 = require("../format");
const safety_1 = require("../safety");
const dur = (sec) => { const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60); return `${d ? `${d} T ` : ''}${h} h ${m} min`; };
const yesNo = (b) => (b === null ? '❔ unbekannt' : b ? '✅ ja' : '❌ nein');
/** Konfiguration aus dem System (Dashboard) – mit Wiederholung bei kurzen Aussetzern; fehlt sie, läuft die Diagnose trotzdem. */
async function systemConfig(c) {
    try {
        return { cfg: await (0, safety_1.withRetry)(() => (c.config ? c.config() : c.api.service('GET', '/bot/config'))) };
    }
    catch (e) {
        return { cfg: null, problem: (0, safety_1.isTransient)(e) ? 'System (API) nach mehreren Versuchen nicht erreichbar – Kanäle/Rollen aus dem Dashboard wurden nicht geprüft.' : 'Einstellungen aus dem System konnten nicht geladen werden.' };
    }
}
async function status(c) {
    const rt = c.runtime;
    const s = rt.status();
    const [api, cfg, backups] = await Promise.all([rt.apiHealth(), rt.guildConfig.get(c.guildId).catch(() => null), rt.backups.list(c.guildId).catch(() => [])]);
    const last = backups.find((b) => b.locations.length);
    const tone = !s.ready || !api.reachable || api.authOk === false ? 'danger' : 'success';
    const e = (0, branding_1.brand)(cfg, {
        title: '🩺 Systemstatus',
        fields: [
            { name: 'Discord', value: `${s.ready ? '🟢 verbunden' : '🔴 nicht verbunden'} · ${s.wsPing >= 0 ? `${s.wsPing} ms` : '—'} · ${s.guilds} Server`, inline: true },
            { name: 'Laufzeit', value: dur(s.uptimeSec), inline: true },
            { name: 'System (API)', value: `${api.reachable ? `🟢 erreichbar (${api.ms} ms)` : `🔴 nicht erreichbar${api.status ? ` (HTTP ${api.status})` : ''}`}\nBot-Zugang angenommen: ${yesNo(api.authOk)}`, inline: true },
            { name: 'Privilegierte Intents', value: `Server Members: ${yesNo(s.intents.members)} · Presence: ${yesNo(s.intents.presences)} · Message Content: ${yesNo(s.intents.content)}` },
            { name: 'Einrichtung', value: cfg ? `${cfg.setupDone ? '✅ abgeschlossen' : '⬜ noch nicht abgeschlossen'} (Revision ${cfg.revision})` : '❔ nicht lesbar', inline: true },
            { name: 'Letzte Bot-Sicherung', value: last ? `<t:${Math.floor(Date.parse(last.createdAt) / 1000)}:R> (${last.locations.join(' + ')})` : 'noch keine', inline: true },
            ...(rt.backupDirWarning ? [{ name: '⚠️ Sicherungsordner', value: rt.backupDirWarning }] : []),
        ],
        footer: 'Tokens und Schlüssel werden nie angezeigt.',
    }, tone);
    return { ephemeral: true, embeds: [e] };
}
async function diagnose(c) {
    const rt = c.runtime;
    const [snap, cfg, sys, api] = await Promise.all([rt.snapshot(c.guildId), rt.guildConfig.get(c.guildId, { fresh: true }), systemConfig(c), rt.apiHealth()]);
    if (!snap)
        return (0, format_1.errorReply)('Der Server konnte nicht gelesen werden (ist der Bot noch Mitglied?).');
    const findings = (0, diagnostics_1.diagnoseGuild)(snap, cfg, sys.cfg, rt.status());
    if (!api.reachable)
        findings.unshift({ severity: 'error', area: 'System (API)', text: 'Die EN-Polizei-API ist nicht erreichbar – Befehle mit Systemdaten schlagen fehl.', fix: 'Läuft das System? Stimmt API_URL in der Bot-Konfiguration?' });
    else if (api.authOk === false)
        findings.unshift({ severity: 'error', area: 'System (API)', text: 'Die API lehnt den Bot-Zugang ab.', fix: 'BOT_API_TOKEN des Bots muss exakt dem Wert im System entsprechen (Wert wird hier bewusst nicht angezeigt).' });
    if (sys.problem)
        findings.push({ severity: 'warn', area: 'System (API)', text: sys.problem });
    if (rt.backupDirWarning)
        findings.push({ severity: 'warn', area: 'Sicherungen', text: rt.backupDirWarning, fix: 'BOT_BACKUP_DIR auf einen Ordner außerhalb des Bot-Ordners setzen.' });
    const errors = findings.filter((f) => f.severity === 'error').length, warns = findings.filter((f) => f.severity === 'warn').length;
    return { ephemeral: true, embeds: [(0, branding_1.brand)(cfg, { title: `🔎 Diagnose: ${errors} Fehler, ${warns} Warnungen`, description: (0, safety_1.redact)((0, diagnostics_1.findingsText)(findings)) }, errors ? 'danger' : warns ? 'warning' : 'success')] };
}
async function integrations(c) {
    const rt = c.runtime;
    const s = rt.status();
    const [api, roblox, cfg, mods, ai] = await Promise.all([
        rt.apiHealth(), rt.robloxReachable(), rt.guildConfig.get(c.guildId).catch(() => null),
        (0, safety_1.withRetry)(() => c.api.service('GET', `/bot/servers/${c.guildId}/modules`)).catch(() => null),
        c.api.service('GET', `/bot/ai-review/status?guildId=${c.guildId}`).catch(() => null),
    ]);
    const lines = [
        `${s.ready ? '🟢' : '🔴'} **Discord Gateway** – ${s.ready ? `verbunden, ${s.wsPing} ms` : 'nicht verbunden'}`,
        `${api.reachable && api.authOk !== false ? '🟢' : '🔴'} **EN-Polizei-API** – ${api.reachable ? `erreichbar (${api.ms} ms), Bot-Zugang ${api.authOk === false ? 'abgelehnt' : api.authOk ? 'angenommen' : 'nicht geprüft'}` : 'nicht erreichbar'}`,
        `${roblox ? '🟢' : '🟠'} **Roblox (öffentliche Users-API)** – ${roblox ? 'erreichbar' : 'nicht erreichbar – Roblox-Namenssuche/-Prüfung im Bot eingeschränkt'}`,
        `${mods ? '🟢' : '🟠'} **Module dieses Servers (System)** – ${mods ? (mods.disabled.length ? `ausgeschaltet: ${mods.disabled.join(', ')}` : 'alle an') : 'nicht abrufbar'}`,
        // KI-Bewerbungsprüfung: nur ob ein Schlüssel hinterlegt ist (nie der Schlüssel selbst)
        ai ? `${ai.configured && ai.enabled ? '🟢' : '⚪'} **KI-Bewerbungsprüfung (Gemini)** – ${!ai.configured ? 'kein GEMINI_API_KEY auf dem Server hinterlegt' : !ai.enabled ? 'für diesen Server ausgeschaltet' : `eingerichtet, Modell ${ai.model}, ${ai.usedToday}/${ai.dailyLimit} Analysen in 24 h`}` : '🟠 **KI-Bewerbungsprüfung** – Status nicht abrufbar',
    ];
    return { ephemeral: true, embeds: [(0, branding_1.brand)(cfg, {
                title: '🔌 Integrationen',
                description: `${lines.join('\n')}\n\nWeitere Anbindungen (z. B. ER:LC, Zello Work) verwaltet das System selbst; der Bot hat dazu keinen direkten Zugang und zeigt deshalb keinen eigenen Status dafür an.`,
            })] };
}
exports.SYSTEM_COMMANDS = [{
        name: 'system', description: 'Technischer Status, Fehlerdiagnose und Integrationen (für Administratoren)',
        subcommands: [
            { name: 'status', description: 'Verbindung zu Discord und System, Laufzeit, letzte Sicherung' },
            { name: 'diagnose', description: 'Fehlende Bot-Rechte, nicht konfigurierte Kanäle und Rollen finden' },
            { name: 'integrations', description: 'Status der angebundenen Dienste' },
        ],
        async run(c) {
            const sub = String(c.opts._sub ?? 'status');
            const denied = await (0, access_1.guard)(c, `system ${sub}`);
            if (denied)
                return denied;
            if (!c.runtime || !c.guildId)
                return (0, format_1.errorReply)('Diagnose ist gerade nicht verfügbar.');
            try {
                if (sub === 'diagnose')
                    return await diagnose(c);
                if (sub === 'integrations')
                    return await integrations(c);
                return await status(c);
            }
            catch (e) {
                console.error('system command failed:', e instanceof Error ? e.message : e);
                return (0, format_1.errorReply)('Die Prüfung ist unerwartet fehlgeschlagen. Details stehen (ohne Geheimnisse) im Bot-Log.');
            }
        },
    }];
//# sourceMappingURL=system.js.map