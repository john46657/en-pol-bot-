"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const setup_app_1 = require("./setup-app");
const env_1 = require("./config/env");
const admin_service_1 = require("./admin/admin.service");
const common_1 = require("@nestjs/common");
async function bootstrap() {
    const env = (0, env_1.loadEnv)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { rawBody: true });
    (0, setup_app_1.configureApp)(app);
    await app.listen(env.PORT, env.HOST);
    new common_1.Logger('Bootstrap').log(`API lauscht auf ${env.HOST}:${env.PORT} (GET /health)`);
    if (env.NODE_ENV === 'production') {
        // Tägliche Aufbewahrungsregeln (Sessions, Login-Historie, gelesene Benachrichtigungen). Audit-Logs bleiben unberührt.
        const log = new common_1.Logger('Retention');
        const run = () => app.get(admin_service_1.AdminService).runRetention({ userId: null, requestId: 'scheduler' }).then((r) => log.log(JSON.stringify(r))).catch((e) => log.error(e.message));
        setTimeout(run, 60_000).unref();
        setInterval(run, 24 * 3_600_000).unref();
    }
}
// Sicherheitsnetz: ein vergessenes .catch() bei einer Hintergrund-Aufgabe darf nicht die ganze API (und das Dashboard) beenden
process.on('unhandledRejection', (e) => new common_1.Logger('Process').error(`unhandledRejection: ${e instanceof Error ? e.stack ?? e.message : String(e)}`));
void bootstrap();
//# sourceMappingURL=main.js.map