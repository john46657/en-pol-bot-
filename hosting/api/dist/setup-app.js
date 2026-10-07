"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApp = configureApp;
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const express_1 = require("express");
const swagger_1 = require("@nestjs/swagger");
const env_1 = require("./config/env");
const zod_de_1 = require("./common/zod-de");
function configureApp(app) {
    (0, zod_de_1.installGermanZodErrors)(); // deutsche Zod-Meldungen in Validierungsfehlern
    const env = (0, env_1.loadEnv)();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'readiness'] });
    const httpsOnly = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production';
    // Ohne HTTPS dürfen CSP/HSTS die Seite nicht auf https „hochziehen“ (sonst laden Assets nicht).
    app.use((0, helmet_1.default)({ contentSecurityPolicy: { useDefaults: true, directives: { 'img-src': ["'self'", 'data:', 'blob:', 'https://cdn.discordapp.com', 'https://*.rbxcdn.com', 'https://api.erlc.gg'], ...(httpsOnly ? {} : { 'upgrade-insecure-requests': null }) } }, hsts: httpsOnly }));
    app.use((0, cookie_parser_1.default)());
    const express = app.getHttpAdapter().getInstance();
    express.set('trust proxy', 1);
    express.disable('x-powered-by');
    if (env.WEB_DIST && (0, node_fs_1.existsSync)(node_path_1.default.join(env.WEB_DIST, 'index.html'))) {
        const index = node_path_1.default.resolve(env.WEB_DIST, 'index.html');
        express.use((0, express_1.static)(node_path_1.default.resolve(env.WEB_DIST), { index: false, maxAge: '1h' }));
        // SPA-Fallback nur für Seiten-Navigation (GET, kein Dateiname, nicht API/WS/Health)
        express.use((req, res, next) => {
            if (req.method !== 'GET' || /^\/(api|ws|health|readiness)(\/|$)/.test(req.path) || node_path_1.default.extname(req.path))
                return next();
            res.sendFile(index);
        });
    }
    app.enableCors({ origin: env.WEB_ORIGIN.split(','), credentials: true });
    if (env.ENABLE_SWAGGER ? env.ENABLE_SWAGGER === 'true' : env.NODE_ENV === 'development') {
        const doc = swagger_1.SwaggerModule.createDocument(app, new swagger_1.DocumentBuilder().setTitle('EN Polizei API').setVersion('0.1.0').addCookieAuth('enrp_session').build());
        swagger_1.SwaggerModule.setup('api/docs', app, doc);
    }
    app.enableShutdownHooks();
}
//# sourceMappingURL=setup-app.js.map