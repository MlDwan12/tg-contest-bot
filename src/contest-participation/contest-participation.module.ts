import { forwardRef, Module } from '@nestjs/common';
import { ContestParticipationService } from './contest-participation.service';
import { ContestParticipationController } from './contest-participation.controller';
import { ContestParticipation } from './entities/contest-participation.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { ContestModule } from 'src/contest/contest.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from 'src/core/redis/redis.module';
import { ContestSyncService } from './contestSyncService';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContestParticipation]),
    forwardRef(() => TelegramModule),
    forwardRef(() => ContestModule),
    forwardRef(() => UsersModule),
    BullModule.registerQueue({
      name: 'subscription-check',
    }),
    BullModule.registerQueue({
      name: 'post-edit',
      // limiter: {
      //   max: 1, // не более 1 задачи
      //   duration: 1000, // в течение 1 секунды
      // },
    }),
    RedisModule,
  ],
  controllers: [ContestParticipationController],
  providers: [ContestParticipationService, ContestSyncService],
  exports: [ContestParticipationService],
})
export class ContestParticipationModule {}
