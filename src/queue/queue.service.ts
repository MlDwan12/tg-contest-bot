import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('post-edit') private readonly postEditQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await (await this.postEditQueue.client).ping();
    } catch (err) {
      this.logger.error('❌ Redis connection failed', err);
    }
  }
}
