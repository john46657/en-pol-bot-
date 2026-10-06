"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webUrl = void 0;
const env_1 = require("../config/env");
/** Link ins Web-Dashboard (erste Adresse aus WEB_ORIGIN), z. B. für „Im Dashboard ansehen“ in Discord. */
const webUrl = (path) => `${(0, env_1.loadEnv)().WEB_ORIGIN.split(',')[0].trim().replace(/\/+$/, '')}${path}`;
exports.webUrl = webUrl;
//# sourceMappingURL=web-url.js.map