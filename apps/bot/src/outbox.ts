import type { Api } from './api';
import { applicationDecisionText, outboxButtons, qualificationDecisionText, renderOutboxEmbeds, type ButtonSpec, type EmbedData } from './format';

interface OutboxItem { id: string; type: string; channelKey: string; payload: Record<string, unknown> }
export type Sender = (channelId: string, embeds: EmbedData[], buttons?: ButtonSpec[]) => Promise<void>;
/** Discord-Rollen eines Mitglieds anpassen (alle Server, auf denen es die Rollen gibt). */
export type RoleSync = (userId: string, add: string[], remove: string[]) => Promise<void>;
/** Welche Discord-Rolle zu welchem Dienststatus gehört (Einstellungen → Discord). */
export function dutyRoleChanges(status: string, cfg: Record<string, string | undefined>): { add: string[]; remove: string[] } {
  const map: Record<string, string | undefined> = { ON_DUTY: cfg.dutyRole, BREAK: cfg.breakRole, TRAINING: cfg.trainingRole, ADMINISTRATIVE: cfg.adminDutyRole };
  const target = map[status];
  const all = [...new Set(Object.values(map).filter((r): r is string => !!r && /^\d{15,25}$/.test(r)))];
  return { add: target && all.includes(target) ? [target] : [], remove: all.filter((r) => r !== target) };
}
/** Vergibt eine Discord-Rolle auf allen Servern, auf denen es sie gibt (z. B. nach angenommener Bewerbung). */
export type RoleGranter = (userId: string, roleId: string) => Promise<void>;
export type DirectSender = (userId: string, text: string) => Promise<void>;
/** Benachrichtigungen, die per Direktnachricht an eine Person gehen statt in einen Channel. */
const DIRECT: Record<string, (p: Record<string, unknown>) => string> = { 'application.decided': applicationDecisionText, 'qualification.decided': qualificationDecisionText };

/**
 * Holt offene Benachrichtigungen aus der System-API, postet sie und quittiert.
 * Fehlgeschlagene Sendungen werden gemeldet (die API zählt Versuche und gibt nach 5 Fehlversuchen auf).
 */
export async function pollOnce(api: Api, send: Sender, log: (m: string) => void = console.log, dm?: DirectSender, grantRole?: RoleGranter, syncRoles?: RoleSync, onDutyChanged?: () => void): Promise<number> {
  const [channels, items] = await Promise.all([api.service<Record<string, string | undefined>>('GET', '/bot/config'), api.service<OutboxItem[]>('GET', '/bot/outbox?limit=20')]);
  let sent = 0;
  for (const item of items) {
    const direct = DIRECT[item.type];
    if (direct) {
      try {
        const userId = String(item.payload.discordId ?? '');
        if (!/^\d{15,25}$/.test(userId)) throw new Error('no Discord user id');
        // Rolle zuerst (wichtiger als die Nachricht; erneutes Vergeben bei Wiederholung schadet nicht)
        const roleId = String(item.payload.roleId ?? '');
        if (item.payload.status === 'ACCEPTED' && /^\d{15,25}$/.test(roleId) && grantRole) {
          await grantRole(userId, roleId).catch((e) => log(`outbox ${item.id}: role ${roleId} could not be given: ${e instanceof Error ? e.message : e}`));
        }
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
    // Dienststatus: zuerst die Dienst-Rollen abgleichen; ohne Dienst-Channel ist der Eintrag damit erledigt
    if (item.type === 'duty.changed') {
      onDutyChanged?.(); // z. B. Teamliste sofort neu zeichnen
      const userId = String(item.payload.discordId ?? '');
      if (syncRoles && /^\d{15,25}$/.test(userId)) {
        const { add, remove } = dutyRoleChanges(String(item.payload.status), channels);
        if (add.length || remove.length) await syncRoles(userId, add, remove).catch((e) => log(`outbox ${item.id}: duty roles could not be updated: ${e instanceof Error ? e.message : e}`));
      }
      if (!channels.duty) { await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined); sent++; continue; }
    }
    // eigener Channel im Eintrag (z. B. Bewerbungen einer Einheit) hat Vorrang
    const own = typeof item.payload.channelId === 'string' && /^\d{15,25}$/.test(item.payload.channelId) ? item.payload.channelId : null;
    const channelIds = own ? [own] : (channels[item.channelKey] ?? '').split(/[\s,;]+/).filter(Boolean);
    const embeds = renderOutboxEmbeds(item.type, item.payload);
    try {
      if (!channelIds.length) throw new Error(`channel "${item.channelKey}" not configured`);
      if (!embeds) throw new Error(`unknown type "${item.type}"`);
      const buttons = outboxButtons(item.type, item.payload);
      const results = await Promise.allSettled(channelIds.map((id) => send(id, embeds, buttons)));
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
export function startOutboxLoop(api: Api, send: Sender, seconds: number, log: (m: string) => void = console.log, dm?: DirectSender, grantRole?: RoleGranter, syncRoles?: RoleSync, onDutyChanged?: () => void) {
  let running = false;
  let lastError: string | undefined;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce(api, send, log, dm, grantRole, syncRoles, onDutyChanged);
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
