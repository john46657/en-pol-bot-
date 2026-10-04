"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentActor = exports.CurrentUser = exports.RequirePermission = exports.BotService = exports.Public = exports.BOT_SERVICE_KEY = exports.PERMISSION_KEY = exports.PUBLIC_KEY = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
exports.PUBLIC_KEY = 'isPublic';
exports.PERMISSION_KEY = 'requiredPermissions';
exports.BOT_SERVICE_KEY = 'botService';
const Public = () => (0, common_1.SetMetadata)(exports.PUBLIC_KEY, true);
exports.Public = Public;
/** Route nur für den Discord-Bot-Dienst (Bot-Token, kein Benutzerkontext). */
const BotService = () => (0, common_1.SetMetadata)(exports.BOT_SERVICE_KEY, true);
exports.BotService = BotService;
/** Alle genannten Permissions werden benötigt. */
const RequirePermission = (...p) => (0, common_1.SetMetadata)(exports.PERMISSION_KEY, p);
exports.RequirePermission = RequirePermission;
exports.CurrentUser = (0, common_2.createParamDecorator)((_d, ctx) => ctx.switchToHttp().getRequest().user);
exports.CurrentActor = (0, common_2.createParamDecorator)((_d, ctx) => {
    const r = ctx.switchToHttp().getRequest();
    return { userId: r.user?.id ?? null, robloxUserId: r.user?.robloxUserId ?? null, requestId: r.requestId };
});
//# sourceMappingURL=decorators.js.map