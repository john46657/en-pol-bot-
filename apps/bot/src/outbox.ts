import type { Api } from './api';
import type { TicketEffect } from '@enrp/shared';
import { cadButtons, renderCadOutbox } from './commands/cad';
import { applicationDecisionText, leaveDirectEmbed, outboxButtons, qualificationDecisionText, renderOutboxEmbeds, type ButtonSpec, type EmbedData } from './format';

interface OutboxItem { id: string; type: string; channelKey: string; payload: Record<string, unknown> }
/** `opts`: Rollen, die erwähnt werden (z. B. neue Bewerbung → @Staffelkommandant), und Discord-Benutzer für das Profilbild rechts. */
/** `authorUserId`: Kopfzeile „@Benutzer“ mit Profilbild (z. B. Abmeldeantrag, wie bei Trident). */
export type Sender = (channelId: string, embeds: EmbedData[], buttons?: ButtonSpec[], opts?: { pingRoleIds?: string[]; avatarUserId?: string; thread?: string; authorUserId?: string; replaceKey?: string }) => Promise<void>;
/** Discord-Rollen eines Mitglieds anpassen (alle Server, auf denen es die Rollen gibt). */
export type RoleSync = (userId: string, add: string[], remove: string[]) => Promise<void>;
/** Welche Discord-Rolle zu welchem Dienststatus gehört (Einstellungen → Discord). */
export function dutyRoleChanges(status: string, cfg: Record<string, string | undefined>): { add: string[]; remove: string[] } {
  // je Status mehrere Rollen-IDs möglich (eine pro Discord-Server), Komma-getrennt
  const ids = (v?: string) => (v ?? '').split(/[\s,;]+/).filter((r) => /^\d{15,25}$/.test(r));
  const map: Record<string, string[]> = { ON_DUTY: ids(cfg.dutyRole), BREAK: ids(cfg.breakRole), TRAINING: ids(cfg.trainingRole), ADMINISTRATIVE: ids(cfg.adminDutyRole) };
  const add = map[status] ?? [];
  const all = [...new Set(Object.values(map).flat())];
  return { add: [...new Set(add)], remove: all.filter((r) => !add.includes(r)) };
}
/** Vergibt eine Discord-Rolle auf allen Servern, auf denen es sie gibt (z. B. nach angenommener Bewerbung). */
export type RoleGranter = (userId: string, roleId: string) => Promise<void>;
/** Direktnachricht: Text oder ein Embed. */
export type DirectSender = (userId: string, msg: string | EmbedData) => Promise<void>;
/** Benachrichtigungen, die per Direktnachricht an eine Person gehen statt in einen Channel. */
const DIRECT: Record<string, (p: Record<string, unknown>) => string | EmbedData> = {
  'application.decided': applicationDecisionText, 'qualification.decided': qualificationDecisionText,
  'leave.decided': (p) => leaveDirectEmbed('leave.decided', p), 'leave.pending': (p) => leaveDirectEmbed('leave.pending', p),
};

/**
 * Holt offene Benachrichtigungen aus der System-API, postet sie und quittiert.
 * Fehlgeschlagene Sendungen werden gemeldet (die API zählt Versuche und gibt nach 5 Fehlversuchen auf).
 */
