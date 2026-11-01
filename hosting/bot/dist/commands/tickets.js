"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TICKET_ADMIN_COMMAND = exports.TICKET_COMMAND = exports.TICKET_INTERACTION = void 0;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
const UUID = /^[0-9a-f-]{36}$/;
const emojiOf = (e) => (e && e.length <= 64 ? e : undefined);
/** API-Fehler mit deutscher Meldung direkt anzeigen (Limits, Voraussetzungen …); sonst die Standard-Fehlerbehandlung. */
function fail(e) {
    if (e instanceof api_1.BotApiError && [400, 403, 404, 409].includes(e.status) && e.message && !/^You |permission|^Dafür fehlt dir die Berechtigung|steht dem Bot nicht zur Verfügung/i.test(e.message))
        return (0, format_1.errorReply)((0, format_1.clip)(e.message, 500));
    return (0, errors_1.mapError)(e);
}
async function run(c, r, text) {
    if (r.effects?.length && c.applyEffects)
        await c.applyEffects(r.effects);
    return (0, format_1.okReply)(text ?? r.message ?? 'Erledigt.');
}
/** Mitarbeiter-Aktion (eigenes Recht je Aktion, geprüft im System). */
const staff = (c, id, body) => c.api.asUser(c.discordId, 'POST', `/support-tickets/${id}/actions`, body);
const options = (c, id) => c.api.asUser(c.discordId, 'GET', `/support-tickets/${id}/options`);
/** Schließen: als Mitarbeiter, sonst als Ersteller (falls die Kategorie das erlaubt). */
async function close(c, id, reason, answers) {
    const body = { ...(reason ? { reason } : {}), ...(answers ? { answers } : {}) };
    try {
        return await run(c, await staff(c, id, { action: 'close', ...body }));
    }
    catch (e) {
        if (!(e instanceof api_1.BotApiError) || (e.status !== 401 && e.status !== 403))
            return fail(e);
        try {
            return await run(c, await c.api.service('POST', `/bot/support-tickets/${id}/creator-close`, { discordId: c.discordId, ...body }));
        }
        catch (e2) {
            return fail(e2);
        }
    }
}
async function answer(c, id, questionId, values) {
    try {
        const r = await c.api.service('POST', `/bot/support-tickets/${id}/answer`, { discordId: c.discordId, questionId, values });
        if (r.effects?.length && c.applyEffects)
            await c.applyEffects(r.effects);
        return { ...(0, format_1.okReply)(r.done ? 'Danke! Alle Fragen sind beantwortet – das Team meldet sich.' : 'Gespeichert.'), update: { embeds: [{ title: '✅ Beantwortet', description: (0, format_1.clip)((0, format_1.plain)(r.answer), 1000), color: format_1.COLORS.success }] } };
    }
    catch (e) {
        return fail(e);
    }
}
/** Formular vom System → Discord-Formular des Bots. */
const toModal = (m) => ({ modal: { id: m.id, title: m.title, fields: m.fields.map((f) => ({
            id: f.id, label: f.label, required: f.required, ...(f.description ? { description: f.description } : {}), ...(f.placeholder ? { placeholder: f.placeholder } : {}),
            ...(f.kind === 'select' || f.kind === 'file' ? { kind: f.kind, options: f.options, minValues: f.minValues, maxValues: f.maxValues } : { kind: 'text', paragraph: f.kind === 'paragraph', minLength: f.minLength, maxLength: f.maxLength, value: f.value }),
        })) } });
