import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './setup-app';
import { loadEnv } from './config/env';
import { AdminService } from './admin/admin.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  await app.listen(env.PORT, env.HOST);
  new Logger('Bootstrap').log(`API lauscht auf ${env.HOST}:${env.PORT} (GET /health)`);
  if (env.NODE_ENV === 'production') {
    // Tägliche Aufbewahrungsregeln (Sessions, Login-Historie, gelesene Benachrichtigungen). Audit-Logs bleiben unberührt.
    const log = new Logger('Retention');
    const run = () => app.get(AdminService).runRetention({ userId: null, requestId: 'scheduler' }).then((r) => log.log(JSON.stringify(r))).catch((e: Error) => log.error(e.message));
    setTimeout(run, 60_000).unref();
    setInterval(run, 24 * 3_600_000).unref();
  }
}
// Sicherheitsnetz: ein vergessenes .catch() bei einer Hintergrund-Aufgabe darf nicht die ganze API (und das Dashboard) beenden
process.on('unhandledRejection', (e) => new Logger('Process').error(`unhandledRejection: ${e instanceof Error ? e.stack ?? e.message : String(e)}`));

void bootstrap();
