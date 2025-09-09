import { forwardRef, Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ContestModule } from 'src/contest/contest.module';
import { UsersModule } from 'src/users/users.module';
import { ContestUpdate } from './contest.update';
import { ContestParticipationModule } from 'src/contest-participation/contest-participation.module';
import { TelegramService } from './telegram.service';
import { session } from 'telegraf';

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
    UsersModule,
    forwardRef(() => ContestModule),
    forwardRef(() => ContestParticipationModule),
  ],
  providers: [ContestUpdate, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
