import { checkAnswer, cooldownLeft, decisionRoles, formatMinutes, normalizeQuestion, renderText, roleBlock, submitRoles } from './forms.js';

/** Status einer Bewerbung. Offen = OPEN, REVIEW (in Prüfung), INTERVIEW (Gespräch). */
export const STATUS = { OPEN: 'Offen', REVIEW: 'In Prüfung', INTERVIEW: 'Gespräch', ACCEPTED: 'Angenommen', REJECTED: 'Abgelehnt', WITHDRAWN: 'Zurückgezogen' };
export const OPEN_STATUSES = ['OPEN', 'REVIEW', 'INTERVIEW'];
export const isOpen = (a) => OPEN_STATUSES.includes(a.status);
export const LEFT_REASON = 'Hat den Discord-Server verlassen.';

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/**
 * Kernlogik des Bewerbungssystems – vom Bot und vom Dashboard benutzt.
 * `discord` ist der Adapter zu Discord (siehe discord/adapter.js); Fehler dort brechen nie eine Entscheidung ab.
 */
export class ApplicationService {
  constructor({ store, discord, roblox, log = console }) {
    this.store = store; this.discord = discord; this.roblox = roblox; this.log = log;
  }

  types(guildId) { return this.store.guild(guildId).types; }
  type(guildId, key) { return this.types(guildId).find((t) => t.key === key) ?? null; }
  /** Bewerbungsart; gelöschte Arten bekommen Standardwerte (für Entscheidungen alter Bewerbungen). */
  typeOf(app) { return this.type(app.guildId, app.type) ?? { key: app.type, name: app.typeName, questions: [], messages: {}, roles: {}, channels: {}, pingRoles: [] }; }

