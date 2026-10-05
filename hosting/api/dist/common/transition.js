"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextStatus = nextStatus;
const shared_1 = require("@enrp/shared");
const errors_1 = require("./errors");
function nextStatus(map, from, to) {
    if (!(from in map))
        throw new errors_1.AppError('INVALID_TRANSITION', `Unknown status ${from}`);
    (0, shared_1.assertTransition)(map, from, to);
    return to;
}
//# sourceMappingURL=transition.js.map