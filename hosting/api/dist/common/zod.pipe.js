"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zodBody = exports.ZodPipe = void 0;
const errors_1 = require("./errors");
const zod_de_1 = require("./zod-de");
(0, zod_de_1.installGermanZodErrors)();
class ZodPipe {
    schema;
    constructor(schema) {
        this.schema = schema;
    }
    transform(value) {
        const r = this.schema.safeParse(value);
        if (!r.success) {
            throw new errors_1.AppError('VALIDATION_FAILED', 'Die Eingaben sind ungültig.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
        }
        return r.data;
    }
}
exports.ZodPipe = ZodPipe;
const zodBody = (schema) => new ZodPipe(schema);
exports.zodBody = zodBody;
//# sourceMappingURL=zod.pipe.js.map