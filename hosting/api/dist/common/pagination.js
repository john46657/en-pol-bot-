"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pageResult = exports.skipTake = exports.pageQuery = void 0;
const zod_1 = require("zod");
exports.pageQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(500).default(25),
    q: zod_1.z.string().trim().max(100).optional(),
});
const skipTake = (p) => ({ skip: (p.page - 1) * p.pageSize, take: p.pageSize });
exports.skipTake = skipTake;
const pageResult = (items, total, p) => ({ items, total, page: p.page, pageSize: p.pageSize });
exports.pageResult = pageResult;
//# sourceMappingURL=pagination.js.map