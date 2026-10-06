"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUALI_INTERACTION = exports.QUALI_COMMANDS = exports.sweepSessions = exports.resetSessions = exports.MAX_ANSWER = exports.APPLICATION_MS = exports.POLICE = void 0;
exports.panelEmbed = panelEmbed;
exports.handleDirectMessage = handleDirectMessage;
const shared_1 = require("@enrp/shared");
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Pseudo-Einheit für die normale Bewerbung bei EN Polizei (kann nicht mit konfigurierten Einheiten kollidieren). */
exports.POLICE = '@polizei';
const POLICE_NAME = 'Bewerbung – EN Polizei';
const SKIP = '-';
/** Zeit für eine Bewerbung (wie bei Appy: 3 Stunden). */
exports.APPLICATION_MS = 3 * 60 * 60_000;
exports.MAX_ANSWER = 1000;
/** Laufende Bewerbungen im Speicher des Bots (ein Neustart des Bots bricht sie ab – dann einfach neu starten). */
const sessions = new Map();
/** Server-Beitritt aus der Auswahl im Server (die eigentliche Bewerbung läuft per DM, dort ist er unbekannt). */
const joinedAtOf = new Map();
const resetSessions = () => { sessions.clear(); joinedAtOf.clear(); };
exports.resetSessions = resetSessions;
const sweepSessions = (now = Date.now()) => { for (const [k, s] of sessions)
    if (s.expiresAt <= now)
        sessions.delete(k); };
