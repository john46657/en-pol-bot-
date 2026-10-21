import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GuildConfigStore, guildConfigSchema, memoryKeyValue, parseGuildConfig, type GuildConfig, type KeyValue } from './guild-config';
import { containsSecret, scrubSecrets } from './safety';

/**
 * Sicherungen der Bot-Einstellungen je Server. Jede Sicherung liegt an ZWEI Orten:
 *  1. als Datei in `BOT_BACKUP_DIR` (Standard: Benutzerordner, nicht im Bot-/Produktionsordner), nur für den Bot-Benutzer lesbar,
 *  2. in der Datenbank des Systems (über `/bot/state`, letzte Sicherungen vollständig).
 * Inhalte werden vor dem Schreiben von Geheimnissen befreit und mit einer SHA-256-Prüfsumme versehen.
 * Datenbank-Daten (Ausbildungen, Prüfungen, Personal – mit allen Beziehungen) sichert das System selbst; die Bot-Sicherung
 * verweist auf die dabei angelegte Datenbank-Sicherung.
 */
export const BACKUP_FORMAT = 'enpol-bot-backup';
export const BACKUP_VERSION = 1;
export type BackupReason = 'manuell' | 'vor-wiederherstellung' | 'vor-migration';
const NAME = /^bot-(manuell|vor-wiederherstellung|vor-migration)-\d{8}-\d{6}(?:-\d{1,3})?\.json$/;
const MIRROR_KEEP_FULL = 5;
const MIRROR_KEEP_META = 30;

export interface DbBackupRef { name: string; rows?: number; size?: number }
export interface BotSnapshot {
  format: typeof BACKUP_FORMAT; version: number; name: string; createdAt: string; reason: BackupReason;
  guildId: string; guildName: string | null; createdBy: string | null;
  /** Datenbank-Sicherung des Systems, die zusammen mit dieser Sicherung angelegt wurde */
  database: DbBackupRef | null;
  contents: { guildConfig: GuildConfig };
  checksum: string;
}
export interface BackupMeta { name: string; createdAt: string; reason: BackupReason; checksum: string; createdBy: string | null; database: DbBackupRef | null; locations: ('Datei' | 'Datenbank')[] }

/** JSON mit sortierten Schlüsseln (gleiche Inhalte → gleiche Prüfsumme). */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export const checksumOf = (contents: unknown) => createHash('sha256').update(stableJson(contents)).digest('hex');

/** Ablage der Sicherungsdateien (echtes Dateisystem oder im Test ein Speicher). */
export interface BackupFiles {
  readonly location: string;
  list(guildId: string): Promise<string[]>;
  read(guildId: string, name: string): Promise<string | null>;
  write(guildId: string, name: string, text: string): Promise<void>;
}

const safeGuild = (g: string) => { if (!/^\d{15,25}$/.test(g)) throw new Error('invalid guild id'); return g; };
const safeName = (n: string) => { if (!NAME.test(n)) throw new Error('invalid backup name'); return n; };

/** Standardordner: im Benutzerordner (außerhalb des Bot-Ordners), überschreibbar mit BOT_BACKUP_DIR. */
export const defaultBackupDir = (env: NodeJS.ProcessEnv = process.env) => path.resolve(env.BOT_BACKUP_DIR || path.join(os.homedir(), '.en-polizei-bot', 'backups'));

/** Liegt der Sicherungsordner im Produktionsordner (dort, wo bot.js/.env liegen)? Dann warnen. */
export function insideProduction(dir: string, prodDirs: string[]): boolean {
  const d = path.resolve(dir) + path.sep;
  return prodDirs.some((p) => d.startsWith(path.resolve(p) + path.sep));
}

