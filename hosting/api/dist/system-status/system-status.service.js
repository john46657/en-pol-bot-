"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemStatusService = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const prisma_service_1 = require("../prisma/prisma.service");
const discord_service_1 = require("../discord/discord.service");
const backup_service_1 = require("../backup/backup.service");
const ai_review_service_1 = require("../applications/ai-review/ai-review.service");
const realtime_service_1 = require("../realtime/realtime.service");
const guild_context_1 = require("../common/guild-context");
const env_1 = require("../config/env");
const MIN = 60_000;
const ago = (d) => { const m = Math.round((Date.now() - d.getTime()) / MIN); return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min.` : m < 1440 ? `vor ${Math.round(m / 60)} Std.` : `vor ${Math.round(m / 1440)} Tagen`; };
const started = new Date();
/**
 * Zentrale Systemstatus-Übersicht für MDT, Leitstelle und Dashboard. Jede Zeile beruht auf einer echten Prüfung oder einem
 * gespeicherten Messwert – ein nicht verbundener oder nicht eingerichteter Dienst wird nie als funktionierend angezeigt.
 * Liefert nur Zustände und Zähler, keine Inhalte und keine Geheimnisse.
 */
let SystemStatusService = class SystemStatusService {
    prisma;
    discord;
    backups;
    ai;
    rt;
    constructor(prisma, discord, backups, ai, rt) {
        this.prisma = prisma;
        this.discord = discord;
        this.backups = backups;
        this.ai = ai;
        this.rt = rt;
    }
    async status(opts) {
        // Infrastruktur-Prüfungen gelten serverübergreifend (Zähler ohne Inhalte), daher ohne Server-Filter
        const checks = await (0, guild_context_1.unscoped)(async () => (await Promise.all([
            this.database(), this.apps(), this.bot(), this.outbox(), this.erlc(), this.aiCheck(opts.guildId), this.tickets(opts.guildId), this.backup(), this.radio(),
            ...(opts.deep ? [this.config(), this.storage(), this.accounts()] : []),
        ])).flat());
        const worst = checks.some((c) => c.state === 'error') ? 'error' : checks.some((c) => c.state === 'warn') ? 'warn' : 'ok';
        return { overall: worst, checkedAt: new Date().toISOString(), deep: opts.deep, checks };
    }
    async database() {
        const t = Date.now();
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            const ms = Date.now() - t;
            return { key: 'database', group: 'Infrastruktur', label: 'Datenbank (PostgreSQL)', state: ms > 1000 ? 'warn' : 'ok', detail: `erreichbar, Antwortzeit ${ms} ms` };
        }
        catch {
            return { key: 'database', group: 'Infrastruktur', label: 'Datenbank (PostgreSQL)', state: 'error', detail: 'nicht erreichbar', hint: 'DATABASE_URL und den Datenbank-Container prüfen (docker compose ps).' };
        }
    }
    /** MDT, Leitstelle und Dashboard sind Oberflächen derselben API mit gemeinsamer Anmeldung; Live-Daten über WebSocket. */
    async apps() {
        const sockets = this.rt.server ? (this.rt.server.engine?.clientsCount ?? null) : null;
        const live = this.rt.server
            ? { key: 'realtime', group: 'Anwendungen', label: 'Live-Verbindung (WebSocket)', state: 'ok', detail: `bereit${sockets !== null ? `, ${sockets} offene Verbindung(en)` : ''} – Statusänderungen erscheinen sofort in MDT, Leitstelle und Dashboard` }
            : { key: 'realtime', group: 'Anwendungen', label: 'Live-Verbindung (WebSocket)', state: 'error', detail: 'nicht gestartet – Änderungen erscheinen erst nach Neuladen' };
        const since = `läuft seit ${started.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`;
        return [
            { key: 'backend', group: 'Anwendungen', label: 'Dashboard-Backend (API)', state: 'ok', detail: `erreichbar, ${since}, Node ${process.version}` },
            { key: 'mdt', group: 'Anwendungen', label: 'MDT', state: 'ok', detail: 'nutzt dieselbe API, Anmeldung und Rechte wie das Dashboard' },
            { key: 'cad', group: 'Anwendungen', label: 'Leitstelle (CAD)', state: 'ok', detail: 'nutzt dieselbe API, Anmeldung und Rechte wie das Dashboard' },
            live,
        ];
    }
    async bot() {
        const env = (0, env_1.loadEnv)();
        const base = { key: 'discord-bot', group: 'Integrationen', label: 'Discord-Bot' };
        if (!env.BOT_API_TOKEN)
            return { ...base, state: 'off', detail: 'nicht eingerichtet (BOT_API_TOKEN leer) – Discord-Funktionen sind aus', hint: 'BOT_API_TOKEN in API und Bot setzen, siehe docs/discord-bot.md.' };
        const last = this.discord.lastBotPollAt;
        if (!last)
            return { ...base, state: 'error', detail: 'seit dem Start der API hat sich der Bot nicht gemeldet', hint: 'Läuft der Bot-Container (docker compose --profile bot ps)? Stimmen BOT_API_TOKEN und API_URL?' };
        const age = Date.now() - last.getTime();
        return { ...base, state: age < 2 * MIN ? 'ok' : age < 10 * MIN ? 'warn' : 'error', detail: `letzte Abfrage ${ago(last)}`, at: last.toISOString(), ...(age >= 2 * MIN ? { hint: 'Der Bot fragt normalerweise alle paar Sekunden ab – Bot-Logs prüfen.' } : {}) };
    }
    /** Zustellung an Discord (Outbox): wartende und endgültig fehlgeschlagene Nachrichten. */
    async outbox() {
        const [waiting, failed, oldest] = await Promise.all([
            this.prisma.discordOutbox.count({ where: { sentAt: null, attempts: { lt: 5 } } }),
            this.prisma.discordOutbox.count({ where: { sentAt: null, attempts: { gte: 5 }, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
            this.prisma.discordOutbox.findFirst({ where: { sentAt: null, attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        ]);
        const stuck = oldest && Date.now() - oldest.createdAt.getTime() > 10 * MIN;
        return { key: 'discord-delivery', group: 'Integrationen', label: 'Discord-Zustellung', state: failed || stuck ? 'warn' : 'ok',
            detail: `${waiting} wartend${oldest ? ` (älteste ${ago(oldest.createdAt)})` : ''}, ${failed} in 24 h endgültig fehlgeschlagen`,
            ...(failed ? { hint: 'Häufige Ursachen: Kanal-ID falsch, Bot fehlt die Berechtigung im Kanal, Mitglied hat DMs deaktiviert.' } : {}) };
    }
    async erlc() {
        const rows = await this.prisma.erlcServer.findMany({ where: { active: true }, select: { status: true, lastSyncAt: true } });
        const base = { key: 'erlc', group: 'Integrationen', label: 'ER:LC-API (Leitstelle)' };
        if (!rows.length)
            return { ...base, state: 'off', detail: 'kein ER:LC-Server verbunden – Leitstelle arbeitet ohne Live-Daten', hint: 'Leitstelle → Einstellungen → ER:LC.' };
        const n = (s) => rows.filter((r) => r.status === s).length;
        const bad = n('ERROR') + n('OFFLINE'), limited = n('LIMITED') + n('UNKNOWN');
        const last = rows.map((r) => r.lastSyncAt).filter((d) => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
        return { ...base, state: bad === rows.length ? 'error' : bad || limited ? 'warn' : 'ok', detail: `${n('CONNECTED')}/${rows.length} verbunden${bad ? `, ${bad} gestört` : ''}${limited ? `, ${limited} eingeschränkt/unbekannt` : ''}${last ? `, letzter Abgleich ${ago(last)}` : ''}`, at: last?.toISOString() ?? null };
    }
    async aiCheck(guildId) {
        const s = await this.ai.status(guildId);
        const base = { key: 'ai', group: 'Integrationen', label: `KI-Bewerbungsprüfung (${s.providerLabel})` };
        if (!s.configured)
            return { ...base, state: 'off', detail: `nicht eingerichtet – kein Schlüssel (${s.keyEnv})`, hint: 'Siehe docs/applications.md – Schlüssel nur in der Server-Umgebung eintragen.' };
        if (!s.enabled)
            return { ...base, state: 'off', detail: 'für diesen Server ausgeschaltet' };
        const limit = s.usedToday >= s.dailyLimit;
        return { ...base, state: s.last && !s.last.ok ? 'warn' : limit ? 'warn' : 'ok',
            detail: `Modell ${s.model}, ${s.auto ? 'automatisch bei neuen Bewerbungen' : 'nur auf Klick'}, ${s.usedToday}/${s.dailyLimit} in 24 h${s.queued ? `, ${s.queued} wartend` : ''}${s.last && !s.last.ok ? ` – letzte Analyse fehlgeschlagen: ${s.last.error}` : ''}`,
            at: s.last?.at ?? null };
    }
    async tickets(guildId) {
        const where = guildId ? { guildId } : {};
        const [open, panels] = await Promise.all([
            this.prisma.supportTicket.count({ where: { ...where, closedAt: null } }),
            this.prisma.ticketPanel.count({ where: guildId ? { guildId } : {} }).catch(() => null),
        ]);
        return { key: 'tickets', group: 'Betrieb', label: 'Ticket-System', state: 'ok', detail: `${open} offene Tickets${panels !== null ? `, ${panels} Panel(s)` : ''}${guildId ? ' auf diesem Server' : ''} – Zustellung über den Discord-Bot` };
    }
    async backup() {
        const [cfg, list] = await Promise.all([this.backups.config(), this.backups.listData().catch(() => null)]);
        const base = { key: 'backups', group: 'Betrieb', label: 'Daten-Backups' };
        if (!list)
            return { ...base, state: 'error', detail: 'Backup-Ordner nicht lesbar', hint: 'STORAGE_DIR und Rechte des Speicherordners prüfen.' };
        const last = list[0] ? new Date(list[0].createdAt) : null;
        if (!last)
            return { ...base, state: 'warn', detail: `noch kein Daten-Backup vorhanden${cfg.dataAuto ? ' (automatisch stündlich aktiv)' : ' (automatische Backups aus)'}`, hint: 'Verwaltung → Protokolle → Backups. Zusätzlich sichert der backup-Container die Datenbank täglich.' };
        const age = Date.now() - last.getTime();
        return { ...base, state: age > 3 * 1440 * MIN ? 'warn' : 'ok', detail: `letztes Backup ${ago(last)}, ${list.length} vorhanden, automatisch ${cfg.dataAuto ? 'an' : 'aus'}`, at: last.toISOString() };
    }
    async radio() {
        const r = await this.prisma.radioIntegration.findUnique({ where: { id: 'default' } });
        const base = { key: 'radio', group: 'Integrationen', label: 'Funkdienst' };
        if (!r || r.provider === 'NONE')
            return { ...base, state: 'off', detail: 'keine Funkanbindung eingerichtet – es wird keine Funkübertragung angeboten' };
        if (r.provider !== 'ZELLO_WORK')
            return { ...base, state: 'off', detail: `${r.displayName}: manuelle Pflege (keine API-Anbindung)` };
        return { ...base, state: r.status === 'CONNECTED' ? 'ok' : r.status === 'ERROR' ? 'error' : 'warn', detail: `Zello Work: ${r.status === 'CONNECTED' ? 'verbunden' : r.status === 'ERROR' ? `Fehler${r.lastError ? ` – ${r.lastError}` : ''}` : 'nicht geprüft'}`, at: r.lastSuccessAt?.toISOString() ?? null };
    }
    // ───────────── Diagnose (nur globale Administratoren) ─────────────
    async config() {
        const env = (0, env_1.loadEnv)();
        const out = [];
        const prod = env.NODE_ENV === 'production';
        out.push(env.SESSION_SECRET === 'dev-only-insecure-session-secret' || env.SESSION_SECRET.length < 32
            ? { key: 'cfg-session', group: 'Konfiguration', label: 'Sitzungsgeheimnis', state: prod ? 'error' : 'warn', detail: 'SESSION_SECRET ist kurz oder der Entwicklungswert', hint: 'openssl rand -hex 32 in .env eintragen.' }
            : { key: 'cfg-session', group: 'Konfiguration', label: 'Sitzungsgeheimnis', state: 'ok', detail: 'gesetzt (Wert wird nie angezeigt)' });
        const https = /^https:\/\//.test(env.WEB_ORIGIN);
        out.push({ key: 'cfg-origin', group: 'Konfiguration', label: 'Web-Adresse / Cookies', state: prod && !https ? 'error' : 'ok', detail: `${env.WEB_ORIGIN} – Sitzungs-Cookie httpOnly, SameSite=Strict${prod ? ', Secure' : ''}`, ...(prod && !https ? { hint: 'In Produktion muss WEB_ORIGIN mit https:// beginnen.' } : {}) });
        out.push({ key: 'cfg-bot', group: 'Konfiguration', label: 'Bot-Zugang', state: env.BOT_API_TOKEN ? 'ok' : 'off', detail: env.BOT_API_TOKEN ? 'gesetzt, mind. 32 Zeichen (Wert wird nie angezeigt)' : 'nicht gesetzt' });
        return out;
    }
    async storage() {
        const dir = (0, env_1.loadEnv)().STORAGE_DIR;
        const probe = node_path_1.default.join(dir, `.status-probe-${process.pid}`);
        try {
            await (0, promises_1.mkdir)(dir, { recursive: true });
            await (0, promises_1.access)(dir, promises_1.constants.W_OK);
            await (0, promises_1.writeFile)(probe, 'ok');
            await (0, promises_1.rm)(probe, { force: true });
            return { key: 'storage', group: 'Konfiguration', label: 'Speicherordner (Uploads/Backups)', state: 'ok', detail: 'beschreibbar' };
        }
        catch {
            return { key: 'storage', group: 'Konfiguration', label: 'Speicherordner (Uploads/Backups)', state: 'error', detail: 'nicht beschreibbar – Uploads und Backups schlagen fehl', hint: 'STORAGE_DIR und Volume-Rechte prüfen.' };
        }
    }
    /** Rechte-Sanity: Gibt es einen aktiven Administrator? Konten ohne Rolle? Rollen ohne Rechte? (nur Zähler) */
    async accounts() {
        const [admins, noRole, emptyRoles] = await Promise.all([
            this.prisma.user.count({ where: { active: true, roles: { some: { role: { name: 'System Administrator', guildId: null } } } } }),
            this.prisma.user.count({ where: { active: true, roles: { none: {} }, groups: { none: {} } } }),
            this.prisma.role.count({ where: { active: true, permissions: { none: {} } } }),
        ]);
        return [
            { key: 'perm-admin', group: 'Konfiguration', label: 'Administratorzugang', state: admins ? 'ok' : 'error', detail: admins ? `${admins} aktive(r) Systemadministrator(en)` : 'kein aktiver Systemadministrator – Verwaltung nicht möglich', ...(admins ? {} : { hint: 'Einen Benutzer über den Seed oder die Datenbank zum Administrator machen.' }) },
            { key: 'perm-users', group: 'Konfiguration', label: 'Benutzer und Rollen', state: 'ok', detail: `${noRole} aktive Konten ohne direkte Rolle (Rechte ggf. über Discord-Rollen), ${emptyRoles} Rollen ohne Rechte` },
        ];
    }
};
exports.SystemStatusService = SystemStatusService;
exports.SystemStatusService = SystemStatusService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, discord_service_1.DiscordService, backup_service_1.BackupService, ai_review_service_1.AiReviewService, realtime_service_1.RealtimeService])
], SystemStatusService);
//# sourceMappingURL=system-status.service.js.map