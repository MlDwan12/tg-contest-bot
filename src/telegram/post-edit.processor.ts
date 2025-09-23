import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService } from './telegram.service';

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

    try {
      if (job.name === 'edit') {
        const {
          channelId,
          messageId,
          contest,
          newName,
          newText,
          newImageUrl,
          buttonText,
        } = job.data;

        this.logger.log(
          `Редактирование поста: channelId=${channelId}, messageId=${messageId}`,
        );

        const result = await this.telegramService.editPost(
          channelId,
          messageId,
          contest,
          newName,
          newText,
          newImageUrl,
          buttonText,
        );

        this.logger.log(
          `Задача ${job.id} успешно выполнена: messageId=${messageId}`,
        );
        this.logger.debug(`Результат: ${JSON.stringify(result)}`);
        return result;
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при обработке задачи ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error; // пробрасываем дальше, чтобы очередь отметила задачу как failed
    }
  }
}
