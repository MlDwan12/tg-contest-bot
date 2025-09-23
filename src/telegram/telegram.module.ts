import { forwardRef, Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ContestModule } from 'src/contest/contest.module';
import { UsersModule } from 'src/users/users.module';
import { ContestUpdate } from './contest.update';
import { ContestParticipationModule } from 'src/contest-participation/contest-participation.module';
import { TelegramService } from './telegram.service';
import { session } from 'telegraf';
import { ChannelModule } from 'src/channel/channel.module';
import { RedisModule } from 'src/redis/redis.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule, forwardRef(() => ContestModule)],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('BOT_TOKEN', ''),
        middlewares: [session()],
      }),
    }),
    RedisModule,
    BullModule.registerQueue({ name: 'contest' }),
    forwardRef(() => UsersModule),
    forwardRef(() => ChannelModule),
    forwardRef(() => ContestModule),
    forwardRef(() => ContestParticipationModule),
  ],
  providers: [ContestUpdate, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
