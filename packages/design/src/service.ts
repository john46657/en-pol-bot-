import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';
import {
  DEFAULT_CONFIG,
  changedPaths,
  findIssues,
  mergeDeep,
  normalizeConfig,
  pruneToModel,
  resolveConfig,
  summarizeChange,
  type DesignConfig,
} from './config.js';
import { DEFAULT_THEME_NAME, PRESETS } from './presets.js';

type Json = Prisma.InputJsonValue;
const asJson = (v: unknown) => v as Json;

export class DesignError extends Error {
  constructor(
    public readonly code: 'invalid' | 'not-found' | 'conflict',
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'DesignError';
  }
}

export const MAX_THEMES = 30;
export const MAX_VERSIONS_KEPT = 100;
export const THEME_FORMAT = 'nexus-theme';
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function audit(
  guildId: string,
  actorId: string,
  action: string,
  themeId: string | null,
  summary: string,
  extra: Record<string, unknown> = {},
) {
  await auditRepository.createRaw({
    data: {
      guildId,
      actorType: 'USER',
      actorId,
      action,
      resourceType: 'DashboardTheme',
      resourceId: themeId ?? guildId,
      after: asJson({ summary, ...extra }),
      permission: 'design.edit',
      result: 'success',
    },
  });
}

/** Legt Einstellungen und die mitgelieferten Themes an, falls der Server noch keine hat (idempotent). */
export async function ensureDefaults(guildId: string) {
  const gid = assertGuildId(guildId);
  let settings = await prisma.dashboardSettings.findUnique({ where: { guildId: gid } });
  if (settings) return settings;
  const exists = await prisma.guild.findUnique({ where: { id: gid }, select: { id: true } });
  if (!exists) throw new DesignError('not-found', 'Server nicht gefunden.');
  await prisma.$transaction(async (tx) => {
    // Gleichzeitige erste Aufrufe (Dashboard fragt mehrere Endpunkte parallel) nacheinander abarbeiten
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'design:' + gid}))`;
    if (
      await tx.dashboardSettings.findUnique({ where: { guildId: gid }, select: { guildId: true } })
    )
      return;
    const created: Record<string, string> = {};
    for (const p of PRESETS) {
      const t = await tx.dashboardTheme.create({
        data: {
          guildId: gid,
          name: p.name,
          description: p.description,
          config: asJson(p.config),
          builtin: true,
          versions: {
            create: {
              version: 1,
              config: asJson(p.config),
              changeSummary: 'Mitgelieferte Vorlage',
            },
          },
        },
      });
      created[p.name] = t.id;
    }
    await tx.dashboardSettings.create({
      data: { guildId: gid, activeThemeId: created[DEFAULT_THEME_NAME] ?? null },
    });
  });
  settings = await prisma.dashboardSettings.findUniqueOrThrow({ where: { guildId: gid } });
  return settings;
}

/**
 * Wirksame Konfiguration eines Servers. Fallback-Kette (Spezifikation 47): Theme + Überschreibungen →
 * zuletzt fehlerfreie Konfiguration → Standard. Wirft nur, wenn der Server nicht existiert.
 */
export async function getEffective(guildId: string): Promise<{
  config: DesignConfig;
  themeId: string | null;
  themeName: string;
  source: 'theme' | 'last-good' | 'default';
}> {
  try {
    const settings = await ensureDefaults(guildId);
    const theme = settings.activeThemeId
      ? await prisma.dashboardTheme.findFirst({
          where: { id: settings.activeThemeId, guildId: settings.guildId },
        })
      : null;
    if (
      theme &&
      findIssues(theme.config).length === 0 &&
      findIssues(settings.overrides).length === 0
    ) {
      const config = resolveConfig(theme.config, settings.overrides);
      const settled = JSON.stringify(config);
      if (JSON.stringify(settings.lastGood) !== settled)
        await prisma.dashboardSettings.update({
          where: { guildId: settings.guildId },
          data: { lastGood: asJson(config) },
        });
      return { config, themeId: theme.id, themeName: theme.name, source: 'theme' };
    }
    if (settings.lastGood)
      return {
        config: normalizeConfig(settings.lastGood),
        themeId: theme?.id ?? null,
        themeName: theme?.name ?? '',
        source: 'last-good',
      };
  } catch (e) {
    if (e instanceof DesignError) throw e;
  }
  return {
    config: DEFAULT_CONFIG,
    themeId: null,
    themeName: DEFAULT_THEME_NAME,
    source: 'default',
  };
}

export async function getDesign(guildId: string) {
  const settings = await ensureDefaults(guildId);
  const themes = await prisma.dashboardTheme.findMany({
    where: { guildId: settings.guildId },
    orderBy: [{ builtin: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      version: true,
      builtin: true,
      updatedAt: true,
    },
  });
  const effective = await getEffective(guildId);
  return {
    activeThemeId: settings.activeThemeId,
    autosave: settings.autosave,
    overrides: settings.overrides,
    themes,
    effective,
  };
}

async function themeOf(guildId: string, themeId: string) {
  const t = await prisma.dashboardTheme.findFirst({
    where: { id: themeId, guildId: assertGuildId(guildId) },
  }); // Servertrennung: nur eigene Themes
  if (!t) throw new DesignError('not-found', 'Theme nicht gefunden.');
  return t;
}
export const getTheme = themeOf;

function validName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim() : '';
  if (n.length < 2 || n.length > 60)
    throw new DesignError('invalid', 'Der Theme-Name muss 2–60 Zeichen lang sein.');
  return n;
}
async function assertFreeName(guildId: string, name: string, exceptId?: string) {
  const all = await prisma.dashboardTheme.findMany({
    where: { guildId },
    select: { id: true, name: true },
  });
  if (all.some((t) => t.id !== exceptId && sameName(t.name, name)))
    throw new DesignError('conflict', 'Ein Theme mit diesem Namen existiert schon.');
  if (!exceptId && all.length >= MAX_THEMES)
    throw new DesignError('conflict', `Mehr als ${MAX_THEMES} Themes sind nicht möglich.`);
}
function checkConfig(raw: unknown): DesignConfig {
  const issues = findIssues(raw);
  if (issues.length > 0)
    throw new DesignError('invalid', 'Die Einstellungen enthalten ungültige Werte.', issues);
  return normalizeConfig(pruneToModel(raw));
}
async function pruneVersions(themeId: string) {
  const old = await prisma.dashboardThemeVersion.findMany({
    where: { themeId },
    orderBy: { version: 'desc' },
    skip: MAX_VERSIONS_KEPT,
    select: { id: true },
  });
  if (old.length)
    await prisma.dashboardThemeVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

export async function createTheme(i: {
  guildId: string;
  actorId: string;
  name: string;
  description?: string | undefined;
  config?: unknown;
}) {
  const gid = assertGuildId(i.guildId);
  await ensureDefaults(gid);
  const name = validName(i.name);
  await assertFreeName(gid, name);
  const config = i.config === undefined ? DEFAULT_CONFIG : checkConfig(i.config);
  const t = await prisma.dashboardTheme.create({
    data: {
      guildId: gid,
      name,
      description: (i.description ?? '').trim().slice(0, 200),
      config: asJson(config),
      createdBy: i.actorId,
      versions: {
        create: {
          version: 1,
          config: asJson(config),
          changeSummary: 'Theme erstellt',
          createdBy: i.actorId,
        },
      },
    },
  });
  await audit(gid, i.actorId, 'design.theme.created', t.id, `Theme „${name}“ erstellt`);
  return t;
}

export async function duplicateTheme(guildId: string, themeId: string, actorId: string) {
  const src = await themeOf(guildId, themeId);
  let name = `${src.name} Copy`;
  for (
    let n = 2;
    (await prisma.dashboardTheme.count({ where: { guildId: src.guildId, name } })) > 0;
    n++
  )
    name = `${src.name} Copy ${n}`;
  return createTheme({
    guildId: src.guildId,
    actorId,
    name,
    description: src.description,
    config: src.config,
  });
}

export async function updateTheme(i: {
  guildId: string;
  themeId: string;
  actorId: string;
  name?: string | undefined;
  description?: string | undefined;
  config?: unknown;
}) {
  const t = await themeOf(i.guildId, i.themeId);
  if (t.builtin && i.config !== undefined)
    throw new DesignError(
      'conflict',
      'Mitgelieferte Themes sind schreibgeschützt – bitte zuerst duplizieren.',
    );
  const data: Prisma.DashboardThemeUpdateInput = {};
  const parts: string[] = [];
  if (i.name !== undefined && i.name.trim() !== t.name) {
    if (t.builtin)
      throw new DesignError('conflict', 'Mitgelieferte Themes können nicht umbenannt werden.');
    const name = validName(i.name);
    await assertFreeName(t.guildId, name, t.id);
    data.name = name;
    parts.push(`Name: ${name}`);
  }
  if (i.description !== undefined) data.description = i.description.trim().slice(0, 200);
  if (i.config !== undefined) {
    const next = checkConfig(i.config);
    const summary = summarizeChange(t.config, next);
    if (changedPaths(t.config, next).length > 0) {
      data.config = asJson(next);
      data.version = t.version + 1;
      parts.push(summary);
    }
  }
  if (Object.keys(data).length === 0) return t;
  const summary = parts.join('; ') || 'Beschreibung geändert';
  const updated = await prisma.dashboardTheme.update({ where: { id: t.id }, data });
  if (data.config) {
    await prisma.dashboardThemeVersion.create({
      data: {
        themeId: t.id,
        version: updated.version,
        config: asJson(data.config),
        changeSummary: summary,
        createdBy: i.actorId,
      },
    });
    await pruneVersions(t.id);
  }
  await audit(t.guildId, i.actorId, 'design.theme.updated', t.id, summary, { theme: updated.name });
  return updated;
}

export async function deleteTheme(guildId: string, themeId: string, actorId: string) {
  const t = await themeOf(guildId, themeId);
  if (t.builtin)
    throw new DesignError('conflict', 'Mitgelieferte Themes können nicht gelöscht werden.');
  const s = await ensureDefaults(t.guildId);
  if (s.activeThemeId === t.id)
    throw new DesignError('conflict', 'Das aktive Theme kann nicht gelöscht werden.');
  await prisma.dashboardTheme.delete({ where: { id: t.id } });
  await audit(t.guildId, actorId, 'design.theme.deleted', t.id, `Theme „${t.name}“ gelöscht`);
}

/** Aktiviert ein Theme (nur eines gleichzeitig); das bisherige bleibt erhalten. */
export async function activateTheme(guildId: string, themeId: string, actorId: string) {
  const t = await themeOf(guildId, themeId);
  await ensureDefaults(t.guildId);
  await prisma.dashboardSettings.update({
    where: { guildId: t.guildId },
    data: { activeThemeId: t.id, updatedBy: actorId },
  });
  await audit(t.guildId, actorId, 'design.theme.activated', t.id, `Theme „${t.name}“ aktiviert`);
  return getEffective(t.guildId);
}

export async function listVersions(guildId: string, themeId: string) {
  const t = await themeOf(guildId, themeId);
  return prisma.dashboardThemeVersion.findMany({
    where: { themeId: t.id },
    orderBy: { version: 'desc' },
    select: { version: true, changeSummary: true, createdBy: true, createdAt: true },
  });
}
export async function restoreVersion(
  guildId: string,
  themeId: string,
  version: number,
  actorId: string,
) {
  const t = await themeOf(guildId, themeId);
  const v = await prisma.dashboardThemeVersion.findUnique({
    where: { themeId_version: { themeId: t.id, version } },
  });
  if (!v) throw new DesignError('not-found', 'Version nicht gefunden.');
  const restored = await updateTheme({
    guildId: t.guildId,
    themeId: t.id,
    actorId,
    config: v.config,
  });
  // updateTheme ergänzt eine neue Version; der Hinweis auf die Herkunft hilft im Verlauf
  await prisma.dashboardThemeVersion.updateMany({
    where: { themeId: t.id, version: restored.version },
    data: { changeSummary: `Version ${version} wiederhergestellt` },
  });
  return restored;
}

/** Serverweite Einzel-Überschreibungen (Custom Value). `null` setzt zurück auf „nichts überschrieben“. */
export async function setOverrides(i: { guildId: string; actorId: string; overrides: unknown }) {
  const gid = assertGuildId(i.guildId);
  const s = await ensureDefaults(gid);
  const next = i.overrides === null ? {} : pruneToModel(i.overrides);
  const issues = findIssues(next);
  if (issues.length > 0)
    throw new DesignError('invalid', 'Die Einstellungen enthalten ungültige Werte.', issues);
  const summary = summarizeChange(s.overrides, next);
  await prisma.dashboardSettings.update({
    where: { guildId: gid },
    data: { overrides: asJson(next), updatedBy: i.actorId },
  });
  await audit(gid, i.actorId, 'design.overrides.updated', s.activeThemeId, summary);
  return getEffective(gid);
}
/** Einzelnen Wert zurücksetzen (Pfad wie `colors.dark.primary`). */
export async function resetPath(guildId: string, path: string, actorId: string) {
  const s = await ensureDefaults(guildId);
  const next = structuredClone(s.overrides) as Record<string, unknown>;
  const keys = path.split('.');
  if (keys.some((k) => !/^[A-Za-z0-9-]+$/.test(k)))
    throw new DesignError('invalid', 'Ungültiger Pfad.');
  let o: Record<string, unknown> | undefined = next;
  for (const k of keys.slice(0, -1))
    o =
      o && typeof o[k] === 'object' && o[k] !== null
        ? (o[k] as Record<string, unknown>)
        : undefined;
  if (o) delete o[keys[keys.length - 1]!];
  return setOverrides({ guildId, actorId, overrides: next });
}
/** Gesamtes Design zurücksetzen: Überschreibungen entfernen und Standard-Theme aktivieren. */
export async function resetAll(guildId: string, actorId: string) {
  const s = await ensureDefaults(guildId);
  const std = await prisma.dashboardTheme.findFirst({
    where: { guildId: s.guildId, name: DEFAULT_THEME_NAME, builtin: true },
  });
  await prisma.dashboardSettings.update({
    where: { guildId: s.guildId },
    data: { overrides: {}, activeThemeId: std?.id ?? null, updatedBy: actorId },
  });
  await audit(s.guildId, actorId, 'design.reset', std?.id ?? null, 'Gesamtes Design zurückgesetzt');
  return getEffective(s.guildId);
}

export async function setAutosave(guildId: string, on: boolean, actorId: string) {
  const s = await ensureDefaults(guildId);
  await prisma.dashboardSettings.update({
    where: { guildId: s.guildId },
    data: { autosave: on, updatedBy: actorId },
  });
  return on;
}

// --- Export / Import -----------------------------------------------------------------------------
/** Exportdatei: nur Name, Beschreibung, Version und Design – keine IDs, Server, Benutzer oder Tokens. */
export async function exportTheme(guildId: string, themeId: string) {
  const t = await themeOf(guildId, themeId);
  return {
    format: THEME_FORMAT,
    formatVersion: 1,
    name: t.name,
    description: t.description,
    version: t.version,
    author: null as string | null,
    config: normalizeConfig(t.config),
  };
}
export const MAX_IMPORT_BYTES = 200_000;
/** Prüft eine Importdatei und liefert die Vorschau (Name, Autor, Version, bereinigtes Design) – ohne zu speichern. */
export function previewImport(raw: unknown) {
  const o =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  if (!o || o['format'] !== THEME_FORMAT)
    throw new DesignError('invalid', 'Das ist keine NEXUS-Theme-Datei.');
  if (JSON.stringify(raw).length > MAX_IMPORT_BYTES)
    throw new DesignError('invalid', 'Die Theme-Datei ist zu groß.');
  if (o['formatVersion'] !== 1)
    throw new DesignError('invalid', 'Diese Theme-Version wird nicht unterstützt.');
  const name = typeof o['name'] === 'string' ? o['name'].trim().slice(0, 60) : '';
  if (name.length < 2)
    throw new DesignError('invalid', 'Die Theme-Datei hat keinen gültigen Namen.');
  // Ungültige Werte werden beim Import bereinigt (nicht abgelehnt); wir melden, was geändert wurde.
  const pruned = pruneToModel(o['config']);
  return {
    name,
    description: typeof o['description'] === 'string' ? o['description'].slice(0, 200) : '',
    author: typeof o['author'] === 'string' ? o['author'].slice(0, 60) : null,
    version: typeof o['version'] === 'number' ? o['version'] : 1,
    config: normalizeConfig(pruned),
    sanitized: findIssues(pruned),
  };
}
export async function importTheme(i: {
  guildId: string;
  actorId: string;
  data: unknown;
  name?: string | undefined;
}) {
  const p = previewImport(i.data);
  let name = i.name ? validName(i.name) : p.name;
  if (!i.name)
    for (
      let n = 2;
      (await prisma.dashboardTheme.count({ where: { guildId: assertGuildId(i.guildId), name } })) >
      0;
      n++
    )
      name = `${p.name} (${n})`;
  return createTheme({
    guildId: i.guildId,
    actorId: i.actorId,
    name,
    description: p.description,
    config: p.config,
  });
}

export { mergeDeep };
