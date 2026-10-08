"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DUTY_REPORT_INTERACTION = exports.DUTY_REPORT_COMMANDS = void 0;
const shared_1 = require("@enrp/shared");
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Teilantworten mehrseitiger Formulare (Discord: max. 5 Felder je Formular) – 30 Minuten im Speicher. */
const drafts = new Map();
const key = (c, mode, id) => `${c.discordId}:${mode}:${id}`;
const sweep = () => { for (const [k, v] of drafts)
    if (Date.now() - v.at > 30 * 60_000)
        drafts.delete(k); };
const PAGE = 5;
const pages = (t) => Math.max(1, Math.ceil(t.fields.length / PAGE));
const hint = (f) => (f.type === 'select' && f.options.length ? `z. B. ${f.options.join(' / ')}` : f.type === 'number' ? 'Zahl' : f.placeholder).slice(0, 100);
function modal(t, mode, id, page, values) {
    const n = pages(t);
    return {
        id: `drep:sub:${mode}:${id}:${page}`, title: `${t.name}${n > 1 ? ` (${page + 1}/${n})` : ''}`.slice(0, 45),
        fields: t.fields.slice(page * PAGE, page * PAGE + PAGE).map((f) => ({ id: f.id, label: f.label, paragraph: f.type === 'long', required: f.required, maxLength: Math.min(f.maxLength, 4000), ...(hint(f) ? { placeholder: hint(f) } : {}), ...(values[f.id] ? { value: values[f.id].slice(0, 4000) } : {}) })),
    };
}
async function templates(c) { return c.api.asUser(c.discordId, 'GET', '/duty-reports/templates?active=1'); }
async function load(c, mode, id) {
    if (mode === 'n') {
        const t = (await templates(c)).find((x) => x.id === id);
        if (!t)
            throw new Error('Vorlage nicht gefunden oder deaktiviert.');
        return { t, values: {} };
    }
    const r = await c.api.asUser(c.discordId, 'GET', `/duty-reports/${id}`);
    if (!r.template)
        throw new Error('Die Vorlage dieses Berichts gibt es nicht mehr – bitte im Dashboard bearbeiten.');
    if (!r.canEdit)
        throw new Error('Diesen Bericht darfst du nicht bearbeiten.');
    return { t: r.template, values: r.values, report: r };
}
function openModal(c, t, mode, id, page, base) {
    const k = key(c, mode, id);
    if (page === 0)
        drafts.set(k, { values: { ...base }, at: Date.now() });
    return { modal: modal(t, mode, id, page, drafts.get(k)?.values ?? base) };
}
/** Neuer Bericht: Dienstzeit usw. vorbelegen (aus den Dienst-Sitzungen); ohne API einfach leer. */
async function prefill(c, t) {
    return c.api.asUser(c.discordId, 'GET', `/duty-reports/templates/${t.id}/prefill`).then((r) => r.values ?? {}, () => ({}));
}
exports.DUTY_REPORT_COMMANDS = [{
        name: 'dienstbericht', description: 'Tages-/Wochenbericht ausfüllen, ansehen oder bearbeiten',
        subcommands: [
            { name: 'ausfuellen', description: 'Neuen Bericht nach einer Vorlage ausfüllen' },
            { name: 'meine', description: 'Deine letzten Berichte' },
            { name: 'anzeigen', description: 'Einen Bericht ansehen (und bearbeiten)', options: [{ name: 'nummer', description: 'Berichtsnummer, z. B. TB-2026-K7M2QX', type: 'string', required: true, maxLength: 40 }] },
        ],
        opensModal: true,
        async run(c) {
            sweep();
            try {
                const sub = String(c.opts._sub ?? 'ausfuellen');
                if (sub === 'meine') {
                    const r = await c.api.asUser(c.discordId, 'GET', '/duty-reports?mine=true&pageSize=10');
                    return { ephemeral: true, embeds: [(0, format_1.listEmbed)('🗓️ Deine Berichte', r.items.map((x) => `**${x.number}** · ${(0, format_1.plain)(x.templateName)} – ${(0, shared_1.periodLabel)(x.period, x.periodStart)}${x.status === 'REVIEWED' ? ' ✅' : ''}`), 'Noch keine Berichte.')] };
                }
                if (sub === 'anzeigen') {
                    const r = await c.api.asUser(c.discordId, 'GET', `/duty-reports/${encodeURIComponent(String(c.opts.nummer ?? '').trim())}`);
                    const t = r.template;
                    return {
                        ephemeral: true,
                        embeds: [{ title: `${t?.emoji ?? '📝'} ${r.templateName} – ${(0, shared_1.periodLabel)(r.period, r.periodStart)}`, color: format_1.COLORS.info, description: `**${r.number}**${r.status === 'REVIEWED' ? ' · ✅ geprüft' : ''}`, fields: (t?.fields ?? Object.keys(r.values).map((id) => ({ id, label: id }))).filter((f) => r.values[f.id]).map((f) => ({ name: f.label, value: r.values[f.id].slice(0, 1024) })) }],
                        ...(r.canEdit ? { buttons: [{ id: `drep:edit:${r.id}`, label: 'Bearbeiten', emoji: '✏️', style: 'secondary' }] } : {}),
                    };
                }
                const list = await templates(c);
                if (!list.length)
                    return (0, format_1.errorReply)('Es gibt noch keine aktive Berichtsvorlage. Vorlagen legt man im Dashboard unter „Tages-/Wochenberichte“ an.');
                if (list.length === 1)
                    return openModal(c, list[0], 'n', list[0].id, 0, await prefill(c, list[0]));
                return { ephemeral: true, content: 'Welchen Bericht möchtest du ausfüllen?', select: { id: 'drep:pick', placeholder: 'Vorlage wählen …', options: list.slice(0, 25).map((t) => ({ label: t.name.slice(0, 100), value: t.id, ...(t.emoji ? { emoji: t.emoji } : {}), ...(t.description ? { description: t.description.slice(0, 100) } : {}) })) } };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    }];
/** Buttons/Menüs/Formulare: drep:pick · drep:edit:<id> · drep:next:<n|e>:<id>:<seite> · drep:sub:<n|e>:<id>:<seite> · drep:rev:<id> · drep:ret:<id> → drep:retsub:<id> */
exports.DUTY_REPORT_INTERACTION = {
    prefix: 'drep',
    opensModal: (args) => ['pick', 'edit', 'next', 'ret'].includes(args[0] ?? ''),
    async run(c) {
        const [action, a1, a2, a3] = c.args;
        try {
            if (action === 'pick') {
                const id = c.values?.[0] ?? '';
                const { t } = await load(c, 'n', id);
                return openModal(c, t, 'n', id, 0, await prefill(c, t));
            }
            // Leitung: prüfen bzw. zur Nachbesserung zurückgeben (Recht dutyreports.review prüft das System)
            if (action === 'rev' || action === 'retsub') {
                if (!/^[0-9a-f-]{36}$/.test(a1 ?? ''))
                    return (0, format_1.errorReply)('Ungültige Anfrage.');
                const note = String(c.fields?.note ?? '').trim();
                const r = await c.api.asUser(c.discordId, 'POST', `/duty-reports/${a1}/review`, action === 'rev' ? { decision: 'REVIEWED' } : { decision: 'RETURNED', note });
                return (0, format_1.okReply)(action === 'rev' ? `Bericht **${r.number}** als geprüft markiert.` : `Bericht **${r.number}** zur Nachbesserung zurückgegeben – der Verfasser wurde benachrichtigt.`);
            }
            if (action === 'ret') {
                if (!/^[0-9a-f-]{36}$/.test(a1 ?? ''))
                    return (0, format_1.errorReply)('Ungültige Anfrage.');
                return { modal: { id: `drep:retsub:${a1}`, title: 'Zur Nachbesserung', fields: [{ id: 'note', label: 'Was soll nachgebessert werden?', paragraph: true, required: true, maxLength: 1000 }] } };
            }
            if (action === 'edit') {
                const { t, values } = await load(c, 'e', a1 ?? '');
                return openModal(c, t, 'e', a1 ?? '', 0, values);
            }
            const mode = (a1 === 'e' ? 'e' : 'n'), id = a2 ?? '', page = Number(a3 ?? 0);
            if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(page) || page < 0)
                return (0, format_1.errorReply)('Ungültige Anfrage.');
            const k = key(c, mode, id);
            if (action === 'next') {
                const d = drafts.get(k);
                if (!d)
                    return (0, format_1.errorReply)('Die Eingabe ist abgelaufen – bitte neu beginnen.');
                const { t } = await load(c, mode, id);
                return openModal(c, t, mode, id, page, d.values);
            }
            if (action !== 'sub')
                return (0, format_1.errorReply)('Unbekannte Aktion.');
            const { t, report } = await load(c, mode, id);
            const d = drafts.get(k) ?? { values: { ...(report?.values ?? {}) }, at: Date.now() };
            d.values = { ...d.values, ...(c.fields ?? {}) };
            d.at = Date.now();
            drafts.set(k, d);
            if (page + 1 < pages(t))
                return { ephemeral: true, content: `Seite ${page + 1} von ${pages(t)} gespeichert.`, buttons: [{ id: `drep:next:${mode}:${id}:${page + 1}`, label: `Weiter (${page + 2}/${pages(t)})`, emoji: '➡️', style: 'primary' }] };
            drafts.delete(k);
            if (mode === 'e') {
                const r = await c.api.asUser(c.discordId, 'PATCH', `/duty-reports/${id}`, { values: d.values });
                return (0, format_1.okReply)(`Bericht **${r.number}** aktualisiert – auch im Dashboard und in Discord.`);
            }
            const r = await c.api.asUser(c.discordId, 'POST', '/duty-reports', { templateId: id, values: d.values, source: 'DISCORD', guildId: c.guildId ?? null });
            return (0, format_1.okReply)(r.merged ? `Für diesen Zeitraum gab es schon deinen Bericht **${r.number}** – er wurde aktualisiert.` : `Bericht **${r.number}** eingereicht. Du findest ihn auch im Dashboard; mit „Bearbeiten“ kannst du ihn ändern.`);
        }
        catch (e) {
            return e instanceof Error && !('status' in e) ? (0, format_1.errorReply)(e.message) : (0, errors_1.mapError)(e);
        }
    },
};
//# sourceMappingURL=duty-reports.js.map