export function fsBackupFiles(dir: string): BackupFiles {
  const gdir = (g: string) => path.join(dir, safeGuild(g));
  return {
    location: dir,
    async list(g) { return (await readdir(gdir(g)).catch(() => [] as string[])).filter((n) => NAME.test(n)); },
    async read(g, n) { return readFile(path.join(gdir(g), safeName(n)), 'utf8').catch(() => null); },
    async write(g, n, text) {
      await mkdir(gdir(g), { recursive: true, mode: 0o700 });
      await chmod(dir, 0o700).catch(() => undefined);
      const f = path.join(gdir(g), safeName(n));
      await writeFile(f, text, { mode: 0o600, flag: 'wx' }); // nie eine vorhandene Sicherung überschreiben
    },
  };
}
export function memoryBackupFiles(location = 'memory'): BackupFiles & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    location, data,
    async list(g) { return [...data.keys()].filter((k) => k.startsWith(`${g}/`)).map((k) => k.slice(g.length + 1)); },
    async read(g, n) { return data.get(`${g}/${n}`) ?? null; },
    async write(g, n, t) { if (data.has(`${g}/${n}`)) throw new Error('exists'); data.set(`${safeGuild(g)}/${safeName(n)}`, t); },
  };
}

interface Mirror { items: Omit<BackupMeta, 'locations'>[]; snapshots: Record<string, BotSnapshot> }
const mirrorKey = (g: string) => `botbak:${safeGuild(g)}`;

export interface RestorePlan {
  guildId: string; name: string; checksum: string; currentRevision: number;
  snapshot: BotSnapshot; changes: string[]; warnings: string[]; problems: string[]; sandboxOk: boolean;
}

/** Unterschiede zwischen aktuellem und gesichertem Stand (lesbar, ohne Revision/Zeitstempel). */
export function diffConfig(cur: GuildConfig, next: GuildConfig): string[] {
  const out: string[] = [];
  const skip = new Set(['revision', 'updatedAt', 'updatedBy', 'version']);
  const walk = (a: unknown, b: unknown, p: string) => {
    if (stableJson(a) === stableJson(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!(p === '' && skip.has(k))) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], p ? `${p}.${k}` : k);
      return;
    }
    const show = (v: unknown) => { const s = JSON.stringify(v ?? null); return s.length > 60 ? `${s.slice(0, 57)}…` : s; };
    out.push(`${p}: ${show(a)} → ${show(b)}`);
  };
  walk(cur, next, '');
  return out;
}

export class BotBackupService {
  constructor(private readonly store: GuildConfigStore, readonly files: BackupFiles, private readonly db: KeyValue, private readonly now = () => new Date()) {}

