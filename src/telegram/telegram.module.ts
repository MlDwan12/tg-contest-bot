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
  ],
  providers: [ContestUpdate, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
