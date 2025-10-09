import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService } from '../telegram/telegram.service';

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
