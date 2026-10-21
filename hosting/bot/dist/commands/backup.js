"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKUP_INTERACTION = exports.BACKUP_COMMANDS = exports._plansForTests = void 0;
const node_crypto_1 = require("node:crypto");
const api_1 = require("../api");
const access_1 = require("../access");
const branding_1 = require("../branding");
const format_1 = require("../format");
const safety_1 = require("../safety");
const ts = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `<t:${Math.floor(Date.parse(iso) / 1000)}:f>` : '—');
const kb = (n) => (n === undefined ? '—' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const metaLine = (b) => `• \`${b.name}\` – ${ts(b.createdAt)} · ${b.locations.length ? b.locations.join(' + ') : '⚠️ nur Eintrag, Inhalt nicht mehr vorhanden'}${b.database ? ` · DB: \`${b.database.name}\`` : ''}`;
/** Geplante Wiederherstellungen (kurzlebig; nach einem Neustart einfach neu planen). */
const PLANS = new Map();
const PLAN_TTL = 10 * 60_000;
const takePlan = (token, c) => {
    for (const [k, v] of PLANS)
        if (v.expires < Date.now())
            PLANS.delete(k);
    const p = PLANS.get(token);
    return p && p.userId === c.discordId && p.guildId === c.guildId ? p : null;
};
exports._plansForTests = PLANS;
async function dbBackups(c) {
    try {
        return { list: await (0, safety_1.withRetry)(() => c.api.asUser(c.discordId, 'GET', '/backups/data')) };
    }
    catch (e) {
        if (e instanceof api_1.BotApiError && (e.status === 401 || e.status === 403))
            return { list: null, note: 'Datenbank-Sicherungen sehen nur verknüpfte Konten mit dem System-Recht `settings.manage`.' };
        return { list: null, note: 'Datenbank-Sicherungen konnten nicht abgerufen werden (System nicht erreichbar?).' };
    }
}
async function status(c) {
    const rt = c.runtime;
    const [bot, db, cfg] = await Promise.all([rt.backups.list(c.guildId), dbBackups(c), rt.guildConfig.get(c.guildId).catch(() => null)]);
    const lastBot = bot.find((b) => b.locations.length);
    const lastDb = db.list?.[0];
    return { ephemeral: true, embeds: [(0, branding_1.brand)(cfg, {
                title: '🗄️ Sicherungsstatus',
                fields: [
                    { name: 'Letzte Bot-Sicherung (Einstellungen dieses Servers)', value: lastBot ? `${ts(lastBot.createdAt)} – \`${lastBot.name}\`\nAblage: ${lastBot.locations.join(' + ')}` : 'noch keine – `/backup erstellen`' },
                    { name: 'Letzte Datenbank-Sicherung (System)', value: lastDb ? `${ts(lastDb.createdAt)} – \`${lastDb.name}\` (${lastDb.kind}, ${kb(lastDb.size)})` : db.note ?? 'noch keine' },
                    { name: 'Bot-Sicherungen', value: (bot.slice(0, 8).map(metaLine).join('\n') || '—').slice(0, 1024) },
                    { name: 'Ablageorte', value: `Datei: \`${rt.backups.files.location}\`\nDatenbank: Kopie der letzten Sicherungen im System${rt.backupDirWarning ? `\n⚠️ ${rt.backupDirWarning}` : ''}`.slice(0, 1024) },
                ],
                footer: 'Sicherungen enthalten keine Tokens oder Schlüssel.',
            }, rt.backupDirWarning ? 'warning' : 'primary')] };
}
async function create(c) {
    const rt = c.runtime;
    const notes = [];
    // 1. Datenbank (Ausbildungs-/Prüfungsdaten und alle Beziehungen) – über die vorhandene System-Funktion, KEINE Wiederholung (legt etwas an)
    let database = null;
    try {
        const r = await c.api.asUser(c.discordId, 'POST', '/backups/data');
        database = { name: r.name, rows: r.rows, size: r.size };
    }
    catch (e) {
        notes.push(e instanceof api_1.BotApiError && (e.status === 401 || e.status === 403)
            ? '⚠️ Datenbank-Sicherung nicht angelegt: dafür braucht dein verknüpftes Konto das System-Recht `settings.manage`.'
            : '⚠️ Datenbank-Sicherung nicht angelegt (System nicht erreichbar?).');
    }
    // 2. Bot-Einstellungen dieses Servers
    try {
        const { meta, problems } = await rt.backups.create(c.guildId, { reason: 'manuell', by: c.discordId, guildName: null, database });
        notes.push(...problems.map((p) => `⚠️ ${p}`));
        const cfg = await rt.guildConfig.get(c.guildId).catch(() => null);
        return { ephemeral: true, embeds: [(0, branding_1.brand)(cfg, {
                    title: '✅ Sicherung angelegt',
                    description: [
                        `**Bot-Einstellungen:** \`${meta.name}\` (${meta.locations.join(' + ')})`,
                        `Prüfsumme: \`${meta.checksum.slice(0, 16)}…\``,
                        database ? `**Datenbank:** \`${database.name}\` – ${database.rows ?? '?'} Zeilen, ${kb(database.size)} (im Speicherordner des Systems)` : '**Datenbank:** –',
                        ...(notes.length ? ['', ...notes] : []),
                    ].join('\n'),
                }, notes.length ? 'warning' : 'success')] };
    }
    catch (e) {
        return (0, format_1.errorReply)(`Bot-Sicherung fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannter Fehler'}${database ? ` (Datenbank-Sicherung \`${database.name}\` wurde angelegt)` : ''}`);
    }
}
async function chooser(c) {
    const rt = c.runtime;
    const list = (await rt.backups.list(c.guildId)).filter((b) => b.locations.length).slice(0, 25);
    const cfg = await rt.guildConfig.get(c.guildId).catch(() => null);
    const text = [
        'Wähle eine Sicherung. Danach wird sie **geprüft** (Format, Server, Prüfsumme, keine Geheimnisse), in einer **abgeschotteten Testumgebung** eingespielt und ein **Wiederherstellungsplan** mit allen Änderungen angezeigt. Erst nach deiner ausdrücklichen Bestätigung wird etwas verändert – und vorher wird der aktuelle Stand automatisch gesichert.',
        '',
        '**Datenbank (Ausbildungen, Prüfungen, Personal …):** stellt der Bot bewusst nicht wieder her – das ersetzt den gesamten Datenbestand aller Server. Bitte zuerst in einer Testumgebung prüfen (siehe `docs/bot-erweiterung.md`) und dann im System einspielen; das System sichert dabei vorher automatisch.',
    ].join('\n');
    if (!list.length)
        return { ephemeral: true, embeds: [(0, branding_1.brand)(cfg, { title: '♻️ Wiederherstellen', description: `${text}\n\nEs gibt noch keine Bot-Sicherung für diesen Server – \`/backup erstellen\`.` })] };
    return { ephemeral: true, embeds: [(0, branding_1.brand)(cfg, { title: '♻️ Wiederherstellen', description: text })],
        select: { id: 'bak:plan', placeholder: 'Sicherung wählen …', options: list.map((b) => ({ label: b.name.slice(0, 100), value: b.name, description: `${new Date(b.createdAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · ${b.locations.join(' + ')}`.slice(0, 100) })) } };
}
function planReply(c, plan, token, cfg) {
    const ok = !plan.problems.length && plan.sandboxOk;
    const lines = [
        `**Sicherung:** \`${plan.name}\`${plan.snapshot?.createdAt ? ` vom ${ts(plan.snapshot.createdAt)}` : ''}`,
        `**Prüfung:** ${plan.problems.length ? '❌ nicht bestanden' : '✅ Format, Server, Prüfsumme, keine Geheimnisse'}`,
        `**Testumgebung:** ${plan.sandboxOk ? '✅ Testwiederherstellung erfolgreich (frisch gelesen identisch)' : '❌ nicht erfolgreich'}`,
        ...plan.problems.map((p) => `❌ ${p}`),
        '',
        `**Änderungen (${plan.changes.length}):**`,
        ...(plan.changes.length ? plan.changes.slice(0, 20).map((x) => `• \`${x}\``) : ['• keine – aktueller Stand entspricht der Sicherung']),
        ...(plan.changes.length > 20 ? [`… ${plan.changes.length - 20} weitere`] : []),
        ...(plan.warnings.length ? ['', ...plan.warnings.map((w) => `⚠️ ${w}`)] : []),
        '',
        ok ? '**Ablauf nach Bestätigung:** 1. aktueller Stand wird gesichert · 2. Sicherung erneut geprüft · 3. Einstellungen eingespielt (nur, wenn sich seit diesem Plan nichts geändert hat).' : 'Diese Sicherung kann nicht eingespielt werden.',
    ];
    return { ephemeral: true, panel: true, embeds: [(0, branding_1.brand)(cfg, { title: '📋 Wiederherstellungsplan', description: lines.join('\n').slice(0, 4000) }, ok ? 'warning' : 'danger')],
        buttons: ok && token && plan.changes.length ? [{ id: `bak:confirm:${token}`, label: 'Wiederherstellung bestätigen', emoji: '♻️', style: 'danger' }, { id: `bak:cancel:${token}`, label: 'Abbrechen', style: 'secondary' }] : [] };
}
exports.BACKUP_COMMANDS = [{
        name: 'backup', description: 'Sicherungen: Status, manuelle Sicherung, Wiederherstellung (für Administratoren)',
        subcommands: [
            { name: 'status', description: 'Sicherungsstatus und letzte erfolgreiche Sicherung' },
            { name: 'erstellen', description: 'Jetzt sichern (Bot-Einstellungen + Datenbank des Systems)' },
            { name: 'wiederherstellen', description: 'Wiederherstellung prüfen, planen und bestätigen' },
        ],
        async run(c) {
            const sub = String(c.opts._sub ?? 'status');
            const denied = await (0, access_1.guard)(c, `backup ${sub}`);
            if (denied)
                return denied;
            if (!c.runtime || !c.guildId)
                return (0, format_1.errorReply)('Sicherungen sind gerade nicht verfügbar.');
            try {
                if (sub === 'erstellen')
                    return await create(c);
                if (sub === 'wiederherstellen')
                    return await chooser(c);
                return await status(c);
            }
            catch (e) {
                console.error('backup command failed:', e instanceof Error ? e.message : e);
                return (0, format_1.errorReply)('Die Sicherungsfunktion ist unerwartet fehlgeschlagen. Es wurde nichts verändert.');
            }
        },
    }];
