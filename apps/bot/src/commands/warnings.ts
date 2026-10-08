import { okReply, type Reply } from '../format';
import type { CommandDef } from './types';
import { mapError } from './errors';

/** /verwarnen: Verwarnung in die Personalakte – Meldung im Verwarnungs-Kanal, DM und Folgen bei der Grenze macht das System. */
export const WARNING_COMMANDS: CommandDef[] = [{
  name: 'verwarnen', description: 'Teammitglied verwarnen (landet in der Personalakte)',
  options: [
    { name: 'mitglied', description: 'Wer wird verwarnt?', type: 'user', required: true },
    { name: 'grund', description: 'Grund, z. B. „Shift Abuse“', type: 'string', required: true, maxLength: 300 },
    { name: 'schweregrad', description: 'Standard: Verwarnung', type: 'string', choices: [{ name: 'Verwarnung', value: 'WARNING' }, { name: 'Abmahnung', value: 'REPRIMAND' }, { name: 'Schwerwiegender Verstoß', value: 'SEVERE' }] },
  ],
  async run(c): Promise<Reply> {
    try {
      const r = await c.api.asUser<{ count: number; limit: number }>(c.discordId, 'POST', '/hr/warnings/discord', { discordId: String(c.opts.mitglied ?? ''), reason: String(c.opts.grund ?? '').trim(), ...(c.opts.schweregrad ? { severity: String(c.opts.schweregrad) } : {}) });
      return okReply(`<@${c.opts.mitglied}> wurde verwarnt – **${r.count}/${r.limit}**${r.count >= r.limit ? ' ⛔ Grenze erreicht.' : '.'}`);
    } catch (e) { return mapError(e); }
  },
}];