export async function pollOnce(api: Api, send: Sender, log: (m: string) => void = console.log, dm?: DirectSender, grantRole?: RoleGranter, syncRoles?: RoleSync, onDutyChanged?: () => void, ticketEffects?: (effects: TicketEffect[]) => Promise<void>, onMembersSync?: () => void): Promise<number> {
  const [channels, items] = await Promise.all([api.service<Record<string, string | undefined>>('GET', '/bot/config'), api.service<OutboxItem[]>('GET', '/bot/outbox?limit=20')]);
  let sent = 0;
  for (const item of items) {
    const direct = DIRECT[item.type];
    if (direct) {
      try {
        const userId = String(item.payload.discordId ?? '');
        if (!/^\d{15,25}$/.test(userId)) throw new Error('no Discord user id');
        // Rolle zuerst (wichtiger als die Nachricht; erneutes Vergeben bei Wiederholung schadet nicht)
        // Rollen aus der Entscheidung (Annahme-/Ablehnungs-Rollen, Rolle der Einheit, Rollen-Auswahl); `roleId` = ältere Einträge (nur bei Annahme)
        const ids = (v: unknown) => (Array.isArray(v) ? v : []).map((r) => String(r ?? '')).filter((r) => /^\d{15,25}$/.test(r));
        const roleIds = [...new Set([...(item.payload.status === 'ACCEPTED' ? ids([item.payload.roleId]) : []), ...ids(item.payload.roleIds)])];
        if (grantRole) for (const roleId of roleIds) await grantRole(userId, roleId).catch((e) => log(`outbox ${item.id}: role ${roleId} could not be given: ${e instanceof Error ? e.message : e}`));
        const remove = ids(item.payload.removeRoleIds);
        if (remove.length && syncRoles) await syncRoles(userId, [], remove).catch((e) => log(`outbox ${item.id}: roles could not be removed: ${e instanceof Error ? e.message : e}`));
        if (!dm) throw new Error('direct messages not available');
        await dm(userId, direct(item.payload));
        await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true });
        sent++;
      } catch (e) {
        // z. B. Nutzer hat DMs deaktiviert oder den Server verlassen
        const msg = e instanceof Error ? e.message : 'send failed';
        log(`outbox ${item.id} (${item.type}) direct message failed: ${msg}`);
        await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
      }
      continue;
    }
    // pro Art dürfen mehrere Channel-IDs (Komma-getrennt, auch auf mehreren Servern) hinterlegt sein
    // Support-Tickets: Discord-Änderungen aus dem Dashboard/der Automatik ausführen
    if (item.type === 'ticket.effects') {
      if (!ticketEffects) { await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: 'tickets not available' }).catch(() => undefined); continue; }
      try {
        await ticketEffects((item.payload.effects as TicketEffect[]) ?? []);
        await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined);
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'ticket effects failed';
        log(`outbox ${item.id} (${item.type}) failed: ${msg}`);
        await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
      }
      continue;
    }
    // „Jetzt aktualisieren“ in der Teamliste: Teammitglieder und Voice sofort neu melden
    if (item.type === 'members.sync') {
      onMembersSync?.();
      await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined);
      sent++;
      continue;
    }
    // Rollen eines Mitglieds ändern (z. B. „ausstehend“-Rollen beim Einreichen einer Bewerbung)
    if (item.type === 'member.roles') {
      const userId = String(item.payload.discordId ?? '');
      const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(String).filter((r) => /^\d{15,25}$/.test(r));
      try {
        if (!syncRoles || !/^\d{15,25}$/.test(userId)) throw new Error('roles not available');
        await syncRoles(userId, ids(item.payload.add), ids(item.payload.remove));
        await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined);
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'roles failed';
        log(`outbox ${item.id} (member.roles) failed: ${msg}`);
        await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
      }
      continue;
    }
    // Dienststatus: zuerst die Dienst-Rollen abgleichen; ohne Dienst-Channel ist der Eintrag damit erledigt
    if (item.type === 'duty.changed') {
      onDutyChanged?.(); // z. B. Teamliste sofort neu zeichnen
      const userId = String(item.payload.discordId ?? '');
      if (syncRoles && /^\d{15,25}$/.test(userId)) {
        // Schichten-Modul: Rollen kommen fertig aus der API (Schicht-/Pausen-Rolle der Schicht-Art)
        const given = item.payload.roles as { add?: unknown; remove?: unknown } | undefined;
        const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(String).filter((r) => /^\d{15,25}$/.test(r));
        const { add, remove } = given ? { add: ids(given.add), remove: ids(given.remove) } : dutyRoleChanges(String(item.payload.status), channels);
        if (add.length || remove.length) await syncRoles(userId, add, remove).catch((e) => log(`outbox ${item.id}: duty roles could not be updated: ${e instanceof Error ? e.message : e}`));
      }
      const ownLog = typeof item.payload.channelId === 'string' && /^\d{15,25}$/.test(item.payload.channelId);
      if (!channels.duty && !ownLog) { await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined); sent++; continue; }
    }
    // eigener Channel im Eintrag (z. B. Bewerbungen einer Einheit) hat Vorrang
    const own = typeof item.payload.channelId === 'string' && /^\d{15,25}$/.test(item.payload.channelId) ? item.payload.channelId : null;
    // CAD: Zielkanäle kommen fertig aus der API (Kanalzuordnungen + Server-Verbindungen)
    const many = Array.isArray(item.payload.channelIds) ? item.payload.channelIds.map(String).filter((c) => /^\d{15,25}$/.test(c)) : null;
    const channelIds = own ? [own] : many ?? (channels[item.channelKey] ?? '').split(/[\s,;]+/).filter(Boolean);
    const cad = item.type.startsWith('cad.') ? renderCadOutbox(item.type, item.payload) : null;
    const embeds = item.type.startsWith('cad.') ? (cad ? [cad] : null) : renderOutboxEmbeds(item.type, item.payload);
    try {
      if (!channelIds.length) throw new Error(`channel "${item.channelKey}" not configured`);
      if (!embeds) throw new Error(`unknown type "${item.type}"`);
      const buttons = item.type.startsWith('cad.') ? cadButtons(item.type, item.payload) : outboxButtons(item.type, item.payload);
      const pingRoleIds = Array.isArray(item.payload.pingRoleIds) ? item.payload.pingRoleIds.map(String).filter((r) => /^\d{15,25}$/.test(r)) : [];
      const avatarUserId = /\.(submitted|archived)$/.test(item.type) && /^(qualification|application)\./.test(item.type) && typeof item.payload.discordId === 'string' && /^\d{15,25}$/.test(item.payload.discordId) ? item.payload.discordId : undefined;
      // Staff-Thread je Bewerbung (wie bei Appy)
      const thread = item.payload.thread === true && /\.submitted$/.test(item.type) ? `Bewerbung ${String(item.payload.number ?? '')}`.slice(0, 100) : undefined;
      const authorUserId = item.type === 'leave.requested' && typeof item.payload.discordId === 'string' && /^\d{15,25}$/.test(item.payload.discordId) ? item.payload.discordId : undefined;
      // Gefahrenstatus: vorherige Meldung im Kanal löschen, damit nur der aktuelle Status dort steht
      const replaceKey = item.type === 'danger.changed' ? 'danger' : undefined;
      const opts = pingRoleIds.length || avatarUserId || thread || authorUserId || replaceKey ? { ...(pingRoleIds.length ? { pingRoleIds } : {}), ...(avatarUserId ? { avatarUserId } : {}), ...(thread ? { thread } : {}), ...(authorUserId ? { authorUserId } : {}), ...(replaceKey ? { replaceKey } : {}) } : undefined;
      const results = await Promise.allSettled(channelIds.map((id) => (opts ? send(id, embeds, buttons, opts) : send(id, embeds, buttons))));
      const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${channelIds[i]}: ${r.reason instanceof Error ? r.reason.message : r.reason}`] : []));
      failed.forEach((f) => log(`outbox ${item.id}: send failed for channel ${f}`));
      // Erfolg, wenn mindestens ein Channel erreicht wurde (sonst Wiederholung – würde die erfolgreichen doppelt beliefern)
      if (failed.length === channelIds.length) throw new Error(failed[0]);
      await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true });
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'send failed';
      log(`outbox ${item.id} (${item.type}) failed: ${msg}`);
      await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
    }
  }
  return sent;
}

/** Läuft dauerhaft; überlappende Durchläufe werden vermieden, Fehler (z. B. API kurz down) beenden die Schleife nicht. */
export function startOutboxLoop(api: Api, send: Sender, seconds: number, log: (m: string) => void = console.log, dm?: DirectSender, grantRole?: RoleGranter, syncRoles?: RoleSync, onDutyChanged?: () => void, ticketEffects?: (effects: TicketEffect[]) => Promise<void>, onMembersSync?: () => void) {
  let running = false;
  let lastError: string | undefined;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce(api, send, log, dm, grantRole, syncRoles, onDutyChanged, ticketEffects, onMembersSync);
      if (lastError) { log('outbox: connection to the API restored'); lastError = undefined; }
    } catch (e) {
      // Nur bei neuer/anderer Störung loggen – nicht alle 5 Sekunden dieselbe Zeile
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== lastError) { log(`outbox poll failed: ${msg} (will keep retrying quietly)`); lastError = msg; }
    } finally { running = false; }
  };
  const timer = setInterval(() => void tick(), seconds * 1000);
  void tick();
  return () => clearInterval(timer);
}
