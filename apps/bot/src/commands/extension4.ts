import { COLORS, errorReply, plain, type Reply } from '../format';
import type { CommandDef, Ctx } from './types';
import { mapError } from './errors';

interface Lookup { name: string; robloxName: string | null; rank: string | null; department: string | null; status: string; serviceNumber: string | null; callsign: string | null; joinDate: string; dutyStatus: { status: string; since: string | null }; units: { name: string; role: string; supervisor: string | null }[]; qualifications: string[] }
interface Qual { name: string; status: string; expiresAt: string | null }
interface OrgUnit { id: string; parentId: string | null; name: string; kind: string; active: boolean; leader: { name: string } | null; deputy: { name: string } | null }
interface HelpRow { slug: string; title: string; kind: string; summary: string | null }

const DUTY: Record<string, string> = { ON_DUTY: '🟢 Im Dienst', BREAK: '🟡 Pause', OFF_DUTY: '⚫ Außer Dienst' };
const ROLE: Record<string, string> = { LEADER: 'Führung', DEPUTY: 'Stellvertretung', MEMBER: 'Mitglied' };
const QSTAT: Record<string, string> = { ACTIVE: '🟢', PENDING: '🟡 zur Bestätigung', SUSPENDED: '⏸️ ruht', REVOKED: '⛔ entzogen', EXPIRED: '⌛ abgelaufen' };
const day = (iso: string | null) => (iso ? `<t:${Math.floor(Date.parse(iso) / 1000)}:d>` : '—');

