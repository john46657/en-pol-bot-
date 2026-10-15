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
var RobloxService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RobloxService = void 0;
const guild_context_1 = require("../common/guild-context");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const NAME = /^[A-Za-z0-9_]{3,20}$/;
const ID = /^\d{1,19}$/;
const TTL = 10 * 60_000;
/**
 * Roblox-Konto nachschlagen – per Benutzername oder Roblox-ID – über die öffentliche Roblox-API (kein Token).
 * Antworten werden 10 Minuten zwischengespeichert; Fehler/Timeouts → null (die normale Suche läuft weiter).
 */
let RobloxService = RobloxService_1 = class RobloxService {
    prisma;
    cache = new Map();
    constructor(prisma) {
        this.prisma = prisma;
    }
    /** Gültige Eingabe? (Roblox-Name 3–20 Zeichen aus Buchstaben/Ziffern/_ oder eine Roblox-ID; auch Profil-Links) */
    static parse(input) {
        const t = input.trim();
        const link = t.match(/roblox\.com\/users\/(\d{1,19})/i)?.[1];
        if (link)
            return { id: link };
        if (ID.test(t))
            return { id: t };
        const name = t.replace(/^@/, '');
        return NAME.test(name) ? { name } : null;
    }
    async lookup(input) {
        if (process.env.ROBLOX_LOOKUP === 'off')
            return null; // Tests ohne Internet
        const p = RobloxService_1.parse(input);
        if (!p)
            return null;
        const key = p.id ? `id:${p.id}` : `name:${p.name.toLowerCase()}`;
        const hit = this.cache.get(key);
        let profile = hit && Date.now() - hit.at < TTL ? hit.value : undefined;
        if (profile === undefined) {
            profile = await this.fetchProfile(p);
            if (this.cache.size > 500)
                this.cache.clear();
            this.cache.set(key, { at: Date.now(), value: profile });
        }
        if (!profile)
            return null;
        const person = await this.prisma.person.findFirst({
            where: { ...(0, guild_context_1.recordWhere)(), OR: [{ robloxUserId: profile.id }, { robloxUsername: { equals: profile.name, mode: 'insensitive' } }] },
            orderBy: { robloxUserId: { sort: 'asc', nulls: 'last' } }, select: { id: true, robloxUsername: true },
        });
        return { ...profile, person };
    }
    /**
     * Roblox-Benutzername prüfen (Bewerbungsfrage „Roblox User“): gefunden → richtige Schreibweise + ID,
     * gibt es nicht → null, Roblox nicht erreichbar (oder Abfrage abgeschaltet) → undefined.
     */
    async verifyName(name) {
        if (process.env.ROBLOX_LOOKUP === 'off' || !NAME.test(name))
            return undefined;
        const key = `verify:${name.toLowerCase()}`;
        const hit = this.cache.get(key);
        if (hit && Date.now() - hit.at < TTL)
            return hit.value ? { id: hit.value.id, name: hit.value.name } : null;
        try {
            const r = await this.get('https://users.roblox.com/v1/usernames/users', { usernames: [name], excludeBannedUsers: false });
            if (!r)
                return undefined; // Fehlerantwort → nicht entscheidbar
            const u = r.data?.[0];
            const value = u ? { id: String(u.id), name: u.name } : null;
            this.cache.set(key, { at: Date.now(), value: value ? { ...value, displayName: value.name, description: '', created: null, isBanned: false, avatarUrl: null, profileUrl: '' } : null });
            return value;
        }
        catch {
            return undefined;
        }
    }
    /** Für die öffentliche Bewerbung: nur Name, Anzeigename und Bild (keine internen Daten wie Akten). */
    async publicLookup(input) {
        const p = await this.lookup(input);
        return p ? { id: p.id, name: p.name, displayName: p.displayName, avatarUrl: p.avatarUrl } : null;
    }
    /** Aktuelle Profilbeschreibung („Über mich“) – ohne Zwischenspeicher (Verifizierung). null = nicht erreichbar. */
    async description(id) {
        if (!ID.test(id))
            return null;
        try {
            const u = await this.get(`https://users.roblox.com/v1/users/${id}`);
            return u ? u.description ?? '' : null;
        }
        catch {
            return null;
        }
    }
    /** Gruppen-Ränge eines Kontos (Gruppen-ID → Rang 0–255) für Rollen-Bindungen; 1 Minute zwischengespeichert. */
    ranks = new Map();
    async groupRanks(id) {
        if (!ID.test(id) || process.env.ROBLOX_LOOKUP === 'off')
            return {};
        const hit = this.ranks.get(id);
        if (hit && Date.now() - hit.at < 60_000)
            return hit.value;
        try {
            const r = await this.get(`https://groups.roblox.com/v2/users/${id}/groups/roles`);
            if (!r)
                return hit?.value ?? {};
            const value = Object.fromEntries((r.data ?? []).filter((x) => x.group?.id && typeof x.role?.rank === 'number').map((x) => [String(x.group.id), x.role.rank]));
            if (this.ranks.size > 500)
                this.ranks.clear();
            this.ranks.set(id, { at: Date.now(), value });
            return value;
        }
        catch {
            return hit?.value ?? {};
        }
    }
    /**
     * Ausführliches Roblox-Profil für die Bürgerakte (öffentliche Roblox-APIs, 10 Minuten zwischengespeichert).
     * Jeder Teil kann einzeln fehlen (Roblox nicht erreichbar) – dann `null`, nie geraten.
     */
    details = new Map();
    async profileDetails(id) {
        if (!ID.test(id) || process.env.ROBLOX_LOOKUP === 'off')
            return null;
        const hit = this.details.get(id);
        if (hit && Date.now() - hit.at < TTL)
            return hit.value;
        const safe = (p) => p.catch(() => null);
        const thumb = (r) => { const t = r?.data?.[0]; return t?.state === 'Completed' && t.imageUrl?.startsWith('https://') ? t.imageUrl : null; };
        const count = (r) => (typeof r?.count === 'number' ? r.count : null);
        const [u, body, head, friends, followers, following, groups, history] = await Promise.all([
            safe(this.get(`https://users.roblox.com/v1/users/${id}`)),
            safe(this.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=420x420&format=Png&isCircular=false`)),
            safe(this.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`)),
            safe(this.get(`https://friends.roblox.com/v1/users/${id}/friends/count`)),
            safe(this.get(`https://friends.roblox.com/v1/users/${id}/followers/count`)),
            safe(this.get(`https://friends.roblox.com/v1/users/${id}/followings/count`)),
            safe(this.get(`https://groups.roblox.com/v2/users/${id}/groups/roles`)),
            safe(this.get(`https://users.roblox.com/v1/users/${id}/username-history?limit=10&sortOrder=Desc`)),
        ]);
        if (!u?.id) {
            this.details.set(id, { at: Date.now(), value: null });
            return null;
        }
        const value = {
            id: String(u.id), name: u.name, displayName: u.displayName, description: (u.description ?? '').slice(0, 1000), created: u.created ?? null,
            isBanned: !!u.isBanned, verified: !!u.hasVerifiedBadge, profileUrl: `https://www.roblox.com/users/${u.id}/profile`,
            avatarUrl: thumb(body), headshotUrl: thumb(head),
            friends: count(friends), followers: count(followers), following: count(following),
            groups: groups?.data ? groups.data.filter((g) => g.group?.id && g.group.name).slice(0, 25).map((g) => ({ id: String(g.group.id), name: g.group.name, role: g.role?.name ?? null, rank: g.role?.rank ?? null, memberCount: g.group.memberCount ?? null })) : null,
            previousNames: history?.data ? history.data.map((h) => h.name).filter((x) => !!x && x !== u.name) : null,
            fetchedAt: new Date().toISOString(),
        };
        if (this.details.size > 500)
            this.details.clear();
        this.details.set(id, { at: Date.now(), value });
        return value;
    }
    /** Kopfbilder für viele Roblox-IDs mit einer Anfrage (Kartenansicht); 10 Minuten zwischengespeichert, Fehler → keine Bilder. */
    heads = new Map();
    async headshots(ids) {
        const out = new Map();
        if (process.env.ROBLOX_LOOKUP === 'off')
            return out;
        const want = [...new Set(ids.filter((i) => ID.test(i)))];
        const missing = want.filter((i) => { const h = this.heads.get(i); return !h || Date.now() - h.at >= TTL; });
        if (missing.length) {
            try {
                const r = await this.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${missing.slice(0, 100).join(',')}&size=150x150&format=Png&isCircular=false`);
                if (this.heads.size > 2000)
                    this.heads.clear();
                for (const i of missing)
                    this.heads.set(i, { at: Date.now(), url: null });
                for (const t of r?.data ?? [])
                    if (t.targetId && t.state === 'Completed' && t.imageUrl?.startsWith('https://'))
                        this.heads.set(String(t.targetId), { at: Date.now(), url: t.imageUrl });
            }
            catch { /* Roblox nicht erreichbar – Karten zeigen dann Initialen */ }
        }
        for (const i of want) {
            const u = this.heads.get(i)?.url;
            if (u)
                out.set(i, u);
        }
        return out;
    }
    async fetchProfile(p) {
        try {
            let id = p.id;
            if (!id) {
                const r = await this.get('https://users.roblox.com/v1/usernames/users', { usernames: [p.name], excludeBannedUsers: false });
                const found = r?.data?.[0]?.id;
                if (!found)
                    return null;
                id = String(found);
            }
            const [u, thumb] = await Promise.all([
                this.get(`https://users.roblox.com/v1/users/${id}`),
                this.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`).catch(() => null),
            ]);
            if (!u?.id)
                return null;
            const img = thumb?.data?.[0];
            return {
                id: String(u.id), name: u.name, displayName: u.displayName, description: (u.description ?? '').slice(0, 1000), created: u.created ?? null, isBanned: !!u.isBanned,
                avatarUrl: img?.state === 'Completed' && img.imageUrl?.startsWith('https://') ? img.imageUrl : null,
                profileUrl: `https://www.roblox.com/users/${u.id}/profile`,
            };
        }
        catch {
            return null;
        }
    }
    async get(url, body) {
        const res = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) } : { signal: AbortSignal.timeout(6000) });
        if (!res.ok)
            return null;
        return res.json();
    }
};
exports.RobloxService = RobloxService;
exports.RobloxService = RobloxService = RobloxService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RobloxService);
//# sourceMappingURL=roblox.service.js.map