"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUALI_INTERACTION = exports.QUALI_COMMANDS = exports.sweepSessions = exports.resetSessions = exports.MAX_ANSWER = exports.APPLICATION_MS = void 0;
exports.panelEmbed = panelEmbed;
exports.handleDirectMessage = handleDirectMessage;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Zeit für eine Bewerbung (wie bei Appy: 3 Stunden). */
exports.APPLICATION_MS = 3 * 60 * 60_000;
exports.MAX_ANSWER = 1000;
/** Laufende Bewerbungen im Speicher des Bots (ein Neustart des Bots bricht sie ab – dann einfach neu starten). */
const sessions = new Map();
const resetSessions = () => sessions.clear();
exports.resetSessions = resetSessions;
const sweepSessions = (now = Date.now()) => { for (const [k, s] of sessions)
    if (s.expiresAt <= now)
        sessions.delete(k); };
exports.sweepSessions = sweepSessions;
const CANCEL = { id: 'quali:cancel', label: 'Bewerbung abbrechen', style: 'danger' };
const getConfig = (api) => api.service('GET', '/bot/qualifications');
const questionEmbed = (s) => ({
    title: (0, format_1.clip)(s.unitName, 256), color: format_1.COLORS.info,
    description: (0, format_1.clip)(`**${s.answers.length + 1}/${s.questions.length}.** ${(0, format_1.plain)(s.questions[s.answers.length])}\n\n_Antworte einfach mit einer Nachricht hier im Chat._`, 4000),
});
function panelEmbed(cfg) {
    const parts = [cfg.intro, ...cfg.units.map((u) => `**__${(0, format_1.plain)(u.name)}:__**\n${u.description}`)].filter(Boolean);
    return { title: (0, format_1.clip)(cfg.title, 256), color: format_1.COLORS.info, description: (0, format_1.clip)(parts.join('\n\n'), 4000) };
}
exports.QUALI_COMMANDS = [
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
        await say('Du hast gerade keine laufende Bewerbung. Starte eine über das **Qualifikations-Panel** auf dem Server.', format_1.COLORS.neutral);
        return;
    }
    if (s.expiresAt <= now) {
        sessions.delete(a.userId);
        await say('⏰ Die Zeit für deine Bewerbung ist abgelaufen (3 Stunden). Bitte starte sie über das Panel neu.', format_1.COLORS.warning);
        return;
    }
    const text = a.content.trim();
    if (!text) {
        await say('Bitte antworte mit Text.', format_1.COLORS.warning, [CANCEL]);
        return;
    }
    if (text.length > exports.MAX_ANSWER) {
        await say(`Deine Antwort ist zu lang (${text.length} Zeichen, höchstens ${exports.MAX_ANSWER}). Bitte kürzer fassen.`, format_1.COLORS.warning, [CANCEL]);
        return;
    }
    s.answers.push(text);
    if (s.answers.length < s.questions.length) {
        await a.sendDm(a.userId, { embed: questionEmbed(s), buttons: [CANCEL] });
        return;
    }
    try {
        const r = await a.api.service('POST', '/bot/qualifications/applications', { unit: s.unit, discordId: a.userId, discordName: a.userName, answers: s.questions.map((question, i) => ({ question, answer: s.answers[i] })) });
        sessions.delete(a.userId);
        await say(`✅ Deine Bewerbung **${r.number}** ist eingegangen! Das Team prüft sie – die Entscheidung bekommst du hier per Direktnachricht.`, format_1.COLORS.success);
    }
    catch (e) {
        if (e instanceof api_1.BotApiError && (e.status === 409 || e.status === 400 || e.status === 404)) {
            sessions.delete(a.userId);
            await say(e.status === 409 ? 'Du hast für diese Einheit bereits eine offene Bewerbung. Bitte warte auf die Entscheidung.' : 'Die Fragen wurden inzwischen geändert. Bitte starte die Bewerbung über das Panel neu.', format_1.COLORS.warning);
            return;
        }
        s.answers.pop(); // letzte Antwort erneut senden = erneuter Versuch
        await say('⚠️ Deine Bewerbung konnte gerade nicht gespeichert werden (System nicht erreichbar). Schicke deine **letzte Antwort** gleich noch einmal, um es erneut zu versuchen.', format_1.COLORS.warning, [CANCEL]);
    }
}
exports.QUALI_INTERACTION = {
    prefix: 'quali',
    async run(c) {
        const [action, ...rest] = c.args;
        try {
            if (action === 'cancel') {
                const had = sessions.delete(c.discordId);
                return (0, format_1.okReply)(had ? 'Bewerbung abgebrochen. Du kannst jederzeit über das Panel neu starten.' : 'Es läuft keine Bewerbung.');
            }
            if (action === 'decide') {
                const [id, status] = rest;
                if (!id || (status !== 'ACCEPTED' && status !== 'REJECTED'))
                    return (0, format_1.errorReply)('Unbekannte Aktion.');
                const r = await c.api.asUser(c.discordId, 'POST', `/qualifications/applications/${id}/decision`, { status });
                return (0, format_1.okReply)(`Bewerbung **${r.number}** (${(0, format_1.plain)(r.unitName)}) ${status === 'ACCEPTED' ? '**angenommen**' : '**abgelehnt**'}. Die Person wird per Direktnachricht informiert${status === 'ACCEPTED' ? ' (und bekommt ggf. die Rolle)' : ''}.${r.addedToSek ? ' Außerdem ins SEK aufgenommen.' : ''}`);
            }
            if (action !== 'pick' && action !== 'start')
                return (0, format_1.errorReply)('Unbekannte Aktion.');
            const key = action === 'pick' ? c.values?.[0] : rest[0];
            const running = sessions.get(c.discordId);
            if (running && running.expiresAt > Date.now()) {
                if (action === 'start' && running.unit === key)
                    return (0, format_1.okReply)(`Deine Bewerbung läuft bereits – Frage ${running.answers.length + 1}/${running.questions.length}: ${(0, format_1.plain)(running.questions[running.answers.length])}`);
                return (0, format_1.errorReply)(`Du hast bereits eine laufende Bewerbung (**${(0, format_1.plain)(running.unitName)}**) in deinen Direktnachrichten. Beende oder brich sie dort zuerst ab.`);
            }
            const unit = (await getConfig(c.api)).units.find((u) => u.key === key);
            if (!unit)
                return (0, format_1.errorReply)('Diese Auswahl gibt es nicht mehr. Bitte das Panel neu laden.');
            const open = await c.api.service('GET', `/bot/qualifications/open?discordId=${c.discordId}&unit=${encodeURIComponent(unit.key)}`);
            if (open.open)
                return (0, format_1.errorReply)(`Du hast für **${(0, format_1.plain)(unit.name)}** bereits eine offene Bewerbung (${open.number}). Bitte warte auf die Entscheidung.`);
            if (!c.platform)
                return (0, format_1.errorReply)('Direktnachrichten sind hier nicht verfügbar.');
            if (action === 'pick') {
                let dm;
                try {
                    dm = await c.platform.sendDm(c.discordId, {
                        embed: { title: (0, format_1.clip)(unit.name, 256), color: format_1.COLORS.info, description: `Bist du sicher, dass du dich bewerben möchtest?\n\nSobald du startest, schicke ich dir nacheinander **${unit.questions.length} Fragen**. Du hast **3 Stunden** Zeit, die Bewerbung abzuschließen – sonst musst du neu starten. Abbrechen kannst du jederzeit über den Button.` },
                        buttons: [{ id: `quali:start:${unit.key}`, label: 'Bewerbung starten', style: 'success' }, { id: 'quali:cancel', label: 'Abbrechen', style: 'danger' }],
                    });
                }
                catch {
                    return (0, format_1.errorReply)('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten von Servermitgliedern (Server-Menü → Privatsphäre-Einstellungen) und wähle erneut.');
                }
                return { ephemeral: true, embeds: [{ title: 'Bewerbung gestartet', description: 'Die Bewerbung wurde in deinen **Direktnachrichten** gestartet!', color: format_1.COLORS.success }], buttons: [{ id: 'quali:link', label: 'Zur Bewerbung', style: 'secondary', url: `https://discord.com/channels/@me/${dm.channelId}/${dm.messageId}` }] };
            }
            const s = { unit: unit.key, unitName: unit.name, questions: unit.questions, answers: [], expiresAt: Date.now() + exports.APPLICATION_MS };
            sessions.set(c.discordId, s);
            try {
                await c.platform.sendDm(c.discordId, { embed: questionEmbed(s), buttons: [CANCEL] });
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