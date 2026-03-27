import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, QueueEvents } from 'bullmq';
import { TelegramService } from '../telegram/telegram.service';
import Redis from 'ioredis';

@Injectable()
@Processor('post-edit')
export class PostEditProcessor extends WorkerHost {
  private readonly logger = new Logger(PostEditProcessor.name);

  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Начало обработки задачи: ${job.id}, name=${job.name}`);

    try {
      const {
        channelId,
        messageId,
        contest,
        buttonText,
        newName,
        newText,
        newImageUrl,
        clickCount,
      } = job.data;
      console.log(job.name);
      console.log('clickCount====>', clickCount);

      if (job.name === 'edit-counter') {
        // Только обновляем кнопку/счётчик
        return await this.telegramService.editPost(
          channelId,
          messageId,
          contest,
          undefined,
          undefined,
          undefined,
          buttonText,
          clickCount,
        );
      }

      if (job.name === 'edit-admin') {
        // Полное редактирование админом

        return await this.telegramService.editPost(
          channelId,
          messageId,
          contest,
          newName,
          newText,
          newImageUrl,
          buttonText,
        );
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при обработке задачи ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

@Injectable()
@Processor('subscription-check')
export class SubscriptionCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionCheckProcessor.name);

  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    console.log(job.name);

    if (job.name !== 'subscription-check') return;
    const { telegramId, requiredGroups } = job.data;

    this.logger.debug(`Проверка подписки для telegramId=${telegramId}`);

    try {
      const isSubscribed = await this.telegramService.isUserSubscribed(
        requiredGroups,
        Number(telegramId),
      );
      return { telegramId, isSubscribed };
    } catch (error) {
      this.logger.error(
        `Ошибка проверки подписки для telegramId=${telegramId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

@Injectable()
@Processor('broadcast', {
  concurrency: 1,
  limiter: {
    max: 20,
    duration: 1000,
  },
})
export class BroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastProcessor.name);
  private redis = new Redis();

  constructor(private readonly telegramService: TelegramService) {
    super();
    this.setupQueueEvents();
  }

  async process(job: Job<any, any, string>) {
    const {
      broadcastId,
      telegramId,
      text,
      channelName,
      messageId,
      photoUrl,
      videoNoteUrl,
      buttonText,
      buttonUrl,
    } = job.data;
    this.logger.log(
      `[Processor] START jobId=${job.id} telegramId=${telegramId} broadcastId=${broadcastId}`,
    );
    const statsKey = `broadcast:${broadcastId}:stats`;
    console.log('JOB.DATA===>', job.data);

    try {
      await this.telegramService.sendPrivateMessage(
        telegramId,
        text,
        channelName,
        messageId,
        photoUrl,
        videoNoteUrl,
        buttonText,
        buttonUrl,
      );
      this.logger.log(
        `[Processor] SUCCESS jobId=${job.id} telegramId=${telegramId}`,
      );
      await this.redis.hincrby(statsKey, 'success', 1);
      this.logger.debug(`[Stats] broadcastId=${broadcastId} success++`);
    } catch (e) {
      if (e?.response?.error_code === 403) {
        this.logger.warn(`Пользователь ${telegramId} заблокировал бота`);
        await this.redis.hincrby(statsKey, 'blocked', 1);
        this.logger.debug(`[Stats] broadcastId=${broadcastId} blocked++`);
        return;
      }

      // 429 — Telegram limit → даём BullMQ ретраить
      if (e?.response?.error_code === 429) {
        const retryAfter = e.response.parameters?.retry_after ?? 5;

        throw new Error(`RATE_LIMIT:${retryAfter}`);
      }
      this.logger.error(
        `[Processor] FAIL jobId=${job.id} telegramId=${telegramId} code=${e?.response?.error_code || 'unknown'}`,
      );
      await this.redis.hincrby(statsKey, 'errors', 1);
      this.logger.debug(`[Stats] broadcastId=${broadcastId} errors++`);

      throw e;
    }
  }

  private setupQueueEvents() {
    const queueEvents = new QueueEvents('broadcast', {
      connection: { host: 'localhost', port: 6379 },
    });

    queueEvents.on('drained', async () => {
      this.logger.log(`[QueueEvent] Queue drained — все jobs обработаны`);

      const keys = await this.redis.keys('broadcast:*:stats');
      for (const key of keys) {
        const stats = await this.redis.hgetall(key);
        await this.telegramService.notifyAdmins(
          `✅ Рассылка завершена

📊 Статистика:
— Доставлено: ${stats.success ?? 0}
— Заблокированы (403): ${stats.blocked ?? 0}
— Ошибки: ${stats.errors ?? 0}
`,
        );
        await this.redis.del(key);
      }
    });
  }
}
