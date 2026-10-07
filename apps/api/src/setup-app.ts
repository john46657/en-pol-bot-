import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { static as serveStatic, type Request, type Response, type NextFunction } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadEnv } from './config/env';
import { installGermanZodErrors } from './common/zod-de';

export function configureApp(app: INestApplication) {
  installGermanZodErrors(); // deutsche Zod-Meldungen in Validierungsfehlern
  const env = loadEnv();
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'readiness'] });
  const httpsOnly = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production';
  // Ohne HTTPS dürfen CSP/HSTS die Seite nicht auf https „hochziehen“ (sonst laden Assets nicht).
  app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'img-src': ["'self'", 'data:', 'blob:', 'https://cdn.discordapp.com', 'https://*.rbxcdn.com', 'https://api.erlc.gg'], ...(httpsOnly ? {} : { 'upgrade-insecure-requests': null }) } }, hsts: httpsOnly }));
  app.use(cookieParser());
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  if (env.WEB_DIST && existsSync(path.join(env.WEB_DIST, 'index.html'))) {
    const index = path.resolve(env.WEB_DIST, 'index.html');
    express.use(serveStatic(path.resolve(env.WEB_DIST), { index: false, maxAge: '1h' }));
    // SPA-Fallback nur für Seiten-Navigation (GET, kein Dateiname, nicht API/WS/Health)
    express.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || /^\/(api|ws|health|readiness)(\/|$)/.test(req.path) || path.extname(req.path)) return next();
      res.sendFile(index);
    });
  }
  app.enableCors({ origin: env.WEB_ORIGIN.split(','), credentials: true });
  if (env.ENABLE_SWAGGER ? env.ENABLE_SWAGGER === 'true' : env.NODE_ENV === 'development') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('EN Polizei API').setVersion('0.1.0').addCookieAuth('enrp_session').build());
    SwaggerModule.setup('api/docs', app, doc);
  }
  app.enableShutdownHooks();
}
