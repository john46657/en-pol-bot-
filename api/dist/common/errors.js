"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
const common_1 = require("@nestjs/common");
const STATUS = {
    UNAUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404, VALIDATION_FAILED: 400,
    CONFLICT: 409, INVALID_TRANSITION: 409, RATE_LIMITED: 429, INTERNAL_ERROR: 500,
    CAPABILITY_UNAVAILABLE: 503, ORIGIN_REJECTED: 403,
};
class AppError extends common_1.HttpException {
    code;
    details;
    constructor(code, message, details) {
        super({ code, message, details }, STATUS[code] ?? common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        this.code = code;
        this.details = details;
    }
}
exports.AppError = AppError;
//# sourceMappingURL=errors.js.map