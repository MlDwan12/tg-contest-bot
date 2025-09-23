// src/redis/redis.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
    });

    this.client
      .ping()
      .then((res) =>
        res === 'PONG'
          ? this.logger.log('✅ Redis connected')
          : this.logger.error('❌ Redis ping failed'),
      )
      .catch((err) =>
        this.logger.error(`❌ Redis connection error: ${err.message}`),
      );
  }

  onModuleDestroy() {
    this.client.quit();
  }
}
