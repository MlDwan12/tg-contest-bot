import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService } from '../telegram/telegram.service';

// PostEditProcessor
@Injectable()
@Processor('post-edit')
export class PostEditProcessor extends WorkerHost {
  private readonly logger = new Logger(PostEditProcessor.name);

  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Начало обработки задачи: ${job.id}, name=${job.name}`);
    this.logger.debug(`Данные задачи: ${JSON.stringify(job.data)}`);
    this.logger.debug(`Счетчик ===> : ${job.data.clickCount}`);

    try {
      const {
        channelId,
        messageId,
        contest,
        buttonText,
        newName,
        newText,
        newImageUrl,
      } = job.data;

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
          job.data.clickCount,
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
