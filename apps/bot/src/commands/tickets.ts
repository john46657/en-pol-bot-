import type { TicketEffect } from '@enrp/shared';
import { BotApiError } from '../api';
import { clip, COLORS, errorReply, okReply, plain, type ButtonSpec, type Reply, type SelectSpec } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

// ---------------- Support-Tickets (konfiguriert im Dashboard; der Bot führt nur aus) ----------------
type R = { message?: string; effects?: TicketEffect[] };
interface Options { closed: boolean; statuses: { id: string; name: string; emoji: string }[]; priorities: { id: string; name: string; emoji: string }[]; categories: { id: string; name: string; emoji: string | null }[] }
const UUID = /^[0-9a-f-]{36}$/;
const emojiOf = (e?: string | null) => (e && e.length <= 64 ? e : undefined);

/** API-Fehler mit deutscher Meldung direkt anzeigen (Limits, Voraussetzungen …); sonst die Standard-Fehlerbehandlung. */
function fail(e: unknown): Reply {
  if (e instanceof BotApiError && [400, 403, 404, 409].includes(e.status) && e.message && !/^You |permission/i.test(e.message)) return errorReply(clip(e.message, 500));
  return mapError(e);
}
async function run(c: Ctx, r: R, text?: string): Promise<Reply> {
  if (r.effects?.length && c.applyEffects) await c.applyEffects(r.effects);
  return okReply(text ?? r.message ?? 'Erledigt.');
}
/** Mitarbeiter-Aktion (eigenes Recht je Aktion, geprüft im System). */
const staff = (c: Ctx, id: string, body: Record<string, unknown>) => c.api.asUser<R>(c.discordId, 'POST', `/support-tickets/${id}/actions`, body);
const options = (c: Ctx, id: string) => c.api.asUser<Options>(c.discordId, 'GET', `/support-tickets/${id}/options`);

/** Schließen: als Mitarbeiter, sonst als Ersteller (falls die Kategorie das erlaubt). */
async function close(c: Ctx, id: string, reason?: string): Promise<Reply> {
  try { return await run(c, await staff(c, id, { action: 'close', ...(reason ? { reason } : {}) })); }
  catch (e) {
    if (!(e instanceof BotApiError) || (e.status !== 401 && e.status !== 403)) return fail(e);
    try { return await run(c, await c.api.service<R>('POST', `/bot/support-tickets/${id}/creator-close`, { discordId: c.discordId, ...(reason ? { reason } : {}) })); }
    catch (e2) { return fail(e2); }
  }
}

async function answer(c: Ctx, id: string, questionId: string, values: string[] | null): Promise<Reply> {
  try {
    const r = await c.api.service<R & { answer: string; done: boolean }>('POST', `/bot/support-tickets/${id}/answer`, { discordId: c.discordId, questionId, values });
    if (r.effects?.length && c.applyEffects) await c.applyEffects(r.effects);
    return { ...okReply(r.done ? 'Danke! Alle Fragen sind beantwortet – das Team meldet sich.' : 'Gespeichert.'), update: { embeds: [{ title: '✅ Beantwortet', description: clip(plain(r.answer), 1000), color: COLORS.success }] } };
  } catch (e) { return fail(e); }
}

const durationButtons = (id: string, minutes: number): ButtonSpec[] => [
  { id: `tk:addt:${id}:0`, label: 'Dauerhaft', style: minutes === 0 ? 'primary' : 'secondary' },
  { id: `tk:addt:${id}:60`, label: '⏱️ 1 Stunde', style: minutes === 60 ? 'primary' : 'secondary' },
  { id: `tk:addt:${id}:1440`, label: '⏱️ 24 Stunden', style: minutes === 1440 ? 'primary' : 'secondary' },
];
const addPicker = (id: string, minutes: number): Reply => ({
  ephemeral: true, embeds: [{ title: '➕ Zum Ticket hinzufügen', description: `Wähle Benutzer oder Rollen.${minutes ? ` Zugriff ist **befristet** (${minutes >= 60 ? `${minutes / 60} Std.` : `${minutes} Min.`}).` : ''}`, color: COLORS.info }],
  selects: [{ id: `tk:addu:${id}:${minutes}`, placeholder: 'Benutzer wählen …', kind: 'user', min: 1, max: 10, options: [] }, { id: `tk:addr:${id}:${minutes}`, placeholder: 'Rolle wählen …', kind: 'role', min: 1, max: 5, options: [] }],
  buttons: durationButtons(id, minutes),
});

