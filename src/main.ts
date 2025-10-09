import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as basicAuth from 'express-basic-auth';
import { TelegramService } from './telegram/telegram.service';
import { DataSource } from 'typeorm';

import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { DiscoveryService, ModuleRef } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Универсальная функция очистки всех Bull очередей в приложении.
 * Очищает завершённые, неудавшиеся, активные, отложенные и ожидающие задачи.
 * Безопасно игнорирует отсутствующие или недоступные очереди.
 */
export async function clearAllBullQueues(
  app: NestExpressApplication,
  logger: Logger,
) {
  try {
    const discoveryService = app.get(DiscoveryService, { strict: false });
    const moduleRef = app.get(ModuleRef, { strict: false });

    // Получаем все возможные токены провайдеров
    const providers = discoveryService.getProviders();

    const bullQueues: Queue[] = [];

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance) continue;

      // Проверяем, является ли инстанс очередью Bull
      if (instance instanceof Queue && instance.name) {
        bullQueues.push(instance);
      }
    }

    // Если DiscoveryService не нашёл очереди, пробуем по токенам Bull
    if (bullQueues.length === 0) {
      // Попробуем через getQueueToken() с перебором
      const potentialQueues = [
        'default',
        'email',
        'notifications',
        'sms',
        'telegram',
        'tasks',
      ];
      for (const name of potentialQueues) {
        try {
          const q = app.get<Queue>(getQueueToken(name));
          if (q) bullQueues.push(q);
        } catch {
          console.log('aaaa');
        }
      }
    }

    if (bullQueues.length === 0) {
      logger.warn('⚠️ No Bull queues found for cleanup', 'Bull');
      return;
    }

    logger.log(
      `🧹 Found ${bullQueues.length} Bull queue(s). Starting cleanup...`,
      'Bull',
    );

    for (const queue of bullQueues) {
      const name = queue.name;
      try {
        // чистим очереди разных статусов
        await Promise.allSettled([
          queue.clean(0, 1000, 'completed'),
          queue.clean(0, 1000, 'failed'),
          queue.clean(0, 1000, 'wait'),
          queue.clean(0, 1000, 'active'),
          queue.clean(0, 1000, 'delayed'),
        ]);

        // опционально — полная очистка очереди (в DEV!)
        if (process.env.NODE_ENV !== 'production') {
          await queue.obliterate({ force: true }).catch(() => null);
        }

        logger.log(`✅ Queue "${name}" cleaned`, 'Bull');
      } catch (err) {
        logger.error(
          `❌ Failed to clean queue "${name}": ${err.message}`,
          err.stack,
          'Bull',
        );
      }
    }
  } catch (error) {
    logger.error(
      `❌ Bull cleanup failed: ${error.message}`,
      error.stack,
      'Bull',
    );
  }
}

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

  await clearAllBullQueues(app, logger);
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
