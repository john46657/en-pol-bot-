import { promises as fs, existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultGuildConfig } from './defaults.js';

/**
 * Speicher in einer JSON-Datei (`data.json`) – keine Datenbank nötig. Alles liegt im Arbeitsspeicher; Änderungen werden
 * kurz gesammelt und dann atomar geschrieben (erst `.tmp`, dann umbenennen). Einmal am Tag wird eine Sicherung angelegt.
 *
 * Aufbau: { version, counter, guilds: { [guildId]: config }, applications: [], bans: [], progress: [], tickets: {} }
 */
export class Store {
  constructor(dir, { autosave = true } = {}) {
    this.dir = dir;
    this.file = dir ? path.join(dir, 'data.json') : null;
    this.autosave = autosave && !!dir;
    this.timer = null;
    this.data = { version: 1, counter: 0, guilds: {}, applications: [], bans: [], progress: [], tickets: {} };
    if (this.file) {
      mkdirSync(dir, { recursive: true });
      if (existsSync(this.file)) this.data = { ...this.data, ...JSON.parse(readFileSync(this.file, 'utf8')) };
    }
  }

  /** Änderung merken – wird nach kurzer Zeit gespeichert. */
  touch() {
    if (!this.autosave || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush().catch((e) => console.error('Speichern fehlgeschlagen:', e)); }, 300);
  }

  async flush() {
    if (!this.file) return;
    const json = JSON.stringify(this.data);
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, json);
    await fs.rename(tmp, this.file);
    const day = new Date().toISOString().slice(0, 10);
    const backup = path.join(this.dir, 'backups', `data-${day}.json`);
    if (!existsSync(backup)) {
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, json);
      // höchstens 14 Sicherungen behalten
      const all = (await fs.readdir(path.dirname(backup))).filter((f) => f.startsWith('data-')).sort();
      for (const f of all.slice(0, Math.max(0, all.length - 14))) await fs.rm(path.join(path.dirname(backup), f)).catch(() => undefined);
    }
  }

  // ---- Server-Einstellungen ----
  guild(guildId) {
    if (!this.data.guilds[guildId]) { this.data.guilds[guildId] = defaultGuildConfig(); this.touch(); }
    return this.data.guilds[guildId];
  }
  setGuild(guildId, cfg) { this.data.guilds[guildId] = cfg; this.touch(); }

  // ---- Bewerbungen ----
  nextNumber() { this.data.counter += 1; return `APP-${String(this.data.counter).padStart(6, '0')}`; }
  addApplication(a) { const row = { id: randomUUID(), number: this.nextNumber(), ...a }; this.data.applications.push(row); this.touch(); return row; }
  application(id) { return this.data.applications.find((a) => a.id === id) ?? null; }
  applications(guildId) { return this.data.applications.filter((a) => a.guildId === guildId); }
  removeApplication(id) { this.data.applications = this.data.applications.filter((a) => a.id !== id); this.touch(); }

  // ---- Sperren ----
  addBan(b) { const row = { id: randomUUID(), createdAt: new Date().toISOString(), liftedAt: null, ...b }; this.data.bans.push(row); this.touch(); return row; }
  bans(guildId) { return this.data.bans.filter((b) => b.guildId === guildId); }

  // ---- Angefangene Bewerbungen („in Bearbeitung“) ----
  saveProgress(p) {
    const i = this.data.progress.findIndex((x) => x.guildId === p.guildId && x.userId === p.userId && x.type === p.type);
    if (i >= 0) this.data.progress[i] = { ...this.data.progress[i], ...p, updatedAt: new Date().toISOString() };
    else this.data.progress.push({ ...p, startedAt: p.startedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
    this.touch();
  }
  clearProgress(guildId, userId, type) {
    const before = this.data.progress.length;
    this.data.progress = this.data.progress.filter((x) => !(x.userId === userId && (!guildId || x.guildId === guildId) && (!type || x.type === type)));
    if (this.data.progress.length !== before) this.touch();
  }
  progress(guildId, now = Date.now()) {
    const live = this.data.progress.filter((x) => Date.parse(x.expiresAt) > now);
    if (live.length !== this.data.progress.length) { this.data.progress = live; this.touch(); }
    return live.filter((x) => x.guildId === guildId);
  }
}
