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
exports.MediaService = exports.MAX_BYTES = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const env_1 = require("../config/env");
exports.MAX_BYTES = 10 * 1024 * 1024;
/** MIME-Allowlist inkl. Magic-Byte-Signatur. Der vom Client gemeldete Typ allein wird NIE vertraut. */
const SIGNATURES = {
    'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/gif': (b) => b.subarray(0, 4).toString('ascii') === 'GIF8',
    'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
    'application/pdf': (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
    'text/plain': (b) => !b.subarray(0, 4096).includes(0),
};
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/plain': 'txt' };
/** Welche Permission zum Anhängen/Ansehen an einem Entitätstyp nötig ist. */
const WRITE = { Evidence: 'evidence.create', Report: 'reports.create', Complaint: 'complaints.create', Incident: 'incidents.edit', Person: 'persons.edit', Investigation: 'investigations.edit', Vehicle: 'vehicles.edit' };
const READ = { Evidence: 'evidence.view', Report: 'reports.view', Complaint: 'complaints.view', Incident: 'incidents.view', Person: 'persons.view', Investigation: 'investigations.view', Vehicle: 'vehicles.view' };
let MediaService = class MediaService {
    prisma;
    audit;
    perms;
    dir = node_path_1.default.resolve((0, env_1.loadEnv)().STORAGE_DIR);
    constructor(prisma, audit, perms) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
    }
    async upload(actor, file, link) {
        const need = WRITE[link.linkedType];
        if (!need)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Unsupported linkedType.');
        await this.perms.assert(actor.userId, need);
        if (file.size > exports.MAX_BYTES || file.buffer.length > exports.MAX_BYTES)
            throw new errors_1.AppError('VALIDATION_FAILED', 'File too large (max 10 MB).');
        const check = SIGNATURES[file.mimetype];
        if (!check || !check(file.buffer))
            throw new errors_1.AppError('VALIDATION_FAILED', 'File type not allowed or content does not match its type.');
        const hash = (0, node_crypto_1.createHash)('sha256').update(file.buffer).digest('hex');
        const storageKey = `${(0, node_crypto_1.randomUUID)()}.${EXT[file.mimetype]}`; // Zufallsname + feste Endung: Dateinamen des Clients landen nie im Dateisystem
        await (0, promises_1.mkdir)(this.dir, { recursive: true });
        await (0, promises_1.writeFile)(node_path_1.default.join(this.dir, storageKey), file.buffer, { mode: 0o640 });
        const safeName = node_path_1.default.basename(file.originalname).replace(/[^\w.\- ]/g, '_').slice(0, 120);
        return this.prisma.$transaction(async (tx) => {
            const m = await tx.media.create({ data: { originalName: safeName, mime: file.mimetype, size: file.size, hash, storageKey, uploaderId: actor.userId, linkedType: link.linkedType, linkedId: link.linkedId } });
            await this.audit.record(actor, { action: 'media.upload', module: 'media', entityType: 'Media', entityId: m.id, after: { linkedType: m.linkedType, linkedId: m.linkedId, mime: m.mime, size: m.size, hash } }, tx);
            return { id: m.id, originalName: m.originalName, mime: m.mime, size: m.size, hash: m.hash };
        });
    }
    async download(actor, id) {
        const m = await this.prisma.media.findUnique({ where: { id } });
        const need = m?.linkedType ? READ[m.linkedType] : undefined;
        // Ohne Leserecht auf die verknüpfte Entität verhält sich die Datei wie nicht vorhanden.
        if (!m || !need || !(await this.perms.has(actor.userId, need)))
            throw new errors_1.AppError('NOT_FOUND', 'File not found.');
        return { media: m, data: await (0, promises_1.readFile)(node_path_1.default.join(this.dir, m.storageKey)) };
    }
    list(actor, linkedType, linkedId) {
        return this.perms.assert(actor.userId, READ[linkedType] ?? '!none').then(() => this.prisma.media.findMany({ where: { linkedType, linkedId }, select: { id: true, originalName: true, mime: true, size: true, hash: true, createdAt: true }, orderBy: { createdAt: 'desc' } }));
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService])
], MediaService);
//# sourceMappingURL=media.service.js.map