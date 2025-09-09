import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.set('trust proxy', 1);
  app.use(cookieParser());

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

  app.enableCors({
    origin: [
      'https://www.rollcube.ru',
      'http://localhost:8945',
      'https://rollcube.ru',
      'https://d68dv7gb-3000.euw.devtunnels.ms/',
    ],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