/** bak:plan (Auswahl) · bak:confirm:<token> (öffnet Bestätigungsformular) · bak:apply:<token> (Formular) · bak:cancel:<token> */
exports.BACKUP_INTERACTION = {
    prefix: 'bak',
    opensModal: (args) => args[0] === 'confirm',
    panel: (args) => args[0] !== 'confirm',
    async run(c) {
        const [action, token] = c.args;
        const denied = await (0, access_1.guard)(c, `bak:${action ?? ''}`);
        if (denied)
            return denied;
        if (!c.runtime || !c.guildId)
            return (0, format_1.errorReply)('Sicherungen sind gerade nicht verfügbar.');
        const rt = c.runtime;
        try {
            const cfg = await rt.guildConfig.get(c.guildId).catch(() => null);
            if (action === 'plan') {
                const name = c.values?.[0] ?? '';
                const snap = await rt.snapshot(c.guildId);
                const plan = await rt.backups.plan(c.guildId, name, snap ? { channelIds: snap.channels.map((x) => x.id), roleIds: snap.roles.map((x) => x.id) } : undefined);
                const ok = !plan.problems.length && plan.sandboxOk && plan.changes.length > 0;
                const t = ok ? (0, node_crypto_1.randomBytes)(6).toString('hex') : null;
                if (t)
                    PLANS.set(t, { plan, userId: c.discordId, guildId: c.guildId, expires: Date.now() + PLAN_TTL });
                return planReply(c, plan, t, cfg);
            }
            const held = takePlan(token ?? '', c);
            if (!held)
                return (0, format_1.errorReply)('Der Plan ist abgelaufen oder gehört nicht dir. Bitte `/backup wiederherstellen` erneut ausführen.');
            if (action === 'cancel') {
                PLANS.delete(token);
                return { ephemeral: true, panel: true, embeds: [(0, branding_1.brand)(cfg, { title: '↩️ Abgebrochen', description: 'Es wurde nichts verändert.' })] };
            }
            if (action === 'confirm')
                return { modal: { id: `bak:apply:${token}`, title: 'Wiederherstellung bestätigen', fields: [{ id: 'confirm', label: 'Zur Bestätigung WIEDERHERSTELLEN eingeben', required: true, maxLength: 20, placeholder: 'WIEDERHERSTELLEN' }] } };
            if (action === 'apply') {
                if ((c.fields?.confirm ?? '').trim() !== 'WIEDERHERSTELLEN')
                    return (0, format_1.errorReply)('Nicht bestätigt – bitte genau WIEDERHERSTELLEN eingeben. Es wurde nichts verändert.');
                PLANS.delete(token); // nur einmal verwendbar
                const { safety, config } = await rt.backups.apply(held.plan, { by: c.discordId });
                await rt.reregister(c.guildId).catch(() => undefined);
                const nick = await rt.setNickname(c.guildId, config.branding.displayName).catch(() => null);
                return { ephemeral: true, panel: true, embeds: [(0, branding_1.brand)(config, { title: '✅ Wiederherstellung abgeschlossen', description: [
                                `Eingespielt: \`${held.plan.name}\` (${held.plan.changes.length} Änderungen).`,
                                `Vorheriger Stand gesichert als \`${safety.name}\` (${safety.locations.join(' + ')}) – damit lässt sich der Schritt rückgängig machen.`,
                                ...(nick ? [`⚠️ Anzeigename: ${(0, format_1.plain)(nick)}`] : []),
                                'Prüfe jetzt mit `/system diagnose`, ob alle Kanäle und Rollen passen.',
                            ].join('\n') }, 'success')] };
            }
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        }
        catch (e) {
            return (0, format_1.errorReply)(`Wiederherstellung abgebrochen – es wurde nichts verändert: ${e instanceof Error ? e.message : 'unbekannter Fehler'}`);
        }
    },
};
//# sourceMappingURL=backup.js.map