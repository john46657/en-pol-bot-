"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const client_1 = require("@prisma/client");
/** Deutsche Standardmeldungen für Framework-Fehler ohne eigenen Code. */
const GENERIC = {
    400: 'Ungültige Anfrage.',
    401: 'Bitte melde dich an.',
    403: 'Dafür fehlt dir die Berechtigung.',
    404: 'Diese Seite bzw. Schnittstelle gibt es nicht.',
    405: 'Diese Aktion ist hier nicht erlaubt.',
    413: 'Die Anfrage ist zu groß.',
    415: 'Dieses Format wird nicht unterstützt.',
    429: 'Zu viele Anfragen – bitte kurz warten.',
};
/** Einheitliches Fehlerformat {code, message, requestId}; niemals Stacktraces nach außen. */
let AllExceptionsFilter = class AllExceptionsFilter {
    log = new common_1.Logger('Errors');
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        const req = ctx.getRequest();
        const requestId = req.requestId ?? 'unknown';
        let status = 500;
        let code = 'INTERNAL_ERROR';
        let message = 'Ein unerwarteter Fehler ist aufgetreten.';
        let details;
        if (exception instanceof shared_1.InvalidTransitionError) {
            status = 409;
            code = 'INVALID_TRANSITION';
            message = `Der Statuswechsel von ${exception.from} nach ${exception.to} ist nicht möglich.`;
        }
        else if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const body = exception.getResponse();
            if (typeof body === 'object' && body && 'code' in body) {
                const b = body;
                code = b.code;
                message = b.message;
                details = b.details;
            }
            else {
                code = status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'PERMISSION_DENIED' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'ERROR';
                // Meldungen von Nest/Express (z. B. „Cannot GET /x“, Throttler, Body-Parser) sind englisch → deutscher Standardtext je Status
                message = GENERIC[status] ?? (status >= 500 ? 'Ein unerwarteter Fehler ist aufgetreten.' : 'Die Anfrage konnte nicht verarbeitet werden.');
            }
        }
        else if (exception instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (exception.code === 'P2002') {
                status = 409;
                code = 'CONFLICT';
                message = 'Ein Datensatz mit diesen Werten existiert bereits.';
            }
            else if (exception.code === 'P2025') {
                status = 404;
                code = 'NOT_FOUND';
                message = 'Datensatz nicht gefunden.';
            }
            else
                this.log.error({ requestId, prisma: exception.code }, 'prisma error');
        }
        else {
            this.log.error({ requestId, err: exception instanceof Error ? exception.message : String(exception) }, 'unhandled');
        }
        if (status === 403 || status === 401) {
            // wird vom SecurityEvent-Interceptor/Guard bereits protokolliert
        }
        res.status(status).json({ code, message, requestId, ...(details !== undefined && status < 500 ? { details } : {}) });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map