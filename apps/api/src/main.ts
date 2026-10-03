import 'reflect-metadata';
import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap(): Promise<void> {
  const port = Number(process.env['API_PORT'] ?? 3000);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(cookieParser());
  app.useLogger(new Logger());
  app.setGlobalPrefix('api/v1');

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
    allowedHeaders: ['Authorization', 'Content-Type', 'Cookie'],
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
