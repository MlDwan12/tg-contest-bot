import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueCleaner implements OnModuleInit {
  constructor(
    @InjectQueue('subscription-check') private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'production') {
      await this.queue.obliterate({ force: true }); // или drain()
      console.log('Очередь subscription-check очищена при старте 🚀');
    }
  }
}
