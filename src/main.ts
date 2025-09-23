import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as basicAuth from 'express-basic-auth';
import { TelegramService } from './telegram/telegram.service';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.use((req, res, next) => {
    console.log('--- Incoming Request ---');
    console.log('Protocol:', req.protocol); // http или https
    console.log('Headers X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
    console.log('Secure:', req.secure); // true, если https
    console.log('Host:', req.headers.host);
    console.log('Cookies:', req.headers.cookie);
    console.log('-------------------------');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.set('trust proxy', 1);
  app.use(cookieParser());

  app.enableCors({
    origin: [
      'https://www.rollcube.ru',
      'http://localhost:8945',
      'https://rollcube.ru',
      'https://d68dv7gb-3000.euw.devtunnels.ms/',
    ],
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

    const redis = new Redis({
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
    });

    const ping = await redis.ping();
    if (ping !== 'PONG') {
      throw new Error('Redis did not respond with PONG');
    }
    logger.log('✅ Redis connected', 'Bootstrap');

    await redis.quit();
  } catch (error) {
    logger.error(`❌ Startup check failed: ${error.message}`, error.stack);
    process.exit(1);
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
