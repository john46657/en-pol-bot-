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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebApplyService = exports.POLICE_KEY = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const applications_service_1 = require("../applications/applications.service");
const errors_1 = require("../common/errors");
const web_url_1 = require("../common/web-url");
const env_1 = require("../config/env");
const qualifications_service_1 = require("./qualifications.service");
/** Schlüssel der Polizei-Bewerbung (wie im Bot); alles andere ist eine Einheit aus der Qualifikations-Konfiguration. */
exports.POLICE_KEY = '@polizei';
/** Länge der Signatur (HMAC-SHA256, base64url). */
const SIG_LENGTH = 43;
/**
 * Bewerbungsart „Web“: Der Bot stellt einen signierten, zeitlich begrenzten Link aus, die Person füllt die Fragen
 * im Browser aus. Kein Konto nötig – die Discord-Identität steckt im Link. Geprüft wird beim Absenden genauso wie bei
 * einer Bewerbung per Direktnachricht (gleiche Service-Methoden).
 */
let WebApplyService = class WebApplyService {
    q;
    apps;
    secret = (0, env_1.loadEnv)().SESSION_SECRET;
    constructor(q, apps) {
        this.q = q;
        this.apps = apps;
    }
    sign(body) { return (0, node_crypto_1.createHmac)('sha256', this.secret).update(`webapply:${body}`).digest('base64url'); }
    verify(token) {
        // Link = Inhalt + Signatur (immer 43 Zeichen) ohne Trennzeichen – ein Punkt im Pfad würde als Dateiname gelten
        const body = token.slice(0, -SIG_LENGTH), sig = token.slice(-SIG_LENGTH);
        const expected = body ? this.sign(body) : '';
        if (!body || !sig || sig.length !== expected.length || !(0, node_crypto_1.timingSafeEqual)(Buffer.from(sig), Buffer.from(expected)))
            throw new errors_1.AppError('NOT_FOUND', 'Dieser Bewerbungslink ist ungültig.');
        const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (c.e < Date.now())
            throw new errors_1.AppError('CONFLICT', 'Dieser Bewerbungslink ist abgelaufen. Starte die Bewerbung im Discord neu.');
        return c;
    }
    /** Name, Einstellungen und Fragen einer Bewerbung (Polizei oder Einheit). */
    async flow(key, guildId) {
        const cfg = await this.q.config(guildId);
        if (key === exports.POLICE_KEY) {
            const name = cfg.police.name;
            return { name, title: `Bewerbung – ${name}`, enabled: cfg.police.enabled, settings: cfg.police.settings, questions: await this.apps.form(guildId), police: true };
        }
        const u = cfg.units.find((x) => x.key === key);
        if (!u)
            throw new errors_1.AppError('NOT_FOUND', 'Diese Bewerbung gibt es nicht mehr.');
        return { name: u.name, title: u.name, enabled: u.enabled, settings: u.settings, questions: u.questions, police: false };
    }
    /** Vom Bot: Link für eine Person ausstellen; gültig so lange wie das Zeitlimit der Bewerbung. */
    async link(d) {
        const f = await this.flow(d.unit, d.guildId);
        if (!f.enabled)
            throw new errors_1.AppError('CONFLICT', `Bewerbungen für ${f.name} sind derzeit geschlossen.`);
        const now = Date.now();
        const claims = { k: d.unit, d: d.discordId, n: d.discordName, ...(d.guildId ? { g: d.guildId } : {}), ...(d.joinedAt ? { j: d.joinedAt.toISOString() } : {}), t: now, e: now + f.settings.timeLimitMinutes * 60_000 };
        const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
        return { url: (0, web_url_1.webUrl)(`/bewerbung/${body}${this.sign(body)}`), expiresAt: new Date(claims.e).toISOString(), timeLimit: (0, shared_1.formatMinutes)(f.settings.timeLimitMinutes) };
    }
    /** Öffentlich: Formular zum Link. */
    async open(token) {
        const c = this.verify(token);
        const f = await this.flow(c.k, c.g);
        if (!f.enabled)
            throw new errors_1.AppError('CONFLICT', `Bewerbungen für ${f.name} sind derzeit geschlossen.`);
        return { title: f.title, name: f.name, discordName: c.n, expiresAt: new Date(c.e).toISOString(), questions: f.questions, robloxField: f.police && !f.questions.some((x) => x.type === 'ROBLOX') };
    }
    /** Öffentlich: Antworten absenden – gleiche Prüfungen wie bei der Bewerbung per Direktnachricht. */
    async submit(token, b) {
        const c = this.verify(token);
        const f = await this.flow(c.k, c.g);
        const meta = { discordId: c.d, discordName: c.n, durationSec: Math.min(86_400, Math.max(0, Math.round((Date.now() - c.t) / 1000))), ...(c.g ? { guildId: c.g } : {}), ...(c.j ? { joinedAt: new Date(c.j) } : {}) };
        let number;
        if (f.police) {
            const rb = f.questions.find((x) => x.type === 'ROBLOX');
            const robloxUsername = (rb ? String(b.answers[rb.key] ?? '') : b.robloxUsername ?? '').trim();
            if (!robloxUsername)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte gib deinen Roblox-Benutzernamen an.');
            ({ number } = await this.apps.submit({ robloxUsername, answers: b.answers }, meta));
        }
        else {
            ({ number } = await this.q.submit({ unit: c.k, ...meta, answers: f.questions.map((x) => ({ question: x.label, answer: b.answers[x.key] ?? null })) }));
        }
        return { number, message: (0, shared_1.renderApplicationText)(f.settings.messages.completion, { '{number}': number, '{applicationName}': f.name }).replace(/hier per Direktnachricht/g, 'per Direktnachricht') };
    }
};
exports.WebApplyService = WebApplyService;
exports.WebApplyService = WebApplyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [qualifications_service_1.QualificationsService, applications_service_1.ApplicationsService])
], WebApplyService);
//# sourceMappingURL=web-apply.service.js.map