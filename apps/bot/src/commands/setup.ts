import { PermissionFlagsBits } from 'discord.js';
import { renderWelcomeText } from '@enrp/shared';
import { guard } from '../access';
import { brand, toneColor } from '../branding';
import { errorReply, plain, type ButtonSpec, type EmbedData, type Reply, type SelectSpec } from '../format';
import { ACCESS_LEVELS, CHANNEL_LABEL, ConfigConflictError, ConfigValidationError, LEVEL_LABEL, SETUP_CHANNELS, TOGGLE_MODULES, SECTION_SCHEMAS, type AccessLevel, type GuildConfig, type GuildConfigPatch, type SetupChannel } from '../guild-config';
import type { CommandDef, Ctx, InteractionDef } from './types';

/**
 * /setup – geführte Einrichtung des Bots je Discord-Server (nur Serveradministratoren).
 * Alles läuft über Discord: Buttons, Auswahlmenüs (Kanäle, Rollen, Module), Formulare (Modals) und eine Vorschau als Embed.
 * Einstellungen werden sofort dauerhaft gespeichert und können jederzeit wieder bearbeitet werden.
 */
type Step = 'general' | 'colors' | 'welcome' | 'channels' | 'roles' | 'modules';
const STEPS: { key: Step; label: string; emoji: string }[] = [
  { key: 'general', label: 'Allgemein', emoji: '🏷️' }, { key: 'colors', label: 'Farben', emoji: '🎨' }, { key: 'welcome', label: 'Begrüßung', emoji: '👋' },
  { key: 'channels', label: 'Kanäle', emoji: '#️⃣' }, { key: 'roles', label: 'Rollen', emoji: '🛡️' }, { key: 'modules', label: 'Module', emoji: '🧩' },
];

