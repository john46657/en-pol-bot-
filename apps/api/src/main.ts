import 'reflect-metadata';
import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { checkSecurityConfig } from './common/security/config-check.js';

async function bootstrap(): Promise<void> {
  const port = Number(process.env['API_PORT'] ?? 3000);

  // Sicherheitsrelevante Konfiguration prüfen: in Produktion sind Fehler fatal
  const issues = checkSecurityConfig(process.env);
  for (const i of issues) new Logger('Security').warn(`${i.level === 'error' ? 'FEHLER' : 'Warnung'}: ${i.message}`);
  if (issues.some((i) => i.level === 'error')) throw new Error('Unsichere Konfiguration – Start abgebrochen (siehe Meldungen oben).');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.disable('x-powered-by');
  // Hinter einem Reverse-Proxy (z. B. nginx) die echte Client-IP für Rate Limits verwenden
  if (process.env['TRUST_PROXY']) app.set('trust proxy', process.env['TRUST_PROXY'] === 'true' ? 1 : Number(process.env['TRUST_PROXY']) || process.env['TRUST_PROXY']);
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '64kb', extended: false });

  app.use(cookieParser());
  app.useLogger(new Logger());
  app.setGlobalPrefix('api/v1');
  // Kurzadresse für Überwachungswerkzeuge: /health → /api/v1/health
  app.use('/health', (_req: unknown, res: { redirect(code: number, url: string): void }) => res.redirect(307, '/api/v1/health'));

  // Validierung: globale Pipeline → DTOs werden überall geprüft (§78)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: (process.env['DASHBOARD_URL'] ?? 'http://localhost:3001').split(','),
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Cookie', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
  });

  // OpenAPI / Swagger (§1: OpenAPI/Swagger)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('NEXUS API')
    .setDescription(
      'NEXUS – Discord Operating System · REST API (alle Anfragen sind Guild-scoped, §113)',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  new Logger('Bootstrap').log(`NEXUS API läuft auf http://localhost:${port}/api/v1 (Docs: /docs)`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('API konnte nicht starten:', error);
  process.exit(1);
});
