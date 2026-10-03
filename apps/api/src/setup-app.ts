import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadEnv } from './config/env';

export function configureApp(app: INestApplication) {
  const env = loadEnv();
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'readiness'] });
  app.use(helmet());
  app.use(cookieParser());
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.enableCors({ origin: env.WEB_ORIGIN.split(','), credentials: true });
  if (env.NODE_ENV !== 'test') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('ENRP NEXUS API').setVersion('0.1.0').addCookieAuth('enrp_session').build());
    SwaggerModule.setup('api/docs', app, doc);
  }
  app.enableShutdownHooks();
}