/** Alle Ticket-Interaktionen: `tk:<aktion>:<ticketId|panelId>:…` */
export const TICKET_INTERACTION: InteractionDef = {
  prefix: 'tk',
  opensModal: (a) => ['ans', 'rename', 'note', 'ratec', 'closem'].includes(a[0] ?? '') || (a[0] === 'close' && a[2] === 'm'),
  async run(c): Promise<Reply> {
    const [action, id = '', ...rest] = c.args;
    const f = c.fields ?? {};
    try {
      switch (action) {
        // ---- Ticket öffnen (Panel: Button oder Dropdown) ----
        case 'open': {
          const categoryId = rest[0] ?? c.values?.[0];
          if (!categoryId || !UUID.test(categoryId) || !c.guildId) return errorReply('Bitte eine Ticket-Art auswählen.');
          const r = await c.api.service<R>('POST', '/bot/support-tickets/open', { categoryId, panelId: UUID.test(id) ? id : undefined, guildId: c.guildId, discordId: c.discordId, discordName: c.userName ?? c.discordId, memberRoleIds: c.memberRoleIds ?? [] });
          if (!c.applyEffects) return errorReply('Tickets sind hier nicht verfügbar.');
          const done = await c.applyEffects(r.effects ?? []);
          return okReply(done.channelId ? `Dein Ticket wurde erstellt: <#${done.channelId}>` : 'Dein Ticket wird erstellt …');
        }
        // ---- Ticket für ein anderes Mitglied öffnen (Team, Recht ticket.create): /support mitglied:… ----
        case 'for': {
          const categoryId = c.values?.[0];
          if (!/^\d{15,25}$/.test(id) || !categoryId || !UUID.test(categoryId) || !c.guildId) return errorReply('Bitte eine Ticket-Art auswählen.');
          const name = (await c.userNameOf?.(id).catch(() => null)) ?? id;
          const r = await c.api.asUser<R & { ticket?: { id: string } }>(c.discordId, 'POST', '/support-tickets', { categoryId, discordId: id, discordName: name, guildId: c.guildId });
          if (!c.applyEffects) return errorReply('Tickets sind hier nicht verfügbar.');
          const done = await c.applyEffects(r.effects ?? []);
          return okReply(done.channelId ? `Ticket für <@${id}> erstellt: <#${done.channelId}>` : 'Ticket wird erstellt …');
        }
        // ---- Fragen ----
        case 'ans': {
          const [qid, kind] = rest;
          return { modal: { id: `tk:ansm:${id}:${qid}`, title: 'Antwort', fields: [{ id: 'value', label: 'Deine Antwort', paragraph: kind === 'l', required: true, maxLength: kind === 'l' ? 2000 : 200 }] } };
        }
        case 'ansm': return answer(c, id, rest[0] ?? '', [f.value ?? '']);
        case 'ansv': return answer(c, id, rest[0] ?? '', [rest[1] ?? '']);
        case 'anss': return answer(c, id, rest[0] ?? '', c.values ?? []);
        case 'skip': return answer(c, id, rest[0] ?? '', null);
        // ---- Schließen ----
        case 'close': {
          if (rest[0] === 'n') return close(c, id);
          if (rest[0] === 'm') return { modal: { id: `tk:closemodal:${id}`, title: 'Ticket schließen', fields: [{ id: 'reason', label: 'Warum wird dieses Ticket geschlossen?', paragraph: true, required: false, maxLength: 500 }] } };
          const o = await c.api.service<{ mode: string; source: string; reasons: string[]; closed: boolean }>('GET', `/bot/support-tickets/${id}/close-options`);
          if (o.closed) return errorReply('Das Ticket ist bereits geschlossen.');
          if (!o.reasons.length && o.mode !== 'NONE') return { modal: { id: `tk:closemodal:${id}`, title: 'Ticket schließen', fields: [{ id: 'reason', label: 'Warum wird dieses Ticket geschlossen?', paragraph: true, required: o.mode === 'REQUIRED', maxLength: 500 }] } };
          const buttons: ButtonSpec[] = [
            ...(o.source === 'BOTH' ? [{ id: `tk:closem:${id}`, label: 'Eigener Grund', emoji: '✏️', style: 'secondary' as const }] : []),
            ...(o.mode === 'OPTIONAL' ? [{ id: `tk:closen:${id}`, label: 'Ohne Grund schließen', style: 'secondary' as const }] : []),
          ];
          return { ephemeral: true, embeds: [{ title: '🔒 Ticket schließen', description: 'Warum wird dieses Ticket geschlossen?', color: COLORS.danger }], select: { id: `tk:closer:${id}`, placeholder: 'Grund auswählen …', options: o.reasons.slice(0, 25).map((r) => ({ label: clip(r, 100), value: clip(r, 100) })) }, buttons };
        }
        case 'closem': return { modal: { id: `tk:closemodal:${id}`, title: 'Ticket schließen', fields: [{ id: 'reason', label: 'Warum wird dieses Ticket geschlossen?', paragraph: true, required: true, maxLength: 500 }] } };
        case 'closemodal': return close(c, id, (f.reason ?? '').trim() || undefined);
        case 'closer': return close(c, id, c.values?.[0]);
        case 'closen': return close(c, id);
        // ---- Einfache Mitarbeiter-Aktionen ----
        case 'claim': case 'unclaim': case 'lock': case 'unlock': case 'escalate': case 'transcript': case 'reopen': case 'rating':
          return run(c, await staff(c, id, { action }));
        case 'delete': return { ephemeral: true, embeds: [{ title: '🗑️ Ticket löschen?', description: 'Der Channel wird gelöscht (ein Transcript wird vorher gesichert, falls eingestellt).', color: COLORS.danger }], buttons: [{ id: `tk:delyes:${id}`, label: 'Endgültig löschen', style: 'danger' }] };
        case 'delyes': return run(c, await staff(c, id, { action: 'delete' }));
        // ---- Benutzer/Rollen ----
        case 'add_user': return addPicker(id, 0);
        case 'addt': return addPicker(id, Number(rest[0]) || 0);
        case 'addu': case 'addr': {
          const minutes = Number(rest[0]) || 0;
          let n = 0;
          for (const target of c.values ?? []) {
            const r = await staff(c, id, { action: 'add_access', targetId: target, kind: action === 'addu' ? 'USER' : 'ROLE', ...(minutes ? { minutes } : {}) });
            if (r.effects?.length && c.applyEffects) await c.applyEffects(r.effects);
            n++;
          }
          return okReply(`${n} ${action === 'addu' ? 'Benutzer' : 'Rolle(n)'} hinzugefügt.`);
        }
        case 'remove_user': return { ephemeral: true, embeds: [{ title: '➖ Aus dem Ticket entfernen', description: 'Wähle Benutzer oder Rollen, die hinzugefügt wurden.', color: COLORS.info }], selects: [{ id: `tk:rmu:${id}`, placeholder: 'Benutzer wählen …', kind: 'user', min: 1, max: 10, options: [] }, { id: `tk:rmr:${id}`, placeholder: 'Rolle wählen …', kind: 'role', min: 1, max: 5, options: [] }] };
        case 'rmu': case 'rmr': {
          let n = 0;
          for (const target of c.values ?? []) { const r = await staff(c, id, { action: 'remove_access', targetId: target }); if (r.effects?.length && c.applyEffects) await c.applyEffects(r.effects); n++; }
          return okReply(`${n} entfernt.`);
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
          if (!c.guildId || !c.listCategories) return errorReply('Das geht nur auf einem Server.');
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
          const r = await c.api.service<{ thanks: string }>('POST', `/bot/support-tickets/${id}/rating`, { discordId: c.discordId, stars: Number(rest[0]) });
          return { ...okReply(r.thanks), buttons: [{ id: `tk:ratec:${id}`, label: 'Kommentar hinzufügen', emoji: '💬', style: 'secondary' }], update: { embeds: [{ title: `⭐ ${'⭐'.repeat(Math.max(0, Number(rest[0]) - 1))} bewertet`, description: 'Danke für dein Feedback!', color: COLORS.success }] } };
        }
        case 'ratec': return { modal: { id: `tk:ratecm:${id}`, title: 'Kommentar zur Bewertung', fields: [{ id: 'comment', label: 'Wie zufrieden warst du mit dem Support?', paragraph: true, required: true, maxLength: 1000 }] } };
        case 'ratecm': { await c.api.service('POST', `/bot/support-tickets/${id}/rating-comment`, { discordId: c.discordId, comment: f.comment ?? '' }); return okReply('Danke für deinen Kommentar!'); }
        default: return errorReply('Unbekannte Aktion.');
      }
    } catch (e) { return fail(e); }
  },
};

