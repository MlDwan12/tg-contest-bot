import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as basicAuth from 'express-basic-auth';
import { TelegramService } from './telegram/telegram.service';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // 🛡️ Helmet, но "лайтовый" режим, поменять для прода
  if (process.env.NODE_ENV === 'production') {
    app.use(
      helmet({
        contentSecurityPolicy: { useDefaults: true },
      }),
    );
  } else {
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      }),
    );
  }

  // Cookie parser & trust proxy
  app.use(cookieParser());
  app.set('trust proxy', 1);

  // Request logger
  app.use((req, res, next) => {
    logger.log(`${req.method} ${req.originalUrl}`, 'IncomingRequest');
    next();
  });

  // Swagger Basic Auth
  const swaggerUser = process.env.SWAGGER_USER;
  const swaggerPassword = process.env.SWAGGER_PASSWORD;
  if (!swaggerUser || !swaggerPassword) {
    throw new Error('SWAGGER_USER and SWAGGER_PASSWORD must be defined');
  }

  app.use(
    ['/api/docs', '/api/docs-json'],
    basicAuth({
      challenge: true,
      users: { [swaggerUser]: swaggerPassword },
    }),
  );

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('RollCube API')
    .setDescription('Документация REST API для RollCube')
    .setVersion('1.0')
    // .addBearerAuth()
    .addCookieAuth('accessTokenCookie', {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
      description: 'JWT access token cookie',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['https://rollcube.ru'],
    credentials: true,
    exposedHeaders: ['set-cookie'],
  });

  const port = process.env.PORT ?? 3000;
  const domain = process.env.DOMAIN ?? 'http://localhost';

  try {
    // Проверка БД
    const dataSource = app.get(DataSource);
    await dataSource.query('SELECT 1');
    logger.log('✅ Database connected', 'Bootstrap');

    // Проверка Telegram-бота
    const telegramService = app.get(TelegramService);
    await telegramService.checkHealth();
    logger.log('✅ Telegram bot ready', 'Bootstrap');
  } catch (error) {
    logger.error(`❌ Startup check failed: ${error.message}`, error.stack);
    process.exit(1); // ⚡ Заваливаем приложение, если критическая ошибка
  }

  // app.enableVersioning({
  //   type: VersioningType.URI,
  //   defaultVersion: '1',
  // });

  // --- Запуск сервера ---
  await app.listen(port);
  logger.log(`🚀 Server running on ${domain}:${port}`);
  logger.log(`📖 Swagger docs: ${domain}:${port}/api/docs`);
}

void bootstrap();
