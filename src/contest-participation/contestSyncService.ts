import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

@Injectable()
export class ContestSyncService {
  private readonly logger = new Logger(ContestSyncService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRedis() private readonly redisClient: Redis,
  ) {}

  async syncSomething() {
    const value = await this.redisClient.get('some_key');
    console.log('Redis value:', value);
  }

  // Каждые 5 минут (можно изменить)
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncContestParticipants() {
    this.logger.log('Начало синхронизации Redis-счётчиков с БД');

    try {
      // Получаем все конкурсы с Telegram ID (т.е. где есть посты)
      const contests = await this.dataSource.query(
        `SELECT id, "telegramMessageIds" 
         FROM contests 
         WHERE "telegramMessageIds" IS NOT NULL`,
      );

      for (const contest of contests) {
        const redisKey = `contest:participants:${contest.id}`;

        // Реальное количество участников
        const countResult = await this.dataSource.query(
          `SELECT COUNT(*) AS participant_count
           FROM contest_participations
           WHERE "contestId" = $1`,
          [contest.id],
        );

        const dbCount = Number(countResult[0].participant_count);

        // Обновляем Redis
        await this.redisClient.set(redisKey, dbCount, 'EX', 60 * 60 * 24);

        this.logger.log(
          `ContestId=${contest.id}, участники=${dbCount} → Redis обновлён`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при синхронизации Redis: ${error.message}`,
        error.stack,
      );
    }
  }
}