  // ---------------- Sperren ----------------
  activeBans(guildId, now = Date.now()) { return this.store.bans(guildId).filter((b) => !b.liftedAt && (!b.expiresAt || Date.parse(b.expiresAt) > now)); }
  findBan(guildId, who, typeKey) {
    return this.activeBans(guildId).find((b) => ((who.userId && b.userId === who.userId) || (who.robloxId && b.robloxId === who.robloxId)) && (b.types.includes('*') || b.types.includes(typeKey))) ?? null;
  }
  banMessage(b, what) {
    return `Du bist für ${what} gesperrt und kannst dich nicht bewerben. Grund: ${b.reason}${b.expiresAt ? ` · gilt bis ${new Date(b.expiresAt).toLocaleDateString('de-DE')}` : ''}`;
  }
  async createBan(guildId, actor, d) {
    const userId = /^\d{15,25}$/.test(d.userId ?? '') ? d.userId : null;
    let robloxId = null, robloxName = null;
    const rb = String(d.roblox ?? '').trim();
    if (rb) {
      if (/^\d{1,20}$/.test(rb)) robloxId = rb;
      else {
        const found = await this.roblox.lookup(rb);
        if (found === null) throw new AppError(400, `Den Roblox-Benutzer „${rb}“ gibt es nicht.`);
        if (!found) throw new AppError(400, 'Roblox ist gerade nicht erreichbar – bitte die Roblox-ID eintragen.');
        robloxId = found.id; robloxName = found.name;
      }
    }
    if (!userId && !robloxId) throw new AppError(400, 'Bitte Discord-ID und/oder Roblox-Name angeben.');
    const types = Array.isArray(d.types) && d.types.includes('*') ? ['*'] : [...new Set((d.types ?? []).filter((t) => typeof t === 'string'))];
    if (!types.length) throw new AppError(400, 'Bitte mindestens eine Bewerbungsart auswählen.');
    const reason = String(d.reason ?? '').trim().slice(0, 500);
    if (reason.length < 3) throw new AppError(400, 'Bitte einen Grund angeben (mind. 3 Zeichen).');
    const expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) throw new AppError(400, 'Das Ablaufdatum liegt in der Vergangenheit.');
    const name = String(d.name ?? '').trim().slice(0, 80) || robloxName || (userId ? `Discord ${userId}` : rb);
    return this.store.addBan({ guildId, userId, robloxId, name, types, reason, expiresAt: expiresAt?.toISOString() ?? null, createdBy: actor });
  }
  liftBan(guildId, id, actor) {
    const b = this.store.bans(guildId).find((x) => x.id === id);
    if (!b) throw new AppError(404, 'Sperre nicht gefunden.');
    if (!b.liftedAt) { b.liftedAt = new Date().toISOString(); b.liftedBy = actor; this.store.touch(); }
    return b;
  }

  // ---------------- Vorabprüfung & Einreichen ----------------
  openApplication(guildId, userId, typeKey) { return this.store.applications(guildId).find((a) => a.userId === userId && a.type === typeKey && isOpen(a)) ?? null; }

  /** Vor dem Start (Panel-Klick): Fehlermeldung oder null. `memberRoles` nur auf dem Server bekannt. */
  preCheck(guildId, typeKey, { userId, memberRoles }) {
    const t = this.type(guildId, typeKey);
    if (!t) return 'Diese Bewerbung gibt es nicht mehr. Bitte das Panel neu laden.';
    if (!t.enabled) return `Bewerbungen für **${t.name}** sind derzeit geschlossen.`;
    if (memberRoles) { const blocked = roleBlock(t, memberRoles); if (blocked) return blocked; }
    const ban = this.findBan(guildId, { userId }, t.key);
    if (ban) return `⛔ ${this.banMessage(ban, t.name)}`;
    const open = this.openApplication(guildId, userId, t.key);
    if (open) return `Du hast für **${t.name}** bereits eine offene Bewerbung (${open.number}). Bitte warte auf die Entscheidung.`;
    const last = this.store.applications(guildId).filter((a) => a.userId === userId && a.type === t.key).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const wait = cooldownLeft(t, last?.createdAt);
    if (wait) return `Du kannst dich für **${t.name}** erst in ${formatMinutes(wait)} erneut bewerben.`;
    return null;
  }

  /**
   * Bewerbung einreichen (DM-Fragen oder Web-Formular). `answers`: Objekt { [key]: Antwort } oder Array in Fragen-Reihenfolge.
   * Prüft alles noch einmal (Pflicht, Länge, Auswahl, Roblox, Sperre, offene Bewerbung, Wartezeit).
   */
  async submit({ guildId, typeKey, user, answers, source = 'DM', durationSec = null, joinedAt = null }) {
    const t = this.type(guildId, typeKey);
    if (!t) throw new AppError(404, 'Diese Bewerbung gibt es nicht mehr.');
    if (!t.enabled) throw new AppError(409, `Bewerbungen für ${t.name} sind derzeit geschlossen.`);
    const questions = t.questions.map(normalizeQuestion);
    const get = (q, i) => (Array.isArray(answers) ? answers[i] : answers?.[q.key]);
    const out = [];
    const grant = new Set();
    let roblox = null;
    for (const [i, q] of questions.entries()) {
      const r = checkAnswer(q, get(q, i));
      if (!r.ok) throw new AppError(400, r.error);
      let text = r.text;
      if (q.type === 'ROBLOX' && text) {
        const rb = await this.roblox.lookup(text);
        if (rb === null) throw new AppError(400, `Den Roblox-Benutzer „${text}“ gibt es nicht.`);
        if (rb) { text = `${rb.name} (ID ${rb.id})`; roblox ??= { name: rb.name, id: rb.id }; } else roblox ??= { name: text, id: null };
      }
      out.push({ key: q.key, question: q.label, answer: text || '—' });
      r.roleIds.forEach((x) => grant.add(x));
    }
    const ban = this.findBan(guildId, { userId: user.id, robloxId: roblox?.id }, t.key);
    if (ban) throw new AppError(409, this.banMessage(ban, t.name));
    const pre = this.preCheck(guildId, t.key, { userId: user.id });
    if (pre) throw new AppError(409, pre.replace(/\*\*/g, ''));
    const now = new Date().toISOString();
    const app = this.store.addApplication({
      guildId, type: t.key, typeName: t.name, status: 'OPEN', userId: user.id, userName: user.name, avatar: user.avatar ?? null,
      answers: out, grantRoleIds: [...grant], roblox, source, durationSec, joinedAt, createdAt: now, updatedAt: now,
      decidedAt: null, decidedBy: null, reason: null, notes: [], history: [{ at: now, status: 'OPEN', by: null }], message: null,
    });
    this.store.clearProgress(guildId, user.id, t.key);
    try { app.message = await this.discord.postApplication(guildId, app, t); this.store.touch(); } catch (e) { this.log.error(`Bewerbung ${app.number} konnte nicht im Team-Kanal gepostet werden:`, e.message); }
    const roles = submitRoles(t);
    if (roles.add.length || roles.remove.length) await this.discord.applyRoles(guildId, user.id, roles.add, roles.remove, `Bewerbung ${app.number}`).catch((e) => this.log.error('Rollen beim Einreichen:', e.message));
    return app;
  }

  // ---------------- Bearbeiten & Entscheiden ----------------
  get(guildId, id) {
    const a = this.store.application(id);
    if (!a || a.guildId !== guildId) throw new AppError(404, 'Bewerbung nicht gefunden.');
    return a;
  }

  /** Prüfschritte: OPEN ↔ REVIEW ↔ INTERVIEW, oder WITHDRAWN (zurückgezogen). */
  async setStatus(guildId, id, status, actor, note) {
    const a = this.get(guildId, id);
    if (!['OPEN', 'REVIEW', 'INTERVIEW', 'WITHDRAWN'].includes(status)) throw new AppError(400, 'Annehmen oder Ablehnen bitte über die Entscheidung.');
    if (!isOpen(a)) throw new AppError(409, 'Über diese Bewerbung wurde schon entschieden.');
    if (a.status === status) return a;
    a.status = status; a.updatedAt = new Date().toISOString();
    a.history.push({ at: a.updatedAt, status, by: actor, note: note || undefined });
    if (status === 'WITHDRAWN') { a.decidedAt = a.updatedAt; a.decidedBy = actor; a.reason = note || null; }
    this.store.touch();
    await this.discord.updateApplicationMessage(a, this.typeOf(a)).catch((e) => this.log.error('Nachricht aktualisieren:', e.message));
    return a;
  }

  /**
   * Annehmen/Ablehnen (Dashboard oder Discord-Button). `notifyReason`: Grund per DM an die Person schicken.
   * Synchroner Teil zuerst – so kann niemand doppelt entscheiden.
   */
  async decide(guildId, id, { status, reason = null, notifyReason = true, actor }) {
    if (status !== 'ACCEPTED' && status !== 'REJECTED') throw new AppError(400, 'Ungültige Entscheidung.');
    const a = this.get(guildId, id);
    if (!isOpen(a)) throw new AppError(409, 'Über diese Bewerbung wurde schon entschieden.');
    if (actor?.id && actor.id === a.userId) throw new AppError(403, 'Über deine eigene Bewerbung kannst du nicht entscheiden.');
    const now = new Date().toISOString();
    Object.assign(a, { status, updatedAt: now, decidedAt: now, decidedBy: actor, reason: reason || null, reasonSent: !!(reason && notifyReason) });
    a.history.push({ at: now, status, by: actor, note: reason || undefined });
    this.store.touch();

    const t = this.typeOf(a);
    const accepted = status === 'ACCEPTED';
    const guildName = await this.discord.guildName(guildId).catch(() => '');
    const text = renderText(accepted ? t.messages?.accepted ?? '' : t.messages?.denied ?? '', {
      '{applicationName}': t.name, '{number}': a.number, '{user}': actor?.id ? `<@${actor.id}>` : 'dem Team', '{applicant}': `<@${a.userId}>`,
      '{reason}': a.reasonSent ? reason : '', '{server}': guildName,
    }, true);
    const results = { dm: false, roles: null };
    try { await this.discord.sendDecisionDm(a, t, text, guildName); results.dm = true; } catch (e) { this.log.error(`DM an ${a.userId}:`, e.message); }
    const roles = decisionRoles(t, accepted, a.grantRoleIds);
    if (roles.add.length || roles.remove.length) {
      try { await this.discord.applyRoles(guildId, a.userId, roles.add, roles.remove, `Bewerbung ${a.number} ${accepted ? 'angenommen' : 'abgelehnt'}`); results.roles = 'ok'; } catch (e) { results.roles = e.message; this.log.error('Rollen bei Entscheidung:', e.message); }
    }
    // Nachricht im Team-Kanal aktualisieren – gibt es keine, in den Kanal für angenommene/abgelehnte posten
    const archive = accepted ? t.channels?.accepted : t.channels?.denied;
    const updated = await this.discord.updateApplicationMessage(a, t).then(() => !!a.message, () => false);
    if (archive && (!updated || a.message?.channelId !== archive)) await this.discord.postArchive(archive, a, t).catch((e) => this.log.error('Archiv-Kanal:', e.message));
    return { application: a, ...results };
  }

  addNote(guildId, id, actor, text) {
    const a = this.get(guildId, id);
    const t = String(text ?? '').trim().slice(0, 1000);
    if (!t) throw new AppError(400, 'Notiz ist leer.');
    a.notes.push({ at: new Date().toISOString(), by: actor, text: t });
    this.store.touch();
    return a;
  }

  remove(guildId, id) { this.get(guildId, id); this.store.removeApplication(id); }

  history(guildId, userId) { return this.store.applications(guildId).filter((a) => a.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

  async openTicket(guildId, id, requesterId) {
    const a = this.get(guildId, id);
    return this.discord.createTicket(guildId, a, requesterId, this.store.guild(guildId).tickets);
  }

  /** „Aktion beim Verlassen“ je Bewerbungsart. */
  async memberLeft(guildId, userId) {
    let denied = 0, withdrawn = 0;
    for (const a of this.store.applications(guildId).filter((x) => x.userId === userId && isOpen(x))) {
      const action = this.type(guildId, a.type)?.onLeave ?? 'NONE';
      const actor = { id: null, name: 'Automatisch' };
      if (action === 'DENY') await this.decide(guildId, a.id, { status: 'REJECTED', reason: LEFT_REASON, notifyReason: false, actor }).then(() => denied++, () => undefined);
      else if (action === 'WITHDRAW') await this.setStatus(guildId, a.id, 'WITHDRAWN', actor, LEFT_REASON).then(() => withdrawn++, () => undefined);
    }
    this.store.clearProgress(guildId, userId);
    return { denied, withdrawn };
  }
}