  private stamp(): string { return this.now().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15); }

  private async readMirror(g: string): Promise<Mirror> {
    const v = (await this.db.get(mirrorKey(g))) as Partial<Mirror> | null;
    return { items: Array.isArray(v?.items) ? v.items : [], snapshots: v?.snapshots && typeof v.snapshots === 'object' ? v.snapshots : {} };
  }

  /** Sicherung anlegen (Datei + Datenbank). Schlägt nur fehl, wenn KEIN Ort geschrieben werden konnte. */
  async create(guildId: string, o: { reason: BackupReason; by?: string | null; guildName?: string | null; database?: DbBackupRef | null }): Promise<{ meta: BackupMeta; problems: string[] }> {
    const cfg = scrubSecrets(await this.store.get(guildId, { fresh: true }));
    const contents = { guildConfig: cfg };
    const taken = new Set([...(await this.files.list(guildId).catch(() => [])), ...(await this.readMirror(guildId).catch(() => ({ items: [] as Mirror['items'] }))).items.map((x) => x.name)]);
    let name = `bot-${o.reason}-${this.stamp()}.json`;
    for (let n = 2; taken.has(name); n++) name = `bot-${o.reason}-${this.stamp()}-${n}.json`;
    const snap: BotSnapshot = { format: BACKUP_FORMAT, version: BACKUP_VERSION, name, createdAt: this.now().toISOString(), reason: o.reason, guildId, guildName: o.guildName ?? null, createdBy: o.by ?? null, database: o.database ?? null, contents, checksum: checksumOf(contents) };
    if (containsSecret(snap)) throw new Error('Sicherung abgebrochen: Inhalt sieht nach einem Geheimnis aus.');
    const problems: string[] = [];
    const locations: BackupMeta['locations'] = [];
    try { await this.files.write(guildId, name, JSON.stringify(snap, null, 2)); locations.push('Datei'); } catch (e) { problems.push(`Datei nicht geschrieben (${this.files.location}): ${e instanceof Error ? e.message : e}`); }
    try {
      const m = await this.readMirror(guildId);
      const meta = { name, createdAt: snap.createdAt, reason: snap.reason, checksum: snap.checksum, createdBy: snap.createdBy, database: snap.database };
      const items = [meta, ...m.items.filter((x) => x.name !== name)].slice(0, MIRROR_KEEP_META);
      const keep = new Set(items.slice(0, MIRROR_KEEP_FULL).map((x) => x.name));
      const snapshots = Object.fromEntries(Object.entries({ ...m.snapshots, [name]: snap }).filter(([k]) => keep.has(k)));
      await this.db.put(mirrorKey(guildId), { items, snapshots });
      locations.push('Datenbank');
    } catch (e) { problems.push(`Kopie in der Datenbank nicht gespeichert: ${e instanceof Error ? e.message : e}`); }
    if (!locations.length) throw new Error(`Sicherung fehlgeschlagen: ${problems.join(' · ')}`);
    return { meta: { name, createdAt: snap.createdAt, reason: snap.reason, checksum: snap.checksum, createdBy: snap.createdBy, database: snap.database, locations }, problems };
  }

  /** Alle Sicherungen eines Servers (neueste zuerst), mit Ablageort. */
  async list(guildId: string): Promise<BackupMeta[]> {
    const [names, m] = await Promise.all([this.files.list(guildId).catch(() => [] as string[]), this.readMirror(guildId).catch(() => ({ items: [], snapshots: {} }) as Mirror)]);
    const byName = new Map<string, BackupMeta>();
    for (const it of m.items) byName.set(it.name, { ...it, locations: ['Datenbank'] });
    for (const n of names) {
      const hit = byName.get(n);
      if (hit) hit.locations = ['Datei', ...(m.snapshots[n] ? ['Datenbank' as const] : [])];
      else {
        const s = this.parse(await this.files.read(guildId, n));
        byName.set(n, { name: n, createdAt: s?.createdAt ?? '', reason: s?.reason ?? 'manuell', checksum: s?.checksum ?? '', createdBy: s?.createdBy ?? null, database: s?.database ?? null, locations: ['Datei'] });
      }
    }
    // nur Metadaten in der Datenbank (vollständige Kopie dort schon aufgeräumt) und keine Datei → nicht wiederherstellbar
    for (const [n, b] of byName) if (!names.includes(n) && !m.snapshots[n]) byName.set(n, { ...b, locations: [] });
    return [...byName.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private parse(text: string | null): BotSnapshot | null {
    if (!text) return null;
    try { return JSON.parse(text) as BotSnapshot; } catch { return null; }
  }

  /** Sicherung laden: bevorzugt die Datei, sonst die Kopie in der Datenbank. */
  async load(guildId: string, name: string): Promise<BotSnapshot | null> {
    safeName(name);
    return this.parse(await this.files.read(guildId, name).catch(() => null)) ?? (await this.readMirror(guildId).catch(() => null))?.snapshots[name] ?? null;
  }

  /** Formale Prüfung: Format, Version, Server, Prüfsumme, keine Geheimnisse, gültige Einstellungen. */
  verify(s: BotSnapshot | null, guildId: string): string[] {
    if (!s || typeof s !== 'object') return ['Datei fehlt oder ist kein gültiges JSON.'];
    const p: string[] = [];
    if (s.format !== BACKUP_FORMAT) p.push('Unbekanntes Format.');
    if (typeof s.version !== 'number' || s.version > BACKUP_VERSION) p.push(`Version ${String(s.version)} wird von diesem Bot nicht unterstützt.`);
    if (s.guildId !== guildId) p.push('Die Sicherung gehört zu einem anderen Discord-Server.');
    if (!s.contents?.guildConfig) p.push('Keine Einstellungen enthalten.');
    else {
      if (checksumOf(s.contents) !== s.checksum) p.push('Prüfsumme stimmt nicht – die Datei wurde verändert oder ist beschädigt.');
      if (!guildConfigSchema.safeParse(s.contents.guildConfig).success) p.push('Die gesicherten Einstellungen sind ungültig.');
    }
    if (containsSecret(s)) p.push('Die Datei enthält etwas, das wie ein Geheimnis aussieht – wird nicht eingespielt.');
    return p;
  }

  /** Testwiederherstellung in einer abgeschotteten Umgebung (eigener Speicher, nichts Echtes wird berührt). */
  async sandboxRestore(s: BotSnapshot): Promise<{ ok: boolean; problems: string[] }> {
    try {
      const kv = memoryKeyValue();
      const sandbox = new GuildConfigStore(kv, 0);
      const want = parseGuildConfig(s.contents.guildConfig);
      await sandbox.replace(s.guildId, want);
      const got = await new GuildConfigStore(kv, 0).get(s.guildId); // wie nach einem Neustart frisch gelesen
      const diff = diffConfig(want, got);
      return diff.length ? { ok: false, problems: [`Test-Wiederherstellung weicht ab: ${diff.slice(0, 3).join('; ')}`] } : { ok: true, problems: [] };
    } catch (e) { return { ok: false, problems: [`Test-Wiederherstellung fehlgeschlagen: ${e instanceof Error ? e.message : e}`] }; }
  }

  /** Wiederherstellungsplan: Prüfung, Testlauf, Änderungen, Hinweise zu nicht mehr vorhandenen Kanälen/Rollen. Ändert nichts. */
  async plan(guildId: string, name: string, present?: { channelIds: string[]; roleIds: string[] }): Promise<RestorePlan> {
    const snapshot = await this.load(guildId, name);
    const problems = this.verify(snapshot, guildId);
    const cur = await this.store.get(guildId, { fresh: true });
    if (!snapshot || problems.length) return { guildId, name, checksum: snapshot?.checksum ?? '', currentRevision: cur.revision, snapshot: snapshot!, changes: [], warnings: [], problems, sandboxOk: false };
    const sandbox = await this.sandboxRestore(snapshot);
    const next = parseGuildConfig(snapshot.contents.guildConfig);
    const warnings: string[] = [];
    if (present) {
      const gone = (ids: (string | null)[], have: string[]) => ids.filter((x): x is string => !!x && !have.includes(x)).length;
      const ch = gone(Object.values(next.channels) as (string | null)[], present.channelIds);
      const ro = gone(Object.values(next.roles).flat() as string[], present.roleIds);
      if (ch) warnings.push(`${ch} gesicherte(r) Kanal/Kanäle existiert nicht mehr – danach unter /setup neu wählen.`);
      if (ro) warnings.push(`${ro} gesicherte Rolle(n) existiert nicht mehr – Stufen danach prüfen.`);
    }
    return { guildId, name, checksum: snapshot.checksum, currentRevision: cur.revision, snapshot, changes: diffConfig(cur, next), warnings, problems: sandbox.problems, sandboxOk: sandbox.ok };
  }

  /**
   * Einspielen eines geprüften Plans: Datei erneut prüfen (unverändert?), aktuellen Stand sichern (Pflicht),
   * dann nur, wenn sich die Einstellungen seit dem Plan nicht geändert haben.
   */
  async apply(plan: RestorePlan, o: { by: string; guildName?: string | null }): Promise<{ safety: BackupMeta; config: GuildConfig }> {
    if (plan.problems.length || !plan.sandboxOk) throw new Error('Der Plan ist nicht geprüft – Wiederherstellung abgelehnt.');
    const again = await this.load(plan.guildId, plan.name);
    const problems = this.verify(again, plan.guildId);
    if (problems.length || again!.checksum !== plan.checksum) throw new Error('Die Sicherung hat sich seit der Prüfung verändert – bitte neu planen.');
    const cur = await this.store.get(plan.guildId, { fresh: true });
    if (cur.revision !== plan.currentRevision) throw new Error('Die Einstellungen wurden seit der Prüfung geändert – bitte neu planen.');
    const { meta: safety } = await this.create(plan.guildId, { reason: 'vor-wiederherstellung', by: o.by, guildName: o.guildName ?? null });
    const config = await this.store.replace(plan.guildId, parseGuildConfig(again!.contents.guildConfig), { by: o.by, expectRevision: plan.currentRevision });
    return { safety, config };
  }
}