/** Führungsstruktur als eingerückte Liste (Discord-Embed, höchstens ~4000 Zeichen). */
export function orgLines(units: OrgUnit[]): string[] {
  const kids = new Map<string | null, OrgUnit[]>();
  const ids = new Set(units.map((u) => u.id));
  for (const u of units) { const p = u.parentId && ids.has(u.parentId) ? u.parentId : null; kids.set(p, [...(kids.get(p) ?? []), u]); }
  const out: string[] = [];
  const walk = (p: string | null, depth: number) => {
    for (const u of kids.get(p) ?? []) {
      if (depth > 6 || out.includes(u.id)) continue;
      out.push(`${'　'.repeat(depth)}${depth ? '└ ' : ''}**${plain(u.name)}** – ${u.leader ? plain(u.leader.name) : 'ohne Leitung'}${u.deputy ? ` (Stv. ${plain(u.deputy.name)})` : ''}`);
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * Erweiterungspaket 4.0: /personal (Personalauskunft, eigene Qualifikationen), /organigramm; `/hilfe suche:` siehe helpSearch.
 * Alle Antworten sind privat (ephemeral); Rechte prüft die API mit dem verknüpften Konto – vertrauliche Vermerke gibt es hier nie.
 */
export const EXTENSION4_COMMANDS: CommandDef[] = [
  {
    name: 'personal', description: 'Personalauskunft (geschützt) oder eigene Qualifikationen',
    subcommands: [
      { name: 'akte', description: 'Dienstliche Auskunft zu einem Mitglied (nur mit Berechtigung)', options: [{ name: 'mitglied', description: 'Wer?', type: 'user', required: true }] },
      { name: 'qualifikationen', description: 'Deine eigenen Qualifikationen' },
    ],
    async run(c): Promise<Reply> {
      try {
        if (c.opts._sub === 'qualifikationen') {
          const list = await c.api.asUser<Qual[]>(c.discordId, 'GET', '/qualification-registry/mine');
          if (!list.length) return { ephemeral: true, content: 'Für dich sind noch keine Qualifikationen eingetragen.' };
          return { ephemeral: true, embeds: [{ title: '🎖️ Deine Qualifikationen', color: 0x1e40af, description: list.map((q) => `${QSTAT[q.status] ?? q.status} **${plain(q.name)}**${q.expiresAt ? ` · gültig bis ${day(q.expiresAt)}` : ''}`).join('\n').slice(0, 4000) }] };
        }
        const id = String(c.opts.mitglied ?? '');
        if (!/^\d{15,25}$/.test(id)) return errorReply('Bitte ein Mitglied wählen.');
        const p = await c.api.asUser<Lookup>(c.discordId, 'GET', `/personnel-file/lookup?discordId=${id}`);
        return { ephemeral: true, embeds: [{
          title: `🗂️ ${plain(p.name)}`, color: 0x1e40af,
          fields: [
            { name: 'Rang', value: plain(p.rank ?? '—'), inline: true }, { name: 'Abteilung', value: plain(p.department ?? '—'), inline: true }, { name: 'Dienstnummer', value: plain(p.serviceNumber ?? '—'), inline: true },
            { name: 'Personalstatus', value: plain(p.status), inline: true }, { name: 'Dienststatus', value: DUTY[p.dutyStatus.status] ?? p.dutyStatus.status, inline: true }, { name: 'Eintritt', value: day(p.joinDate), inline: true },
            { name: 'Zugehörigkeit', value: (p.units.map((u) => `${plain(u.name)} (${ROLE[u.role] ?? u.role})${u.supervisor ? ` – Führung: ${plain(u.supervisor)}` : ''}`).join('\n') || '—').slice(0, 1024) },
            { name: 'Qualifikationen (einsatzrelevant)', value: (p.qualifications.map(plain).join(', ') || '—').slice(0, 1024) },
          ],
          footer: 'Vertrauliche Personalinformationen nur im Dashboard. Abruf wird protokolliert.',
        }] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'organigramm', description: 'Führungsstruktur und Ansprechpartner anzeigen',
    async run(c): Promise<Reply> {
      try {
        const units = await c.api.asUser<OrgUnit[]>(c.discordId, 'GET', '/org/summary');
        const lines = orgLines(units);
        if (!lines.length) return { ephemeral: true, content: 'Im Organigramm ist noch nichts hinterlegt.' };
        let text = ''; let cut = 0;
        for (const l of lines) { if (text.length + l.length + 1 > 3900) { cut++; continue; } text += `${l}\n`; }
        return { ephemeral: true, embeds: [{ title: '🏛️ Organigramm', description: text, color: 0x1e3a8a, footer: cut ? `${cut} weitere Einheiten – vollständig im Dashboard` : 'Vollständig im Dashboard unter Organigramm' }] };
      } catch (e) { return mapError(e); }
    },
  },
];

/** `/hilfe suche:` – Hilfe-Center durchsuchen (ohne Suche zeigt `/hilfe` wie bisher die Befehlsübersicht). */
export async function helpSearch(c: Ctx): Promise<Reply> {
      try {
    const term = String(c.opts.suche ?? '').trim();
    const r = await c.api.asUser<{ total: number; rows: HelpRow[] }>(c.discordId, 'GET', `/help/articles${term ? `?q=${encodeURIComponent(term)}` : ''}`);
    if (!r.rows.length) return { ephemeral: true, content: term ? `Zu „${plain(term)}“ gibt es noch keinen Artikel. Bei einem technischen Problem: \`/support\` bzw. das Support-Panel nutzen.` : 'Im Hilfe-Center ist noch nichts veröffentlicht.' };
    // genau ein Treffer: Inhalt direkt zeigen
    if (r.rows.length === 1 || r.rows[0]!.title.toLowerCase() === term.toLowerCase()) {
      const a = await c.api.asUser<{ title: string; summary: string | null; body: string }>(c.discordId, 'GET', `/help/articles/${r.rows[0]!.slug}`);
      return { ephemeral: true, embeds: [{ title: `❓ ${plain(a.title)}`.slice(0, 256), description: `${a.summary ? `*${plain(a.summary)}*\n\n` : ''}${a.body}`.slice(0, 4000), color: COLORS.info, footer: 'Hilfe-Center' }] };
    }
    return { ephemeral: true, embeds: [{ title: `❓ Hilfe-Center${term ? ` – „${plain(term)}“` : ''}`.slice(0, 256), color: COLORS.info, description: r.rows.slice(0, 10).map((a) => `• **${plain(a.title)}**${a.summary ? ` – ${plain(a.summary)}` : ''}`).join('\n').slice(0, 4000), footer: `${r.total} Treffer – genauer suchen, um einen Artikel direkt zu öffnen` }] };
  } catch (e) { return mapError(e); }
}