const DEFAULT_COLORS = { primary: '#3b82f6', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' } as const;
const CHANNEL_NEEDS = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks;

/** Ist ein Schritt schon eingerichtet? (für die Checkliste) */
function stepDone(cfg: GuildConfig, s: Step): boolean {
  switch (s) {
    case 'general': return !!(cfg.branding.serverName || cfg.branding.displayName || cfg.branding.logoUrl);
    case 'colors': return cfg.setupDone || cfg.branding.applyToAll || (Object.keys(DEFAULT_COLORS) as (keyof typeof DEFAULT_COLORS)[]).some((k) => cfg.colors[k].toLowerCase() !== DEFAULT_COLORS[k]);
    case 'welcome': return cfg.welcome.enabled || cfg.welcome.goodbyeEnabled;
    case 'channels': return SETUP_CHANNELS.some((k) => !!cfg.channels[k]);
    case 'roles': return ACCESS_LEVELS.some((l) => cfg.roles[l].length > 0);
    case 'modules': return cfg.setupDone || cfg.modules.disabled.length > 0;
  }
}

const ch = (id: string | null) => (id ? `<#${id}>` : '—');
const roles = (ids: string[]) => (ids.length ? ids.map((r) => `<@&${r}>`).join(' ') : '—');
const on = (b: boolean) => (b ? 'an' : 'aus');

/** Übersicht mit Checkliste und Navigation. */
export function homePanel(cfg: GuildConfig, note?: string): Reply {
  const next = STEPS.find((s) => !stepDone(cfg, s.key));
  const embed: EmbedData = brand(cfg, {
    title: '⚙️ Einrichtung dieses Servers',
    description: [
      note ? `${note}\n` : '',
      'Richte den Bot Schritt für Schritt ein. Jede Änderung wird **sofort dauerhaft gespeichert** und kann jederzeit wieder geändert werden.',
      '',
      ...STEPS.map((s, i) => `${stepDone(cfg, s.key) ? '✅' : '⬜'} **${i + 1}. ${s.label}**`),
      '',
      next ? `➡️ Nächster Schritt: **${next.label}**` : cfg.setupDone ? '🎉 Einrichtung abgeschlossen.' : '👍 Alles eingerichtet – mit **Fertig** abschließen.',
    ].join('\n'),
    fields: [
      { name: 'Servername / Anzeigename', value: `${plain(cfg.branding.serverName ?? '—')} / ${plain(cfg.branding.displayName ?? '—')}`, inline: true },
      { name: 'Farben', value: `${cfg.colors.primary} · ${cfg.colors.success} · ${cfg.colors.warning} · ${cfg.colors.danger}${cfg.branding.applyToAll ? ' (alle Antworten)' : ''}`, inline: true },
      { name: 'Begrüßung / Abschied', value: `${on(cfg.welcome.enabled)} / ${on(cfg.welcome.goodbyeEnabled)}`, inline: true },
      { name: 'Kanäle', value: SETUP_CHANNELS.map((k) => `${CHANNEL_LABEL[k]}: ${ch(cfg.channels[k])}`).join('\n') },
      { name: 'Rollen', value: ACCESS_LEVELS.map((l) => `${LEVEL_LABEL[l]}: ${roles(cfg.roles[l])}`).join('\n').slice(0, 1024) },
      { name: 'Module im Bot ausgeblendet', value: cfg.modules.disabled.length ? cfg.modules.disabled.map((k) => TOGGLE_MODULES.find((m) => m.key === k)?.name ?? k).join(', ') : 'keine' },
    ],
    ...(cfg.branding.logoUrl ? { thumbnail: cfg.branding.logoUrl } : {}),
  });
  const buttons: ButtonSpec[] = [
    ...STEPS.map((s): ButtonSpec => ({ id: s.key === 'general' || s.key === 'colors' || s.key === 'welcome' ? `setup:modal:${s.key}` : `setup:page:${s.key}`, label: s.label, emoji: s.emoji, style: next?.key === s.key ? 'primary' : 'secondary' })),
    { id: 'setup:preview', label: 'Vorschau', emoji: '👁️', style: 'secondary' },
    { id: 'setup:done', label: 'Fertig', emoji: '✔️', style: 'success' },
  ];
  return { ephemeral: true, panel: true, embeds: [embed], buttons };
}

const back: ButtonSpec = { id: 'setup:page:home', label: 'Zurück zur Übersicht', emoji: '↩️', style: 'secondary' };

function channelsPanel(cfg: GuildConfig): Reply {
  const selects: SelectSpec[] = SETUP_CHANNELS.map((k) => ({ id: `setup:ch:${k}`, placeholder: `${CHANNEL_LABEL[k]} – Kanal wählen (leer = keiner)`, options: [], kind: 'channel', min: 0, max: 1, defaults: cfg.channels[k] ? [cfg.channels[k]!] : [] }));
  return { ephemeral: true, panel: true, embeds: [brand(cfg, { title: '#️⃣ Kanäle', description: 'Wähle je Zweck einen Textkanal. Abwählen entfernt die Zuordnung (der Kanal selbst bleibt unberührt).\n\n' + SETUP_CHANNELS.map((k) => `**${CHANNEL_LABEL[k]}:** ${ch(cfg.channels[k])}`).join('\n') })], selects, buttons: [back] };
}

function rolesPanel(cfg: GuildConfig, level?: AccessLevel): Reply {
  const pick: SelectSpec = { id: 'setup:lvl', placeholder: 'Stufe wählen …', options: ACCESS_LEVELS.map((l) => ({ label: LEVEL_LABEL[l], value: l, description: `${cfg.roles[l].length} Rolle(n) zugeordnet` })), ...(level ? { defaults: [level] } : {}) };
  const selects: SelectSpec[] = [pick];
  if (level) selects.push({ id: `setup:role:${level}`, placeholder: `Discord-Rollen für „${LEVEL_LABEL[level]}“ (bis zu 10)`, options: [], kind: 'role', min: 0, max: 10, defaults: cfg.roles[level] });
  const desc = [
    'Ordne jeder Stufe Discord-Rollen zu. Geprüft werden immer die **tatsächlichen Rollen** des Mitglieds – frisch von Discord.',
    'Wer „Server verwalten“ oder „Administrator“ hat, ist immer Serveradministrator. Höhere Stufen dürfen alles, was niedrigere dürfen.',
    'Solange keine Rolle zugeordnet ist, dürfen Verwaltungsbefehle nur Mitglieder mit „Server verwalten“.',
    '',
    ...ACCESS_LEVELS.map((l) => `**${LEVEL_LABEL[l]}:** ${roles(cfg.roles[l])}`),
  ].join('\n');
  return { ephemeral: true, panel: true, embeds: [brand(cfg, { title: '🛡️ Rollen & Stufen', description: desc })], selects, buttons: [back] };
}

function modulesPanel(cfg: GuildConfig, systemOff: string[]): Reply {
  const select: SelectSpec = {
    id: 'setup:mods', placeholder: 'Aktive Module auswählen …', min: 0, max: TOGGLE_MODULES.length,
    options: TOGGLE_MODULES.map((m) => ({ label: m.name, value: m.key, ...(systemOff.includes(m.key) ? { description: 'im System (Dashboard) ausgeschaltet' } : {}) })),
    defaults: TOGGLE_MODULES.filter((m) => !cfg.modules.disabled.includes(m.key)).map((m) => m.key),
  };
  const desc = [
    'Ausgewählte Module sind aktiv. Abgewählte Module werden im Bot **nur ausgeblendet**: ihre Befehle verschwinden auf diesem Server, **alle Daten bleiben erhalten** und kommen beim Wiedereinschalten zurück.',
    systemOff.length ? `\nIm System (Dashboard) ausgeschaltet und daher ohnehin ausgeblendet: ${systemOff.map((k) => TOGGLE_MODULES.find((m) => m.key === k)?.name ?? k).join(', ')}.` : '',
    '',
    ...TOGGLE_MODULES.map((m) => `${cfg.modules.disabled.includes(m.key) || systemOff.includes(m.key) ? '⬜' : '✅'} ${m.name}`),
  ].join('\n');
  return { ephemeral: true, panel: true, embeds: [brand(cfg, { title: '🧩 Module', description: desc })], selects: [select], buttons: [back] };
}

/** Vorschau: so sehen Bot-Nachrichten und Begrüßung mit den aktuellen Einstellungen aus. */
export function previewReply(cfg: GuildConfig, who: { id: string; name: string; server: string; memberCount: number }): Reply {
  const member = { id: who.id, username: who.name, displayName: who.name, server: cfg.branding.serverName || who.server, memberCount: who.memberCount, createdAt: null };
  const embeds: EmbedData[] = [
    brand(cfg, { title: '👁️ Vorschau: Bot-Nachricht', description: 'So erscheinen Meldungen des Bots auf diesem Server (Hauptfarbe, Kopfzeile mit Anzeigename und Logo, Servername unten).', ...(cfg.branding.bannerUrl ? { image: cfg.branding.bannerUrl } : {}) }),
    brand(cfg, { title: '✅ Erfolg', description: 'Beispiel einer Erfolgsmeldung.' }, 'success'),
    brand(cfg, { title: '⚠️ Warnung', description: 'Beispiel einer Warnung.' }, 'warning'),
    brand(cfg, { title: '❌ Fehler', description: 'Beispiel einer Fehlermeldung.' }, 'danger'),
  ];
  if (cfg.welcome.enabled) embeds.push(brand(cfg, { title: renderWelcomeText(cfg.welcome.title, member).slice(0, 256) || 'Willkommen', description: renderWelcomeText(cfg.welcome.text, member).slice(0, 4000), ...(cfg.branding.bannerUrl ? { image: cfg.branding.bannerUrl } : {}), footer: `Begrüßung → ${cfg.channels.welcome ? 'Kanal eingestellt' : 'kein Kanal eingestellt'}` }));
  if (cfg.welcome.goodbyeEnabled) embeds.push(brand(cfg, { title: 'Abschied', description: renderWelcomeText(cfg.welcome.goodbyeText, member).slice(0, 4000) }, 'warning'));
  return { ephemeral: true, embeds: embeds.slice(0, 10) };
}

function modal(cfg: GuildConfig, step: 'general' | 'colors' | 'welcome'): Reply {
  if (step === 'general') return { modal: { id: 'setup:save:general', title: 'Allgemein', fields: [
    { id: 'serverName', label: 'Servername (in Bot-Nachrichten)', maxLength: 100, value: cfg.branding.serverName ?? '', placeholder: 'z. B. EN Polizei – Revier Mitte' },
    { id: 'displayName', label: 'Anzeigename des Bots (Spitzname)', maxLength: 32, value: cfg.branding.displayName ?? '', placeholder: 'leer = Name aus dem Developer Portal' },
    { id: 'logoUrl', label: 'Logo (https-Link zu einem Bild)', maxLength: 500, value: cfg.branding.logoUrl ?? '', placeholder: 'https://…/logo.png' },
    { id: 'bannerUrl', label: 'Banner (https-Link zu einem Bild)', maxLength: 500, value: cfg.branding.bannerUrl ?? '', placeholder: 'https://…/banner.png' },
  ] } };
  if (step === 'colors') return { modal: { id: 'setup:save:colors', title: 'Farben (#RRGGBB)', fields: [
    { id: 'primary', label: 'Hauptfarbe', required: true, maxLength: 7, minLength: 7, value: cfg.colors.primary },
    { id: 'success', label: 'Erfolg', required: true, maxLength: 7, minLength: 7, value: cfg.colors.success },
    { id: 'warning', label: 'Warnung', required: true, maxLength: 7, minLength: 7, value: cfg.colors.warning },
    { id: 'danger', label: 'Fehler', required: true, maxLength: 7, minLength: 7, value: cfg.colors.danger },
    { id: 'applyToAll', label: 'Auf alle Bot-Antworten anwenden? (ja/nein)', required: true, maxLength: 4, value: cfg.branding.applyToAll ? 'ja' : 'nein' },
  ] } };
  return { modal: { id: 'setup:save:welcome', title: 'Begrüßung & Abschied', fields: [
    { id: 'enabled', label: 'Begrüßung senden? (ja/nein)', required: true, maxLength: 4, value: cfg.welcome.enabled ? 'ja' : 'nein' },
    { id: 'title', label: 'Titel der Begrüßung', maxLength: 256, value: cfg.welcome.title },
    { id: 'text', label: 'Text ({user} {server} {memberCount} {displayName})', paragraph: true, maxLength: 2000, value: cfg.welcome.text },
    { id: 'goodbyeEnabled', label: 'Abschied senden? (ja/nein)', required: true, maxLength: 4, value: cfg.welcome.goodbyeEnabled ? 'ja' : 'nein' },
    { id: 'goodbyeText', label: 'Text beim Verlassen', paragraph: true, maxLength: 2000, value: cfg.welcome.goodbyeText },
  ] } };
}

const FIELD_LABEL: Record<string, string> = { serverName: 'Servername', displayName: 'Anzeigename', logoUrl: 'Logo', bannerUrl: 'Banner', primary: 'Hauptfarbe', success: 'Erfolg', warning: 'Warnung', danger: 'Fehler', title: 'Titel', text: 'Text', goodbyeText: 'Text beim Verlassen' };
const yes = (v: string | undefined) => /^(ja|j|yes|y|an|1|true)$/i.test((v ?? '').trim());
const yesNoValid = (v: string | undefined) => /^(ja|j|yes|y|an|1|true|nein|n|no|aus|0|false)$/i.test((v ?? '').trim());
const orNull = (v: string | undefined) => (v ?? '').trim() || null;

/** Formular-Eingaben → Änderung (oder Fehlermeldung mit dem genauen Problem). */
export function patchFromModal(step: string, f: Record<string, string>): { patch?: GuildConfigPatch; error?: string } {
  let patch: GuildConfigPatch;
  if (step === 'general') patch = { branding: { serverName: orNull(f.serverName), displayName: orNull(f.displayName), logoUrl: orNull(f.logoUrl), bannerUrl: orNull(f.bannerUrl) } };
  else if (step === 'colors') {
    if (!yesNoValid(f.applyToAll)) return { error: 'Bitte bei „Auf alle Bot-Antworten anwenden?“ ja oder nein eintragen.' };
    patch = { colors: { primary: f.primary?.trim() ?? '', success: f.success?.trim() ?? '', warning: f.warning?.trim() ?? '', danger: f.danger?.trim() ?? '' }, branding: { applyToAll: yes(f.applyToAll) } };
  } else if (step === 'welcome') {
    if (!yesNoValid(f.enabled) || !yesNoValid(f.goodbyeEnabled)) return { error: 'Bitte bei „senden?“ ja oder nein eintragen.' };
    patch = { welcome: { enabled: yes(f.enabled), title: (f.title ?? '').trim() || 'Willkommen auf {server}!', text: (f.text ?? '').trim(), goodbyeEnabled: yes(f.goodbyeEnabled), goodbyeText: (f.goodbyeText ?? '').trim() } };
  } else return { error: 'Unbekannter Schritt.' };
  // Abschnitt einzeln prüfen, damit die Meldung genau sagt, was nicht stimmt
  for (const [k, v] of Object.entries(patch)) {
    const r = SECTION_SCHEMAS[k as keyof typeof SECTION_SCHEMAS].partial().safeParse(v);
    if (!r.success) { const i = r.error.issues[0]!; return { error: `Ungültige Eingabe bei „${FIELD_LABEL[String(i.path[0])] ?? String(i.path.join('.') || k)}“: ${i.message}` }; }
  }
  return { patch };
}

async function cfgOf(c: Ctx) { return c.runtime!.guildConfig.get(c.guildId!, { fresh: true }); }

async function systemModulesOff(c: Ctx): Promise<string[]> {
  const r = await c.api.service<{ disabled: string[] }>('GET', `/bot/servers/${c.guildId}/modules`).catch(() => null);
  return r?.disabled ?? [];
}

async function save(c: Ctx, patch: GuildConfigPatch): Promise<GuildConfig> {
  return c.runtime!.guildConfig.update(c.guildId!, patch, { by: c.discordId });
}

export const SETUP_COMMANDS: CommandDef[] = [{
  name: 'setup', description: 'Bot für diesen Server einrichten (Name, Logo, Farben, Begrüßung, Kanäle, Rollen, Module)',
  async run(c) {
    const denied = await guard(c, 'setup'); if (denied) return denied;
    if (!c.runtime) return errorReply('Die Einrichtung ist gerade nicht verfügbar.');
    try {
      const cfg = await cfgOf(c);
      const first = !(await c.runtime.guildConfig.exists(c.guildId!));
      return { ...homePanel(cfg, first ? '👋 Willkommen! Für diesen Server gibt es noch keine Einstellungen – wir legen sie jetzt an.' : undefined), panel: false };
    } catch { return errorReply('Die Einstellungen konnten nicht geladen werden (System nicht erreichbar?). Bitte gleich erneut versuchen – es wurde nichts geändert.'); }
  },
}];

/** setup:page:<seite> · setup:modal:<schritt> · setup:save:<schritt> (Formular) · setup:ch:<zweck> · setup:lvl · setup:role:<stufe> · setup:mods · setup:preview · setup:done */
export const SETUP_INTERACTION: InteractionDef = {
  prefix: 'setup',
  opensModal: (args) => args[0] === 'modal',
  panel: (args) => args[0] !== 'modal' && args[0] !== 'preview',
  async run(c): Promise<Reply> {
    const denied = await guard(c, `setup:${c.args[0] ?? ''}`); if (denied) return denied;
    if (!c.runtime || !c.guildId) return errorReply('Die Einrichtung ist gerade nicht verfügbar.');
    const [action, arg] = c.args;
    try {
      const cfg = await cfgOf(c);
      switch (action) {
        case 'modal': return arg === 'general' || arg === 'colors' || arg === 'welcome' ? modal(cfg, arg) : errorReply('Unbekannter Schritt.');
        case 'page':
          if (arg === 'channels') return channelsPanel(cfg);
          if (arg === 'roles') return rolesPanel(cfg);
          if (arg === 'modules') return modulesPanel(cfg, await systemModulesOff(c));
          return homePanel(cfg);
        case 'save': {
          const r = patchFromModal(arg ?? '', c.fields ?? {});
          if (r.error) return errorReply(r.error);
          const next = await save(c, r.patch!);
          let note = '💾 Gespeichert.';
          if (arg === 'general' && (cfg.branding.displayName ?? null) !== (next.branding.displayName ?? null)) {
            const problem = await c.runtime.setNickname(c.guildId, next.branding.displayName);
            note += problem ? ` ⚠️ Anzeigename nicht gesetzt: ${problem}` : ' Anzeigename des Bots aktualisiert.';
          }
          return homePanel(next, note);
        }
        case 'ch': {
          if (!SETUP_CHANNELS.includes(arg as SetupChannel)) return errorReply('Unbekannter Kanal-Zweck.');
          const id = c.values?.[0] ?? null;
          const snap = id ? await c.runtime.snapshot(c.guildId) : null;
          const chan = id ? snap?.channels.find((x) => x.id === id) : null;
          if (id && snap && !chan) return errorReply('Den Kanal gibt es auf diesem Server nicht.');
          const next = await save(c, { channels: { [arg as SetupChannel]: id } as GuildConfig['channels'] });
          const p = channelsPanel(next);
          // gleich prüfen, ob der Bot dort schreiben darf
          if (chan && (chan.perms & CHANNEL_NEEDS) !== CHANNEL_NEEDS && (chan.perms & PermissionFlagsBits.Administrator) === 0n) p.embeds![0]!.description += `\n\n⚠️ In <#${id}> fehlen dem Bot Rechte (Kanal ansehen, Nachrichten senden, Links einbetten). Details: \`/system diagnose\``;
          return p;
        }
        case 'lvl': {
          const level = c.values?.[0] as AccessLevel | undefined;
          return rolesPanel(cfg, level && ACCESS_LEVELS.includes(level) ? level : undefined);
        }
        case 'role': {
          const level = arg as AccessLevel;
          if (!ACCESS_LEVELS.includes(level)) return errorReply('Unbekannte Stufe.');
          const ids = (c.values ?? []).filter((v) => /^\d{15,25}$/.test(v) && v !== c.guildId).slice(0, 10); // @everyone ist keine Stufe
          // Schutz vor Selbstaussperrung: die eigene Admin-Stufe kommt aus „Server verwalten“ und bleibt immer erhalten
          const next = await save(c, { roles: { [level]: ids } as GuildConfig['roles'] });
          return rolesPanel(next, level);
        }
        case 'mods': {
          const keep = new Set(c.values ?? []);
          const disabled = TOGGLE_MODULES.map((m) => m.key).filter((k) => !keep.has(k));
          const next = await save(c, { modules: { disabled } });
          await c.runtime.reregister(c.guildId).catch(() => undefined);
          const p = modulesPanel(next, await systemModulesOff(c));
          p.embeds![0]!.description = `💾 Gespeichert – Befehlsliste dieses Servers wird aktualisiert (Daten der ausgeblendeten Module bleiben erhalten).\n\n${p.embeds![0]!.description}`;
          return p;
        }
        case 'preview': return previewReply(cfg, { id: c.discordId, name: c.userDisplayName ?? c.userName ?? 'Mitglied', server: cfg.branding.serverName ?? 'dieser Server', memberCount: 42 });
        case 'done': {
          const next = await save(c, { setupDone: true });
          const p = homePanel(next, '🎉 Einrichtung gespeichert. Mit `/setup` kannst du jederzeit weiter anpassen, mit `/system diagnose` prüfen, ob dem Bot Rechte fehlen.');
          p.embeds![0]!.color = toneColor(next, 'success');
          return p;
        }
        default: return errorReply('Unbekannte Aktion.');
      }
    } catch (e) {
      if (e instanceof ConfigConflictError) return errorReply(e.message);
      if (e instanceof ConfigValidationError) return errorReply(`Ungültige Eingabe (${e.message}) – es wurde nichts gespeichert.`);
      return errorReply('Speichern fehlgeschlagen (System nicht erreichbar?). Es wurde nichts geändert – bitte erneut versuchen.');
    }
  },
};