exports.sweepSessions = sweepSessions;
const CANCEL = { id: 'quali:cancel', label: 'Bewerbung abbrechen', style: 'danger' };
const getConfig = (api) => api.service('GET', '/bot/qualifications');
const field = (f) => { const n = (0, shared_1.normalizeField)(f); return { ...n, maxLength: Math.min(n.maxLength, 2000) }; };
const asField = (q, i) => (typeof q === 'string' ? { key: `q${i + 1}`, label: q, required: true, maxLength: exports.MAX_ANSWER } : q);
/** Aktuelle Frage: Text → Antwort per Nachricht; Auswahl/Rollen → Menü (+ „Überspringen“, falls optional). */
const questionMessage = (s) => {
    const i = s.answers.length;
    const q = s.questions[i];
    const f = q.field;
    const head = `**${i + 1}/${s.questions.length}.** ${(0, format_1.plain)(q.text)}`;
    if (f.type === 'TEXT') {
        const hints = [f.minLength ? `mindestens ${f.minLength} Zeichen` : '', !f.required ? `optional – schreibe „${SKIP}“, um zu überspringen` : ''].filter(Boolean).join(' · ');
        return { embed: { title: (0, format_1.clip)(s.unitName, 256), color: format_1.COLORS.info, description: (0, format_1.clip)(`${head}\n\n_Antworte einfach mit einer Nachricht hier im Chat.${hints ? ` (${hints})` : ''}_`, 4000) }, buttons: [CANCEL] };
    }
    return {
        embed: { title: (0, format_1.clip)(s.unitName, 256), color: format_1.COLORS.info, description: (0, format_1.clip)(`${head}\n\n_Wähle unten ${f.multiple ? 'eine oder mehrere Optionen' : 'eine Option'} aus.${f.required ? '' : ' Optional.'}_`, 4000) },
        select: { id: `quali:ans:${i}`, placeholder: f.multiple ? 'Optionen wählen …' : 'Option wählen …', min: 1, max: f.multiple ? f.options.length : 1, options: f.options.map((o, j) => ({ label: (0, format_1.clip)(o.label, 100), value: String(j) })) },
        buttons: [...(f.required ? [] : [{ id: `quali:skip:${i}`, label: 'Überspringen', style: 'secondary' }]), CANCEL],
    };
};
const answerText = (a) => (a === null ? '— (übersprungen)' : Array.isArray(a) ? a.join(', ') : a);
/** Lädt Fragen einer Einheit bzw. der Polizei-Bewerbung (Formular aus dem System). */
async function loadFlow(api, key) {
    if (!key)
        return null;
    if (key === exports.POLICE) {
        const form = await api.service('GET', '/applications/form');
        return { key, name: POLICE_NAME, questions: [{ text: 'Wie ist dein Roblox-Benutzername?', key: 'roblox', field: field({ key: 'roblox', label: 'Roblox', required: true, maxLength: 20 }) }, ...form.map((f) => ({ text: f.label, key: f.key, field: field(f) }))] };
    }
    const unit = (await getConfig(api)).units.find((u) => u.key === key);
    return unit ? { key: unit.key, name: unit.name, questions: unit.questions.map(asField).map((f) => ({ text: f.label, key: f.key, field: field(f) })) } : null;
}
async function openApplication(api, key, discordId) {
    return key === exports.POLICE
        ? api.service('GET', `/bot/application/open?discordId=${discordId}`)
        : api.service('GET', `/bot/qualifications/open?discordId=${discordId}&unit=${encodeURIComponent(key)}`);
}
async function submitSession(api, s, userId, userName, robloxLookup, now = Date.now()) {
    const meta = { durationSec: Math.max(0, Math.round((now - s.startedAt) / 1000)), ...(s.joinedAt ? { joinedAt: s.joinedAt } : {}) };
    if (s.unit === exports.POLICE) {
        const roblox = String(s.answers[0] ?? '').trim();
        const rb = await robloxLookup?.(roblox).catch(() => null);
        const answers = Object.fromEntries(s.questions.slice(1).flatMap((q, i) => { const a = s.answers[i + 1]; return a === null || a === undefined ? [] : [[q.key, a]]; }));
        return (await api.service('POST', '/bot/application', { robloxUsername: rb?.name ?? roblox, ...(rb ? { robloxUserId: String(rb.id) } : {}), discordId: userId, discordName: userName, answers, ...meta })).number;
    }
    return (await api.service('POST', '/bot/qualifications/applications', { unit: s.unit, discordId: userId, discordName: userName, answers: s.questions.map((q, i) => ({ question: q.text, answer: s.answers[i] ?? null })), ...meta })).number;
}
/** Fallback, falls das System die Panel-Texte nicht liefert (Texte: Web → Qualifications → Setup). */
const POLICE_PANEL = { title: '📋 Bewerbung bei EN Polizei', color: format_1.COLORS.info, description: 'Du möchtest Teil der **EN Polizei** werden? Klicke auf **Jetzt bewerben** – der Bot stellt dir die Fragen nacheinander per **Direktnachricht**.\n\nDu brauchst deinen **Roblox-Namen** und etwa 10 Minuten Zeit. Die Entscheidung bekommst du ebenfalls per Direktnachricht.' };
/** Schritt 1 (Panel-Auswahl, Button oder /bewerbung): Bestätigung per DM mit Start/Abbrechen, im Channel „Zur Bewerbung“. */
async function offer(c, key) {
    const running = sessions.get(c.discordId);
    if (running && running.expiresAt > Date.now())
        return (0, format_1.errorReply)(`Du hast bereits eine laufende Bewerbung (**${(0, format_1.plain)(running.unitName)}**) in deinen Direktnachrichten. Beende oder brich sie dort zuerst ab.`);
    const flow = await loadFlow(c.api, key);
    if (!flow)
        return (0, format_1.errorReply)('Diese Auswahl gibt es nicht mehr. Bitte das Panel neu laden.');
    const open = await openApplication(c.api, flow.key, c.discordId);
    if (open.open)
        return (0, format_1.errorReply)(`Du hast für **${(0, format_1.plain)(flow.name)}** bereits eine offene Bewerbung (${open.number}). Bitte warte auf die Entscheidung.`);
    if (!c.platform)
        return (0, format_1.errorReply)('Direktnachrichten sind hier nicht verfügbar.');
    if (c.memberJoinedAt)
        joinedAtOf.set(c.discordId, c.memberJoinedAt);
    let dm;
    try {
        dm = await c.platform.sendDm(c.discordId, {
            embed: { title: (0, format_1.clip)(flow.name, 256), color: format_1.COLORS.info, description: `Bist du sicher, dass du dich bewerben möchtest?\n\nSobald du startest, schicke ich dir nacheinander **${flow.questions.length} Fragen**. Du hast **3 Stunden** Zeit, die Bewerbung abzuschließen – sonst musst du neu starten. Abbrechen kannst du jederzeit über den Button.` },
            buttons: [{ id: `quali:start:${flow.key}`, label: 'Bewerbung starten', style: 'success' }, { id: 'quali:cancel', label: 'Abbrechen', style: 'danger' }],
        });
    }
    catch {
        return (0, format_1.errorReply)('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten von Servermitgliedern (Server-Menü → Privatsphäre-Einstellungen) und versuche es erneut.');
    }
    return { ephemeral: true, embeds: [{ title: 'Bewerbung gestartet', description: 'Die Bewerbung wurde in deinen **Direktnachrichten** gestartet!', color: format_1.COLORS.success }], buttons: [{ id: 'quali:link', label: 'Zur Bewerbung', style: 'secondary', url: `https://discord.com/channels/@me/${dm.channelId}/${dm.messageId}` }] };
}
function panelEmbed(cfg) {
    const parts = [cfg.intro, ...cfg.units.map((u) => `**__${(0, format_1.plain)(u.name)}:__**\n${u.description}`)].filter(Boolean);
    return { title: (0, format_1.clip)(cfg.title, 256), color: format_1.COLORS.info, description: (0, format_1.clip)(parts.join('\n\n'), 4000) };
}
exports.QUALI_COMMANDS = [
    {
        name: 'bewerbung', description: 'Bewirb dich bei EN Polizei (Fragen per Direktnachricht)',
        async run(c) { try {
            return await offer(c, exports.POLICE);
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        } },
    },
    {
        name: 'bewerbungspanel', description: 'Postet das Bewerbungs-Panel („Jetzt bewerben“) in diesen Channel',
        async run(c) {
            if (!c.guildId)
                return (0, format_1.errorReply)('Das geht nur auf einem Server, nicht per Direktnachricht.');
            if (!c.isGuildAdmin)
                return (0, format_1.errorReply)('Dafür brauchst du auf diesem Discord-Server das Recht „Server verwalten“.');
            if (!c.channelId || !c.platform)
                return (0, format_1.errorReply)('Panel kann hier nicht gepostet werden.');
            try {
                const police = (await getConfig(c.api).catch(() => undefined))?.police;
                const embed = police ? { title: (0, format_1.clip)(police.title, 256), color: format_1.COLORS.info, description: (0, format_1.clip)(police.description, 4000) } : POLICE_PANEL;
                await c.platform.postPanel({ channelId: c.channelId, embed, buttons: [{ id: `quali:pick:${exports.POLICE}`, label: 'Jetzt bewerben', emoji: '📋', style: 'primary' }] });
            }
            catch {
                return (0, format_1.errorReply)('Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Channel?).');
            }
            return (0, format_1.okReply)('Bewerbungs-Panel gepostet. Neue Bewerbungen erscheinen im System unter *Applications* (und im Applications-Channel, falls eingestellt).');
        },
    },
    {
        name: 'qualipanel', description: 'Postet das Qualifikations-Panel (SEK, Flugstaffel, Ausbilder …) in diesen Channel',
        async run(c) {
            if (!c.guildId)
                return (0, format_1.errorReply)('Das geht nur auf einem Server, nicht per Direktnachricht.');
            if (!c.isGuildAdmin)
                return (0, format_1.errorReply)('Dafür brauchst du auf diesem Discord-Server das Recht „Server verwalten“.');
            if (!c.channelId || !c.platform)
                return (0, format_1.errorReply)('Panel kann hier nicht gepostet werden.');
            try {
                const cfg = await getConfig(c.api);
                await c.platform.postPanel({ channelId: c.channelId, embed: panelEmbed(cfg), select: { id: 'quali:pick', placeholder: 'Triff eine Auswahl', options: cfg.units.map((u) => ({ label: (0, format_1.clip)(u.name, 100), value: u.key, ...(u.description ? { description: (0, format_1.clip)((0, format_1.plain)(u.description).replace(/\*|_/g, ''), 100) } : {}) })) } });
                const ch = await c.config?.().catch(() => undefined);
                return (0, format_1.okReply)(`Qualifikations-Panel gepostet.${ch?.qualifications ? '' : ' Tipp: In den Einstellungen einen **Qualifications channel** hinterlegen – dort landen die Bewerbungen mit Annehmen/Ablehnen-Buttons.'}`);
            }
            catch (e) {
                if (e instanceof api_1.BotApiError)
                    return (0, errors_1.mapError)(e);
                return (0, format_1.errorReply)('Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Channel?).');
            }
        },
    },
];
/** Antwort auf eine Direktnachricht während einer laufenden Bewerbung. */
async function handleDirectMessage(a) {
    const now = a.now ?? Date.now();
    const s = sessions.get(a.userId);
    const say = (description, color = format_1.COLORS.info, buttons) => a.sendDm(a.userId, { embed: { title: s ? (0, format_1.clip)(s.unitName, 256) : 'Bewerbung', description, color }, buttons });
    if (!s) {
        await say('Du hast gerade keine laufende Bewerbung. Starte eine über das Bewerbungs- oder Qualifikations-Panel auf dem Server (oder mit `/bewerbung`).', format_1.COLORS.neutral);
        return;
    }
    if (s.expiresAt <= now) {
        sessions.delete(a.userId);
        await say('⏰ Die Zeit für deine Bewerbung ist abgelaufen (3 Stunden). Bitte starte sie über das Panel neu.', format_1.COLORS.warning);
        return;
    }
    const q = s.questions[s.answers.length];
    if (q.field.type !== 'TEXT') {
        await say('Bitte wähle die Antwort im **Menü** der letzten Frage aus.', format_1.COLORS.warning);
        await a.sendDm(a.userId, questionMessage(s));
        return;
    }
    const text = a.content.trim();
    if (!text) {
        await say('Bitte antworte mit Text.', format_1.COLORS.warning, [CANCEL]);
        return;
    }
    if (!q.field.required && text === SKIP)
        s.answers.push(null);
    else {
        const r = (0, shared_1.checkAnswer)(q.field, text);
        if (!r.ok) {
            await say(r.error, format_1.COLORS.warning, [CANCEL]);
            return;
        }
        s.answers.push(text);
    }
    await proceed({ api: a.api, userId: a.userId, userName: a.userName, sendDm: a.sendDm, robloxLookup: a.robloxLookup, now }, s);
}
/** Nächste Frage senden – oder nach der letzten Antwort einreichen. */
async function proceed(o, s) {
    const say = (description, color = format_1.COLORS.info, buttons) => o.sendDm(o.userId, { embed: { title: (0, format_1.clip)(s.unitName, 256), description, color }, buttons });
    if (s.answers.length < s.questions.length) {
        await o.sendDm(o.userId, questionMessage(s));
        return;
    }
    try {
        const number = await submitSession(o.api, s, o.userId, o.userName, o.robloxLookup, o.now);
        sessions.delete(o.userId);
        await say(`✅ Deine Bewerbung **${number}** ist eingegangen! Das Team prüft sie – die Entscheidung bekommst du hier per Direktnachricht.`, format_1.COLORS.success);
    }
    catch (e) {
        if (e instanceof api_1.BotApiError && (e.status === 409 || e.status === 400 || e.status === 404)) {
            sessions.delete(o.userId);
            await say(e.status === 409 ? 'Du hast hierfür bereits eine offene Bewerbung. Bitte warte auf die Entscheidung.' : 'Die Fragen wurden inzwischen geändert. Bitte starte die Bewerbung neu.', format_1.COLORS.warning);
            return;
        }
        const last = s.questions[s.answers.length - 1];
        s.answers.pop(); // letzte Antwort erneut = erneuter Versuch
        if (last.field.type === 'TEXT')
            await say('⚠️ Deine Bewerbung konnte gerade nicht gespeichert werden (System nicht erreichbar). Schicke deine **letzte Antwort** gleich noch einmal, um es erneut zu versuchen.', format_1.COLORS.warning, [CANCEL]);
        else {
            await say('⚠️ Deine Bewerbung konnte gerade nicht gespeichert werden (System nicht erreichbar). Wähle deine letzte Antwort gleich noch einmal aus.', format_1.COLORS.warning);
            await o.sendDm(o.userId, questionMessage(s));
        }
    }
}
const STATUS = new Set(['ACCEPTED', 'REJECTED']);
/** `quali:decide:<q|p>:<id>:<STATUS>` (alt: `quali:decide:<id>:<STATUS>` = Qualifikation). */
const parseDecision = (rest) => {
    const [kind, id, status] = rest.length === 2 ? ['q', rest[0], rest[1]] : rest;
    return (kind === 'q' || kind === 'p') && id && status && STATUS.has(status) ? { kind, id, status: status } : null;
};
/** Entscheidung als klickender Benutzer (Rechte im System); aktualisiert danach die Bewerbungs-Nachricht im Channel. */
async function decide(c, d, reason) {
    const path = d.kind === 'p' ? `/applications/${d.id}/discord-decision` : `/qualifications/applications/${d.id}/decision`;
    const r = await c.api.asUser(c.discordId, 'POST', path, { status: d.status, ...(reason ? { reason } : {}) });
    const accepted = d.status === 'ACCEPTED';
    const what = `Bewerbung **${r.number}**${r.unitName ? ` (${(0, format_1.plain)(r.unitName)})` : ''}`;
    return {
        ...(0, format_1.okReply)(`${what} ${accepted ? '**angenommen**' : '**abgelehnt**'}. Die Person wird per Direktnachricht informiert${accepted && d.kind === 'q' ? ' (und bekommt ggf. die Rolle)' : ''}.${r.addedToSek ? ' Außerdem ins SEK aufgenommen.' : ''}`),
        decided: { color: accepted ? format_1.COLORS.success : format_1.COLORS.danger, text: (0, format_1.clip)(`${accepted ? '✅ Angenommen' : '❌ Abgelehnt'} von <@${c.discordId}>${r.decidedByName ? ` (${(0, format_1.plain)(r.decidedByName)})` : ''}${reason ? `\n**Grund:** ${(0, format_1.plain)(reason)}` : ''}`, 1024) },
    };
}
const STATUS_DE = { OPEN: '🟡 offen', SUBMITTED: '🟡 eingereicht', SCREENING: '🟡 in Prüfung', INTERVIEW: '🟡 Gespräch', PENDING_DECISION: '🟡 Entscheidung offen', ACCEPTED: '✅ angenommen', REJECTED: '❌ abgelehnt', WITHDRAWN: '↩️ zurückgezogen' };
exports.QUALI_INTERACTION = {
    prefix: 'quali',
    opensModal: (args) => args[0] === 'reason',
    async run(c) {
        const [action, ...rest] = c.args;
        try {
            if (action === 'reason') {
                const d = parseDecision(rest);
                if (!d)
                    return (0, format_1.errorReply)('Unbekannte Aktion.');
                return { modal: { id: `quali:reasonsubmit:${d.kind}:${d.id}:${d.status}`, title: d.status === 'ACCEPTED' ? 'Annehmen mit Grund' : 'Ablehnen mit Grund', fields: [{ id: 'reason', label: 'Grund (geht per DM an die Person)', paragraph: true, required: true, maxLength: 1000 }] } };
            }
            if (action === 'reasonsubmit') {
                const d = parseDecision(rest);
                const reason = (c.fields?.reason ?? '').trim();
                if (!d || !reason)
                    return (0, format_1.errorReply)('Bitte einen Grund angeben.');
                return await decide(c, d, reason);
            }
            if (action === 'history') {
                const id = rest[0] ?? '';
                if (!/^\d{15,25}$/.test(id))
                    return (0, format_1.errorReply)('Unbekannte Person.');
                const get = (path) => c.api.asUser(c.discordId, 'GET', path).then((x) => x, (e) => (e instanceof api_1.BotApiError && e.status === 403 ? null : Promise.reject(e)));
                const [quali, police] = await Promise.all([get(`/qualifications/history?discordId=${id}`), get(`/applications/history?discordId=${id}`)]);
                if (!quali && !police)
                    return (0, format_1.errorReply)('Du hast keine Berechtigung, Bewerbungen anzusehen.');
                const rows = [...(police ?? []).map((r) => ({ ...r, unitName: 'EN Polizei' })), ...(quali ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
                const lines = rows.slice(0, 20).map((r) => `• **${r.number}** · ${(0, format_1.plain)(r.unitName)} · ${STATUS_DE[r.status] ?? r.status} · <t:${Math.floor(Date.parse(r.createdAt) / 1000)}:d>${r.decisionReason ? `\n  ↳ ${(0, format_1.clip)((0, format_1.plain)(r.decisionReason), 150)}` : ''}`);
                return { ephemeral: true, embeds: [{ title: '🗂️ Bewerbungs-Verlauf', color: format_1.COLORS.info, description: (0, format_1.clip)(`<@${id}>\n\n${lines.join('\n') || 'Keine Bewerbungen.'}`, 4000) }] };
            }
            if (action === 'ticket') {
                const [kind, id] = rest;
                if ((kind !== 'q' && kind !== 'p') || !id)
                    return (0, format_1.errorReply)('Unbekannte Aktion.');
                if (!c.guildId || !c.platform)
                    return (0, format_1.errorReply)('Das geht nur auf einem Server.');
                const a = await c.api.asUser(c.discordId, 'GET', kind === 'p' ? `/applications/${id}` : `/qualifications/applications/${id}`);
                if (!a.discordId)
                    return (0, format_1.errorReply)('Diese Bewerbung kam nicht über Discord – es gibt keinen Discord-Benutzer für ein Ticket.');
                const cfg = await c.config?.().catch(() => undefined);
                let t;
                try {
                    t = await c.platform.createTicketChannel({ guildId: c.guildId, userId: a.discordId, userName: a.discordName ?? a.robloxUsername ?? a.discordId, categoryId: cfg?.tickets, staffRoleId: cfg?.staffRole, extraUserIds: [c.discordId] });
                }
                catch {
                    return (0, format_1.errorReply)('Ticket konnte nicht angelegt werden (fehlen dem Bot die Rechte „Kanäle verwalten“, oder ist die Person nicht mehr auf dem Server?).');
                }
                if (t.existing)
                    return (0, format_1.okReply)(`Mit dieser Person gibt es schon ein offenes Ticket: <#${t.channelId}>`);
                await c.platform.postPanel({ channelId: t.channelId, embed: { title: `🎫 Ticket zur Bewerbung ${a.number}`, color: format_1.COLORS.info, description: `<@${a.discordId}>, das Team hat eine Rückfrage zu deiner Bewerbung **${a.number}**${a.unitName ? ` (${(0, format_1.plain)(a.unitName)})` : ''}. Bitte antworte hier.` }, buttons: [{ id: 'support:close', label: 'Ticket schließen', emoji: '🔒', style: 'danger' }] }).catch(() => undefined);
                return (0, format_1.okReply)(`Ticket geöffnet: <#${t.channelId}>`);
            }
            if (action === 'ans' || action === 'skip') {
                const s = sessions.get(c.discordId);
                if (!s || s.expiresAt <= Date.now())
                    return (0, format_1.errorReply)('Du hast gerade keine laufende Bewerbung. Starte sie über das Panel neu.');
                const i = Number(rest[0]);
                if (i !== s.answers.length)
                    return (0, format_1.errorReply)('Diese Frage hast du schon beantwortet.');
                const q = s.questions[i];
                let value = null;
                if (action === 'skip') {
                    if (q.field.required)
                        return (0, format_1.errorReply)('Diese Frage ist eine Pflichtfrage.');
                }
                else {
                    const labels = (c.values ?? []).map((v) => q.field.options[Number(v)]?.label).filter((x) => !!x);
                    const r = (0, shared_1.checkAnswer)(q.field, labels);
                    if (!r.ok)
                        return (0, format_1.errorReply)(r.error);
                    value = labels;
                }
                if (!c.platform)
                    return (0, format_1.errorReply)('Direktnachrichten sind hier nicht verfügbar.');
                s.answers.push(value);
                const platform = c.platform;
                await proceed({ api: c.api, userId: c.discordId, userName: c.userName ?? c.discordId, sendDm: (u, m) => platform.sendDm(u, m), robloxLookup: c.robloxLookup, now: Date.now() }, s);
                return { ...(0, format_1.okReply)('Gespeichert.'), update: { embeds: [{ title: (0, format_1.clip)(s.unitName, 256), color: format_1.COLORS.success, description: (0, format_1.clip)(`**${i + 1}/${s.questions.length}.** ${(0, format_1.plain)(q.text)}\n\n✅ ${(0, format_1.plain)(answerText(value))}`, 4000) }] } };
            }
            if (action === 'cancel') {
                const had = sessions.delete(c.discordId);
                return (0, format_1.okReply)(had ? 'Bewerbung abgebrochen. Du kannst jederzeit über das Panel neu starten.' : 'Es läuft keine Bewerbung.');
            }
            if (action === 'decide') {
                const d = parseDecision(rest);
                return d ? await decide(c, d) : (0, format_1.errorReply)('Unbekannte Aktion.');
            }
            if (action === 'pick')
                return await offer(c, c.values?.[0] ?? rest[0]);
            if (action !== 'start')
                return (0, format_1.errorReply)('Unbekannte Aktion.');
            const running = sessions.get(c.discordId);
            if (running && running.expiresAt > Date.now()) {
                if (running.unit === rest[0])
                    return (0, format_1.okReply)(`Deine Bewerbung läuft bereits – Frage ${running.answers.length + 1}/${running.questions.length}: ${(0, format_1.plain)(running.questions[running.answers.length].text)}`);
                return (0, format_1.errorReply)(`Du hast bereits eine laufende Bewerbung (**${(0, format_1.plain)(running.unitName)}**). Beende oder brich sie zuerst ab.`);
            }
            const flow = await loadFlow(c.api, rest[0]);
            if (!flow)
                return (0, format_1.errorReply)('Diese Auswahl gibt es nicht mehr. Bitte das Panel neu laden.');
            const open = await openApplication(c.api, flow.key, c.discordId);
            if (open.open)
                return (0, format_1.errorReply)(`Du hast für **${(0, format_1.plain)(flow.name)}** bereits eine offene Bewerbung (${open.number}). Bitte warte auf die Entscheidung.`);
            if (!c.platform)
                return (0, format_1.errorReply)('Direktnachrichten sind hier nicht verfügbar.');
            const s = { unit: flow.key, unitName: flow.name, questions: flow.questions, answers: [], startedAt: Date.now(), expiresAt: Date.now() + exports.APPLICATION_MS, joinedAt: joinedAtOf.get(c.discordId) };
            sessions.set(c.discordId, s);
            try {
                await c.platform.sendDm(c.discordId, questionMessage(s));
            }
            catch {
                sessions.delete(c.discordId);
                return (0, format_1.errorReply)('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten und versuche es erneut.');
            }
            return (0, format_1.okReply)('Los geht’s – beantworte die Fragen einfach hier im Chat.');
        }
        catch (e) {
            if (e instanceof api_1.BotApiError && e.status === 409)
                return (0, format_1.errorReply)('Über diese Bewerbung wurde bereits entschieden.');
            return (0, errors_1.mapError)(e);
        }
    },
};
//# sourceMappingURL=qualifications.js.map