const pick = (id: string, title: string, opts: SelectSpec['options']): Reply => (opts.length
  ? { ephemeral: true, embeds: [{ title, color: COLORS.info }], select: { id, placeholder: 'Bitte auswählen …', options: opts.slice(0, 25).map((o) => ({ ...o, label: clip(o.label, 100) })) } }
  : errorReply('Keine Auswahl verfügbar.'));

interface OpenableCategory { id: string; name: string; emoji: string | null; description: string; requiredRoleIds: string[]; allowedUserIds: string[] }
/** `/support` – Ticket ohne Panel öffnen; mit `mitglied` öffnet das Team ein Ticket für jemand anderen. */
export const TICKET_COMMAND: CommandDef = {
  name: 'support', description: 'Ein Support-Ticket öffnen (Team: auch für ein anderes Mitglied)',
  options: [{ name: 'mitglied', description: 'Nur Team: Ticket für dieses Mitglied öffnen', type: 'user' }],
  async run(c) {
    if (!c.guildId) return errorReply('Tickets gehen nur auf einem Server, nicht per Direktnachricht.');
    const member = typeof c.opts.mitglied === 'string' && c.opts.mitglied !== c.discordId ? c.opts.mitglied : null;
    try {
      const all = await c.api.service<OpenableCategory[]>('GET', '/bot/support-tickets/categories');
      // für sich selbst nur Ticket-Arten, die man öffnen darf (das System prüft beim Öffnen erneut)
      const roles = c.memberRoleIds ?? [];
      const cats = member ? all : all.filter((x) => (!x.requiredRoleIds.length || x.requiredRoleIds.some((r) => roles.includes(r))) && (!x.allowedUserIds.length || x.allowedUserIds.includes(c.discordId)));
      if (!cats.length) return errorReply(all.length ? 'Du darfst derzeit keine Ticket-Art öffnen.' : 'Es ist noch keine Ticket-Art eingerichtet (Dashboard → Support Tickets → Categories).');
      const options = cats.slice(0, 25).map((x) => ({ label: clip(x.name, 100), value: x.id, ...(x.description ? { description: clip(x.description, 100) } : {}), ...(emojiOf(x.emoji) ? { emoji: emojiOf(x.emoji)! } : {}) }));
      // genau eine Ticket-Art für sich selbst: direkt öffnen
      if (!member && cats.length === 1) return await TICKET_INTERACTION.run({ ...c, args: ['open', 'cmd', cats[0]!.id] });
      return {
        ephemeral: true,
        embeds: [{ title: member ? '🎫 Ticket für ein Mitglied öffnen' : '🎫 Ticket öffnen', description: member ? `Für <@${member}> – wähle die Ticket-Art.` : 'Wähle die passende Ticket-Art.', color: COLORS.info }],
        select: { id: member ? `tk:for:${member}` : 'tk:open:cmd', placeholder: 'Ticket-Art wählen …', options },
      };
    } catch (e) { return fail(e); }
  },
};
