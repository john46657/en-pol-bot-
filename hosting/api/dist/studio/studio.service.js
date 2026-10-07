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
exports.StudioService = exports.ACCENTS = void 0;
const guild_context_1 = require("../common/guild-context");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const custom_fields_1 = require("./custom-fields");
/** Vorgaben (Namen); zusätzlich ist jede eigene Farbe `#rrggbb` erlaubt (Studio → Design). */
exports.ACCENTS = ['blue', 'green', 'amber', 'red', 'cyan', 'violet', 'orange', 'pink', 'indigo', 'teal', 'lime', 'sky', 'rose', 'emerald', 'gold', 'slate'];
let StudioService = class StudioService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async setting(key, fallback) {
        const g = (0, guild_context_1.currentGuild)(); // Server-eigener Wert (z. B. Name, Akzentfarbe) vor dem gemeinsamen
        const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: (0, guild_context_1.scopedKey)(key, g) } }) : null;
        return (own ?? (await this.prisma.systemSetting.findUnique({ where: { key } })))?.value ?? fallback;
    }
    async config() {
        const [customFields, accent, name, customAccents] = await Promise.all([
            this.setting('studio.customFields', { persons: [], vehicles: [] }),
            this.setting('theme.accent', 'blue'),
            this.setting('org.name', 'EN Polizei'),
            this.setting('theme.customAccents', []),
        ]);
        return { org: { name }, theme: { accent, customAccents }, customFields };
    }
    async defs(entity) {
        return (await this.setting('studio.customFields', { persons: [], vehicles: [] }))[entity] ?? [];
    }
    /** Liefert bereinigte Custom-Werte oder wirft 400 mit allen Fehlern. */
    async check(entity, values, existing) {
        const defs = await this.defs(entity);
        if (!defs.length && !values)
            return undefined;
        const r = (0, custom_fields_1.validateCustom)(defs, values, existing);
        if (!r.ok)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Die Zusatzfelder sind ungültig.', r.errors.map((m) => ({ path: 'custom', message: m })));
        return r.value;
    }
};
exports.StudioService = StudioService;
exports.StudioService = StudioService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StudioService);
//# sourceMappingURL=studio.service.js.map