/** Kategorie mit Formular: Voraussetzungen prüfen lassen und Schritt 1 als Discord-Formular zeigen (erste Antwort, kein Aufschub möglich). */
async function startForm(c, panel, categoryId) {
    if (!c.guildId)
        return (0, format_1.errorReply)('Tickets gehen nur auf einem Server.');
    const r = await c.api.service('POST', '/bot/support-tickets/form/start', { categoryId, ...(UUID.test(panel) ? { panelId: panel } : {}), guildId: c.guildId, discordId: c.discordId, discordName: c.userName ?? c.discordId, memberRoleIds: c.memberRoleIds ?? [] });
    // Kategorie braucht (inzwischen) kein Formular: Erstellen über einen normalen Button (dort darf die Antwort warten)
    if ('open' in r)
        return { ephemeral: true, embeds: [{ title: '🎫 Ticket öffnen', description: 'Für diese Kategorie ist kein Formular nötig.', color: format_1.COLORS.info }], buttons: [{ id: `tk:open:${panel}:${categoryId}`, label: 'Ticket erstellen', emoji: '🎫', style: 'primary' }] };
    return toModal(r.modal);
}
const durationButtons = (id, minutes) => [
    { id: `tk:addt:${id}:0`, label: 'Dauerhaft', style: minutes === 0 ? 'primary' : 'secondary' },
    { id: `tk:addt:${id}:60`, label: '⏱️ 1 Stunde', style: minutes === 60 ? 'primary' : 'secondary' },
    { id: `tk:addt:${id}:1440`, label: '⏱️ 24 Stunden', style: minutes === 1440 ? 'primary' : 'secondary' },
];
const addPicker = (id, minutes) => ({
    ephemeral: true, embeds: [{ title: '➕ Zum Ticket hinzufügen', description: `Wähle Benutzer oder Rollen.${minutes ? ` Zugriff ist **befristet** (${minutes >= 60 ? `${minutes / 60} Std.` : `${minutes} Min.`}).` : ''}`, color: format_1.COLORS.info }],
    selects: [{ id: `tk:addu:${id}:${minutes}`, placeholder: 'Benutzer wählen …', kind: 'user', min: 1, max: 10, options: [] }, { id: `tk:addr:${id}:${minutes}`, placeholder: 'Rolle wählen …', kind: 'role', min: 1, max: 5, options: [] }],
    buttons: durationButtons(id, minutes),
});
/** Alle Ticket-Interaktionen: `tk:<aktion>:<ticketId|panelId>:…` */
exports.TICKET_INTERACTION = {
    prefix: 'tk',
    opensModal: (a, values) => ['ans', 'rename', 'note', 'ratec', 'closem', 'formopen', 'formstep', 'closefo'].includes(a[0] ?? '') || (a[0] === 'close' && (a[2] === 'm' || a[2] === 'f'))
        // Bewertung mit Bewertungsformular („:f“) → Formular ist die erste Antwort
        || (a[0] === 'rate' && a[3] === 'f')
        // Panel: Kategorie mit Formular („:f“) → das Formular ist die erste Antwort
        || (a[0] === 'open' && (a[3] === 'f' || (!UUID.test(a[2] ?? '') && !!values?.[0]?.endsWith(':f')))),
    async run(c) {
        const [action, id = '', ...rest] = c.args;
        const f = c.fields ?? {};
        try {
            switch (action) {
                // ---- Ticket öffnen (Panel: Button oder Dropdown) ----
                case 'open': {
                    // Button: tk:open:<panel>:<kategorie>[:f] · Menü: Wert <kategorie>[:f] (weitere Menüs: tk:open:<panel>:~1 …)
                    const [categoryId, flag] = UUID.test(rest[0] ?? '') ? [rest[0], rest[1]] : (c.values?.[0] ?? '').split(':');
                    if (!categoryId || !UUID.test(categoryId) || !c.guildId)
                        return (0, format_1.errorReply)('Bitte eine Ticket-Art auswählen.');
                    if (flag === 'f')
                        return await startForm(c, id, categoryId);
                    const r = await c.api.service('POST', '/bot/support-tickets/open', { categoryId, panelId: UUID.test(id) ? id : undefined, guildId: c.guildId, discordId: c.discordId, discordName: c.userName ?? c.discordId, memberRoleIds: c.memberRoleIds ?? [], ...(c.interactionId ? { interactionId: c.interactionId } : {}) });
                    if (r.form)
                        return { ephemeral: true, embeds: [{ title: '📝 Formular', description: 'Für diese Kategorie gibt es ein kurzes Formular. Danach wird dein Ticket erstellt.', color: format_1.COLORS.info }], buttons: [{ id: `tk:formopen:${id || 'cmd'}:${categoryId}`, label: 'Formular ausfüllen', emoji: '📝', style: 'primary' }] };
                    if (r.existing)
                        return (0, format_1.okReply)(`Dein Ticket ${r.ticket?.ref ?? ''} wurde bereits erstellt.`);
                    if (!c.applyEffects)
                        return (0, format_1.errorReply)('Tickets sind hier nicht verfügbar.');
                    const done = await c.applyEffects(r.effects ?? []);
                    return (0, format_1.okReply)(done.channelId ? `Dein Ticket${r.ticket?.ref ? ` **${r.ticket.ref}**` : ''} wurde erstellt: <#${done.channelId}>` : 'Dein Ticket wird erstellt …');
                }
                // ---- Formular vor dem Erstellen (mehrstufig) ----
                case 'formopen': {
                    const categoryId = rest[0] ?? '';
                    if (!UUID.test(categoryId))
                        return (0, format_1.errorReply)('Bitte eine Ticket-Art auswählen.');
                    return await startForm(c, id, categoryId);
                }
                case 'formstep': {
                    const r = await c.api.service('GET', `/bot/support-tickets/form/${id}/modal?discordId=${c.discordId}&step=${Number(rest[0]) || 0}`);
                    return toModal(r.modal);
                }
                case 'formsub': {
                    const step = Number(rest[0]) || 0;
                    const r = await c.api.service('POST', `/bot/support-tickets/form/${id}/submit`, { discordId: c.discordId, step, values: c.modal?.values ?? {}, files: c.modal?.files ?? {} });
                    if ('errors' in r)
                        return { ephemeral: true, embeds: [{ title: '⚠️ Bitte prüfe deine Angaben', description: (0, format_1.clip)(r.errors.map((e) => `• **${(0, format_1.plain)(e.field)}:** ${(0, format_1.plain)(e.message)}`).join('\n'), 3500), color: format_1.COLORS.warning }], buttons: [{ id: `tk:formstep:${id}:${r.step}`, label: 'Erneut ausfüllen', emoji: '✏️', style: 'primary' }] };
                    if ('next' in r)
                        return { ephemeral: true, embeds: [{ title: `✅ Schritt ${r.next}/${r.steps} gespeichert`, description: 'Weiter geht es mit dem nächsten Teil des Formulars.', color: format_1.COLORS.success }], buttons: [{ id: `tk:formstep:${id}:${r.next}`, label: `Weiter (Schritt ${r.next + 1}/${r.steps})`, emoji: '➡️', style: 'primary' }] };
                    if (r.existing)
                        return (0, format_1.okReply)(`Dein Ticket **${r.ticket.ref}** wurde bereits erstellt.`);
                    if (!c.applyEffects)
                        return (0, format_1.errorReply)('Tickets sind hier nicht verfügbar.');
                    const done = await c.applyEffects(r.effects ?? []);
                    return (0, format_1.okReply)(`Dein Ticket **${r.ticket.ref}** wurde erstellt${done.channelId ? `: <#${done.channelId}>` : '.'}`);
                }
                // ---- Ticket für ein anderes Mitglied öffnen (Team, Recht ticket.create): /support mitglied:… ----
                case 'for': {
                    const categoryId = c.values?.[0];
                    if (!/^\d{15,25}$/.test(id) || !categoryId || !UUID.test(categoryId) || !c.guildId)
                        return (0, format_1.errorReply)('Bitte eine Ticket-Art auswählen.');
                    const name = (await c.userNameOf?.(id).catch(() => null)) ?? id;
                    const r = await c.api.asUser(c.discordId, 'POST', '/support-tickets', { categoryId, discordId: id, discordName: name, guildId: c.guildId });
                    if (!c.applyEffects)
                        return (0, format_1.errorReply)('Tickets sind hier nicht verfügbar.');
                    const done = await c.applyEffects(r.effects ?? []);
                    return (0, format_1.okReply)(done.channelId ? `Ticket für <@${id}> erstellt: <#${done.channelId}>` : 'Ticket wird erstellt …');
                }
                // ---- Fragen ----
                case 'ans': {
                    const [qid, kind, limits] = rest;
                    // Zeichenlimit aus der Einrichtung (…:min-max), sonst Standard
                    const [min, max] = (limits ?? '').split('-').map(Number);
                    const maxLength = Math.min(4000, max || (kind === 'l' ? 2000 : 200));
                    return { modal: { id: `tk:ansm:${id}:${qid}`, title: 'Antwort', fields: [{ id: 'value', label: 'Deine Antwort', paragraph: kind === 'l', required: true, maxLength, ...(min ? { minLength: Math.min(min, maxLength) } : {}) }] } };
                }
                case 'ansm': return answer(c, id, rest[0] ?? '', [f.value ?? '']);
                case 'ansv': return answer(c, id, rest[0] ?? '', [rest[1] ?? '']);
                case 'anss': return answer(c, id, rest[0] ?? '', c.values ?? []);
                case 'skip': return answer(c, id, rest[0] ?? '', null);
                // ---- Schließen ----
                case 'close':
                case 'closefo': {
                    // eigenes Schließformular der Kategorie (Discord-Formular; Prüfung im System)
                    if (rest[0] === 'f' || action === 'closefo') {
                        const r = await c.api.service('GET', `/bot/support-tickets/${id}/close-form`);
                        if (r.modal)
                            return toModal(r.modal);
                    }
                    if (rest[0] === 'n')
                        return close(c, id);
                    if (rest[0] === 'm')
                        return { modal: { id: `tk:closemodal:${id}`, title: 'Ticket schließen', fields: [{ id: 'reason', label: 'Warum wird dieses Ticket geschlossen?', paragraph: true, required: false, maxLength: 500 }] } };
                    const o = await c.api.service('GET', `/bot/support-tickets/${id}/close-options`);
                    if (o.closed)
                        return (0, format_1.errorReply)('Das Ticket ist bereits geschlossen.');
                    if (!o.reasons.length && o.mode !== 'NONE')
                        return { modal: { id: `tk:closemodal:${id}`, title: 'Ticket schließen', fields: [{ id: 'reason', label: 'Warum wird dieses Ticket geschlossen?', paragraph: true, required: o.mode === 'REQUIRED', maxLength: 500 }] } };
                    const buttons = [
                        ...(o.source === 'BOTH' ? [{ id: `tk:closem:${id}`, label: 'Eigener Grund', emoji: '✏️', style: 'secondary' }] : []),
                        ...(o.mode === 'OPTIONAL' ? [{ id: `tk:closen:${id}`, label: 'Ohne Grund schließen', style: 'secondary' }] : []),
                    ];
                    return { ephemeral: true, embeds: [{ title: '🔒 Ticket schließen', description: 'Warum wird dieses Ticket geschlossen?', color: format_1.COLORS.danger }], select: { id: `tk:closer:${id}`, placeholder: 'Grund auswählen …', options: o.reasons.slice(0, 25).map((r) => ({ label: (0, format_1.clip)(r, 100), value: (0, format_1.clip)(r, 100) })) }, buttons };
                }
                case 'closem': return { modal: { id: `tk:closemodal:${id}`, title: 'Ticket schließen', fields: [{ id: 'reason', label: 'Warum wird dieses Ticket geschlossen?', paragraph: true, required: true, maxLength: 500 }] } };
                case 'closemodal': return close(c, id, (f.reason ?? '').trim() || undefined);
                case 'closer': return close(c, id, c.values?.[0]);
                case 'closen': return close(c, id);
                case 'closefm': return close(c, id, undefined, c.modal?.values);
                // ---- Einfache Mitarbeiter-Aktionen ----
                case 'claim':
                case 'unclaim':
                case 'lock':
                case 'unlock':
                case 'escalate':
                case 'transcript':
                case 'reopen':
                case 'rating':
                case 'close_request':
                case 'remind':
                    return run(c, await staff(c, id, { action }));
                // ---- Weiterleiten: Teammitglied, Team-Rolle oder andere Kategorie (Verlauf bleibt erhalten) ----
                case 'forward': {
                    const o = await options(c, id); // Rechte + Kategorien
                    return { ephemeral: true, embeds: [{ title: '📨 Ticket weiterleiten', description: 'An ein Teammitglied, eine Team-Rolle oder eine andere Kategorie. Der gesamte Verlauf bleibt erhalten.', color: format_1.COLORS.info }],
                        selects: [
                            { id: `tk:fwu:${id}`, placeholder: 'An Teammitglied …', kind: 'user', min: 1, max: 1, options: [] },
                            { id: `tk:fwr:${id}`, placeholder: 'An Team-Rolle …', kind: 'role', min: 1, max: 1, options: [] },
                            ...(o.categories.length ? [{ id: `tk:fwc:${id}`, placeholder: 'An Kategorie …', options: o.categories.slice(0, 25).map((x) => ({ label: (0, format_1.clip)(x.name, 100), value: x.id, ...(emojiOf(x.emoji) ? { emoji: emojiOf(x.emoji) } : {}) })) }] : []),
                        ] };
                }
                case 'fwu':
                case 'fwr':
                case 'fwc':
                    return run(c, await staff(c, id, { action: 'forward', target: action === 'fwu' ? 'USER' : action === 'fwr' ? 'ROLE' : 'CATEGORY', targetId: c.values?.[0] ?? '' }));
                // ---- Automatik für dieses Ticket ----
                case 'automation': return { ephemeral: true, embeds: [{ title: '⚙️ Automatik für dieses Ticket', description: 'Erinnerungen, automatisches Schließen/Freigeben usw. für **dieses** Ticket pausieren oder ausschalten. Die Einstellung bleibt auch nach einem Neustart erhalten.', color: format_1.COLORS.info }],
                    buttons: [
                        { id: `tk:auto:${id}:pause:60`, label: '1 Stunde pausieren', emoji: '⏸️', style: 'secondary' }, { id: `tk:auto:${id}:pause:1440`, label: '24 Stunden pausieren', emoji: '⏸️', style: 'secondary' },
                        { id: `tk:auto:${id}:disable`, label: 'Dauerhaft aus', emoji: '⛔', style: 'danger' }, { id: `tk:auto:${id}:enable`, label: 'Wieder an', emoji: '▶️', style: 'success' },
                    ] };
                case 'auto': return run(c, await staff(c, id, { action: 'automation', mode: rest[0], ...(rest[0] === 'pause' ? { minutes: Number(rest[1]) || 60 } : {}) }));
                // ---- Antwort des Erstellers auf „Schließen anfragen“ ----
                case 'creq': {
                    const r = await c.api.service('POST', `/bot/support-tickets/${id}/close-request`, { discordId: c.discordId, accept: rest[0] === 'yes' });
                    if (r.effects?.length && c.applyEffects)
                        await c.applyEffects(r.effects);
                    return { ...(0, format_1.okReply)(r.message ?? 'Erledigt.'), update: { embeds: [{ title: rest[0] === 'yes' ? '✅ Schließen bestätigt' : '✖️ Ticket bleibt offen', color: rest[0] === 'yes' ? format_1.COLORS.success : format_1.COLORS.neutral }] } };
                }
                case 'delete': return { ephemeral: true, embeds: [{ title: '🗑️ Ticket löschen?', description: 'Der Kanal wird gelöscht (ein Transcript wird vorher gesichert, falls eingestellt).', color: format_1.COLORS.danger }], buttons: [{ id: `tk:delyes:${id}`, label: 'Endgültig löschen', style: 'danger' }] };
                case 'delyes': return run(c, await staff(c, id, { action: 'delete' }));
                // ---- Benutzer/Rollen ----
                case 'add_user': return addPicker(id, 0);
                case 'addt': return addPicker(id, Number(rest[0]) || 0);
                case 'addu':
                case 'addr': {
                    const minutes = Number(rest[0]) || 0;
                    let n = 0;
                    for (const target of c.values ?? []) {
                        const r = await staff(c, id, { action: 'add_access', targetId: target, kind: action === 'addu' ? 'USER' : 'ROLE', ...(minutes ? { minutes } : {}) }).catch((e) => {
                            // kein Teammitglied: als Ersteller hinzufügen (wenn die Ticket-Art das erlaubt)
                            if (action === 'addu' && e instanceof api_1.BotApiError && (e.status === 401 || e.status === 403))
                                return c.api.service('POST', `/bot/support-tickets/${id}/creator-add`, { discordId: c.discordId, targetId: target });
                            throw e;
                        });
                        if (r.effects?.length && c.applyEffects)
                            await c.applyEffects(r.effects);
                        n++;
                    }
                    return (0, format_1.okReply)(`${n} ${action === 'addu' ? 'Benutzer' : 'Rolle(n)'} hinzugefügt.`);
                }
                case 'remove_user': return { ephemeral: true, embeds: [{ title: '➖ Aus dem Ticket entfernen', description: 'Wähle Benutzer oder Rollen, die hinzugefügt wurden.', color: format_1.COLORS.info }], selects: [{ id: `tk:rmu:${id}`, placeholder: 'Benutzer wählen …', kind: 'user', min: 1, max: 10, options: [] }, { id: `tk:rmr:${id}`, placeholder: 'Rolle wählen …', kind: 'role', min: 1, max: 5, options: [] }] };
                case 'rmu':
                case 'rmr': {
                    let n = 0;
                    for (const target of c.values ?? []) {
                        const r = await staff(c, id, { action: 'remove_access', targetId: target });
                        if (r.effects?.length && c.applyEffects)
                            await c.applyEffects(r.effects);
                        n++;
                    }
                    return (0, format_1.okReply)(`${n} entfernt.`);
                }
                // ---- Auswahl: Priorität, Status, Kategorie, Verschieben ----
                case 'priority': {
                    const o = await options(c, id);
                    return pick(`tk:prio:${id}`, '🔔 Priorität ändern', o.priorities.map((p) => ({ label: p.name, value: p.id, emoji: emojiOf(p.emoji) })));
                }
                case 'status': {
                    const o = await options(c, id);
                    return pick(`tk:stat:${id}`, '🏷️ Status ändern', o.statuses.map((s) => ({ label: s.name, value: s.id, emoji: emojiOf(s.emoji) })));
                }
                case 'category': {
                    const o = await options(c, id);
                    return pick(`tk:cat:${id}`, '🗂️ Kategorie ändern', o.categories.map((x) => ({ label: x.name, value: x.id, emoji: emojiOf(x.emoji) })));
                }
                case 'move': {
                    if (!c.guildId || !c.listCategories)
                        return (0, format_1.errorReply)('Das geht nur auf einem Server.');
                    await options(c, id); // Rechte prüfen
                    const cats = await c.listCategories(c.guildId);
                    return pick(`tk:movesel:${id}`, '📁 In Discord-Kategorie verschieben', [{ label: '(keine Kategorie)', value: 'none' }, ...cats.slice(0, 24).map((x) => ({ label: x.name, value: x.id }))]);
                }
                case 'prio': return run(c, await staff(c, id, { action: 'priority', priorityId: c.values?.[0] }));
                case 'stat': return run(c, await staff(c, id, { action: 'status', statusId: c.values?.[0] }));
                case 'cat': return run(c, await staff(c, id, { action: 'category', categoryId: c.values?.[0] }));
                case 'movesel': return run(c, await staff(c, id, { action: 'move', parentId: c.values?.[0] === 'none' ? null : c.values?.[0] }));
                // ---- Formulare ----
                case 'rename': return { modal: { id: `tk:renm:${id}`, title: 'Ticket umbenennen', fields: [{ id: 'name', label: 'Neuer Name (Platzhalter erlaubt)', required: true, maxLength: 90, placeholder: 'z. B. support-{username}' }] } };
                case 'renm': return run(c, await staff(c, id, { action: 'rename', name: f.name ?? '' }));
                case 'note': return { modal: { id: `tk:notem:${id}`, title: 'Interne Notiz', fields: [{ id: 'text', label: 'Nur für berechtigte Mitarbeiter sichtbar', paragraph: true, required: true, maxLength: 4000 }] } };
                case 'notem': return run(c, await staff(c, id, { action: 'note', text: f.text ?? '' }));
                // ---- Bewertung (per DM an den Ersteller) ----
                case 'rate': {
                    if (rest[1] === 'f') {
                        // Bewertungsformular (Begründung usw.) – die Bewertung wird erst mit dem Formular gespeichert
                        const m = await c.api.service('GET', `/bot/support-tickets/${id}/rating-form?discordId=${c.discordId}&stars=${Number(rest[0]) || 0}`);
                        if (m.modal)
                            return toModal(m.modal);
                    }
                    const r = await c.api.service('POST', `/bot/support-tickets/${id}/rating`, { discordId: c.discordId, stars: Number(rest[0]) });
                    return { ...(0, format_1.okReply)(r.thanks), buttons: [{ id: `tk:ratec:${id}`, label: 'Begründung hinzufügen', emoji: '💬', style: 'secondary' }], update: { embeds: [{ title: `⭐ ${Number(rest[0])} – bewertet`, description: 'Danke für dein Feedback!', color: format_1.COLORS.success }] } };
                }
                case 'ratefm': {
                    const r = await c.api.service('POST', `/bot/support-tickets/${id}/rating`, { discordId: c.discordId, stars: Number(rest[0]), values: c.modal?.values ?? {} });
                    return (0, format_1.okReply)(r.thanks);
                }
                case 'ratec': return { modal: { id: `tk:ratecm:${id}`, title: 'Begründung zur Bewertung', fields: [{ id: 'comment', label: 'Warum diese Bewertung? (optional)', paragraph: true, required: true, maxLength: 1000 }] } };
                case 'ratecm': {
                    await c.api.service('POST', `/bot/support-tickets/${id}/rating-comment`, { discordId: c.discordId, comment: f.comment ?? '' });
                    return (0, format_1.okReply)('Danke für deinen Kommentar!');
                }
                default: return (0, format_1.errorReply)('Unbekannte Aktion.');
            }
        }
        catch (e) {
            return fail(e);
        }
    },
};
const pick = (id, title, opts) => (opts.length
    ? { ephemeral: true, embeds: [{ title, color: format_1.COLORS.info }], select: { id, placeholder: 'Bitte auswählen …', options: opts.slice(0, 25).map((o) => ({ ...o, label: (0, format_1.clip)(o.label, 100) })) } }
    : (0, format_1.errorReply)('Keine Auswahl verfügbar.'));
/** `/support` – Ticket ohne Panel öffnen; mit `mitglied` öffnet das Team ein Ticket für jemand anderen. */
exports.TICKET_COMMAND = {
    name: 'support', description: 'Ein Support-Ticket öffnen (Team: auch für ein anderes Mitglied)',
    options: [{ name: 'mitglied', description: 'Nur Team: Ticket für dieses Mitglied öffnen', type: 'user' }],
    async run(c) {
        if (!c.guildId)
            return (0, format_1.errorReply)('Tickets gehen nur auf einem Server, nicht per Direktnachricht.');
        const member = typeof c.opts.mitglied === 'string' && c.opts.mitglied !== c.discordId ? c.opts.mitglied : null;
        try {
            const all = await c.api.service('GET', `/bot/support-tickets/categories?guildId=${c.guildId}`);
            // für sich selbst nur Ticket-Arten, die man öffnen darf (das System prüft beim Öffnen erneut)
            const roles = c.memberRoleIds ?? [];
            const cats = member ? all : all.filter((x) => (!x.requiredRoleIds.length || x.requiredRoleIds.some((r) => roles.includes(r))) && (!x.allowedUserIds.length || x.allowedUserIds.includes(c.discordId)));
            if (!cats.length)
                return (0, format_1.errorReply)(all.length ? 'Du darfst derzeit keine Ticket-Art öffnen.' : 'Es ist noch keine Ticket-Art eingerichtet (Dashboard → Support Tickets → Categories).');
            const options = cats.slice(0, 25).map((x) => ({ label: (0, format_1.clip)(x.name, 100), value: x.id, ...(x.description ? { description: (0, format_1.clip)(x.description, 100) } : {}), ...(emojiOf(x.emoji) ? { emoji: emojiOf(x.emoji) } : {}) }));
            // genau eine Ticket-Art für sich selbst: direkt öffnen
            if (!member && cats.length === 1)
                return await exports.TICKET_INTERACTION.run({ ...c, args: ['open', 'cmd', cats[0].id] });
            return {
                ephemeral: true,
                embeds: [{ title: member ? '🎫 Ticket für ein Mitglied öffnen' : '🎫 Ticket öffnen', description: member ? `Für <@${member}> – wähle die Ticket-Art.` : 'Wähle die passende Ticket-Art.', color: format_1.COLORS.info }],
                select: { id: member ? `tk:for:${member}` : 'tk:open:cmd', placeholder: 'Ticket-Art wählen …', options },
            };
        }
        catch (e) {
            return fail(e);
        }
    },
};
// ---------------- /ticket: Ticket-Aktionen per Slash-Befehl im Ticket-Kanal ----------------
const TICKET_SUBS = {
    claim: 'Ticket übernehmen', unclaim: 'Ticket freigeben', schliessen: 'Ticket schließen', anfrage: 'Schließungsanfrage senden', weiterleiten: 'Ticket weiterleiten (Mitglied, Rolle oder Kategorie)',
    hinzufuegen: 'Person zum Ticket hinzufügen', entfernen: 'Person aus dem Ticket entfernen', umbenennen: 'Ticket-Kanal umbenennen', erinnern: 'Ticket-Ersteller erinnern',
    notiz: 'Private Teamnotiz (nie für den Ersteller sichtbar)', automatik: 'Automatisierungen für dieses Ticket pausieren/aus/an', oeffnen: 'Ticket im Auftrag eines Mitglieds öffnen',
};
/** Ticket des aktuellen Kanals (Slash-Befehle laufen im Ticket-Kanal). */
async function currentTicket(c) {
    if (!c.channelId)
        throw new api_1.BotApiError(404, 'NOT_FOUND', 'Nutze den Befehl im Ticket-Kanal.');
    return c.api.service('GET', `/bot/support-tickets/by-channel/${c.channelId}`);
}
exports.TICKET_ADMIN_COMMAND = {
    name: 'ticket', description: 'Ticket-Aktionen im Ticket-Kanal (Rechte wie im Dashboard)',
    subcommands: [
        { name: 'claim', description: TICKET_SUBS.claim }, { name: 'unclaim', description: TICKET_SUBS.unclaim },
        { name: 'schliessen', description: TICKET_SUBS.schliessen, options: [{ name: 'grund', description: 'Schließungsgrund', type: 'string', maxLength: 500 }] },
        { name: 'anfrage', description: TICKET_SUBS.anfrage },
        { name: 'weiterleiten', description: TICKET_SUBS.weiterleiten, options: [
                { name: 'mitglied', description: 'An dieses Teammitglied', type: 'user' }, { name: 'rolle', description: 'An diese Team-Rolle', type: 'role' },
                { name: 'kategorie', description: 'In diese Kategorie', type: 'string', autocomplete: true }, { name: 'notiz', description: 'Interne Notiz zur Weiterleitung', type: 'string', maxLength: 1000 },
            ] },
        { name: 'hinzufuegen', description: TICKET_SUBS.hinzufuegen, options: [{ name: 'mitglied', description: 'Person', type: 'user', required: true }] },
        { name: 'entfernen', description: TICKET_SUBS.entfernen, options: [{ name: 'mitglied', description: 'Person', type: 'user', required: true }] },
        { name: 'umbenennen', description: TICKET_SUBS.umbenennen, options: [{ name: 'name', description: 'Neuer Name (Platzhalter erlaubt, z. B. support-{username})', type: 'string', required: true, maxLength: 90 }] },
        { name: 'erinnern', description: TICKET_SUBS.erinnern, options: [{ name: 'text', description: 'Eigener Erinnerungstext (optional)', type: 'string', maxLength: 1500 }] },
        { name: 'notiz', description: TICKET_SUBS.notiz, options: [{ name: 'text', description: 'Notiz', type: 'string', required: true, maxLength: 4000 }] },
        { name: 'automatik', description: TICKET_SUBS.automatik, options: [{ name: 'modus', description: 'Was tun?', type: 'string', required: true, choices: [
                        { name: '1 Stunde pausieren', value: 'pause60' }, { name: '24 Stunden pausieren', value: 'pause1440' }, { name: '7 Tage pausieren', value: 'pause10080' }, { name: 'Dauerhaft ausschalten', value: 'disable' }, { name: 'Wieder einschalten', value: 'enable' },
                    ] }] },
        { name: 'oeffnen', description: TICKET_SUBS.oeffnen, options: [{ name: 'mitglied', description: 'Für dieses Mitglied', type: 'user', required: true }] },
    ],
    async complete(c, option, value) {
        if (option !== 'kategorie' || !c.guildId)
            return [];
        const all = await c.api.service('GET', `/bot/support-tickets/categories?guildId=${c.guildId}`).catch(() => []);
        return all.filter((x) => x.name.toLowerCase().includes(value.toLowerCase())).slice(0, 25).map((x) => ({ name: x.name, value: x.id }));
    },
    async run(c) {
        if (!c.guildId)
            return (0, format_1.errorReply)('Tickets gibt es nur auf einem Server.');
        const sub = String(c.opts._sub ?? '');
        try {
            if (sub === 'oeffnen')
                return await exports.TICKET_COMMAND.run({ ...c, opts: { mitglied: c.opts.mitglied } });
            const { id } = await currentTicket(c);
            const str = (k) => (typeof c.opts[k] === 'string' && c.opts[k].trim() ? c.opts[k].trim() : undefined);
            switch (sub) {
                case 'claim':
                case 'unclaim': return run(c, await staff(c, id, { action: sub }));
                case 'anfrage': return run(c, await staff(c, id, { action: 'close_request' }));
                case 'schliessen': {
                    // mit Schließformular: Formular über einen Button (Slash-Befehle können hier kein Formular zeigen)
                    const o = await c.api.service('GET', `/bot/support-tickets/${id}/close-options`);
                    if (o.closed)
                        return (0, format_1.errorReply)('Das Ticket ist bereits geschlossen.');
                    if (o.form)
                        return { ephemeral: true, embeds: [{ title: '🔒 Ticket schließen', description: 'Für diese Kategorie gibt es ein Schließformular.', color: format_1.COLORS.danger }], buttons: [{ id: `tk:closefo:${id}`, label: 'Schließformular ausfüllen', emoji: '📝', style: 'danger' }] };
                    return close(c, id, str('grund'));
                }
                case 'weiterleiten': {
                    const target = str('mitglied') ? { target: 'USER', targetId: str('mitglied') } : str('rolle') ? { target: 'ROLE', targetId: str('rolle') } : str('kategorie') ? { target: 'CATEGORY', targetId: str('kategorie') } : null;
                    if (!target)
                        return (0, format_1.errorReply)('Bitte ein Ziel angeben: Mitglied, Rolle oder Kategorie.');
                    return run(c, await staff(c, id, { action: 'forward', ...target, ...(str('notiz') ? { note: str('notiz') } : {}) }));
                }
                case 'hinzufuegen': return run(c, await staff(c, id, { action: 'add_access', targetId: str('mitglied'), kind: 'USER' }));
                case 'entfernen': return run(c, await staff(c, id, { action: 'remove_access', targetId: str('mitglied') }));
                case 'umbenennen': return run(c, await staff(c, id, { action: 'rename', name: str('name') ?? '' }));
                case 'erinnern': return run(c, await staff(c, id, { action: 'remind', ...(str('text') ? { text: str('text') } : {}) }));
                case 'notiz': return run(c, await staff(c, id, { action: 'note', text: str('text') ?? '' }));
                case 'automatik': {
                    const m = str('modus') ?? '';
                    const body = m.startsWith('pause') ? { mode: 'pause', minutes: Number(m.slice(5)) || 60 } : { mode: m === 'disable' ? 'disable' : 'enable' };
                    return run(c, await staff(c, id, { action: 'automation', ...body }));
                }
                default: return (0, format_1.errorReply)('Unbekannter Unterbefehl.');
            }
        }
        catch (e) {
            return fail(e);
        }
    },
};
//# sourceMappingURL=tickets.js.map