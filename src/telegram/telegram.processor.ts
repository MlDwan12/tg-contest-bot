import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { TelegramService } from './telegram.service';
import { Contest } from 'src/contest/entities/contest.entity';

interface EditPostJobData {
  channelId: string;
  messageId: number;
  contest: Contest;
  newName?: string;
  newText?: string;
  newImageUrl?: string;
  buttonText?: string;
}

@Processor('contest')
export class TelegramProcessor {
  constructor(private readonly telegramService: TelegramService) {}

  @Process('editPost')
  async handleEditPost(job: Job<EditPostJobData>) {
    const {
      channelId,
      messageId,
      contest,
      newName,
      newText,
      newImageUrl,
      buttonText,
    } = job.data;
    return this.telegramService.editPost(
      channelId,
      messageId,
      contest,
      newName,
      newText,
      newImageUrl,
      buttonText,
    );
  }
}
