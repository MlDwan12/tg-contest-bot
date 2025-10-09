import { forwardRef, Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ContestModule } from 'src/contest/contest.module';
import { UsersModule } from 'src/users/users.module';
import { ContestUpdate } from './contest.update';
import { TelegramService } from './telegram.service';
import { session } from 'telegraf';
import { ContestParticipationModule } from '../contest-participation/contest-participation.module';
import { ChannelModule } from 'src/channel/channel.module';
import { BullModule } from '@nestjs/bullmq';
import {
  PostEditProcessor,
  SubscriptionCheckProcessor,
} from '../queue/post-edit.processor';
import { QueueModule } from 'src/queue/queue.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('BOT_TOKEN', ''),
        middlewares: [session()],
      }),
    }),

    forwardRef(() => UsersModule),
    forwardRef(() => ChannelModule),
    forwardRef(() => ContestModule),
    forwardRef(() => ContestParticipationModule),
    QueueModule,
    BullModule.registerQueue({ name: 'post-edit' }),
  ],
  providers: [
    ContestUpdate,
    TelegramService,
    PostEditProcessor,
    SubscriptionCheckProcessor,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
