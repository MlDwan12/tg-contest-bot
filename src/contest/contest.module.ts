import { forwardRef, Module } from '@nestjs/common';
import { ContestService } from './contest.service';
import { ContestController } from './contest.controller';
import { Contest } from './entities/contest.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestParticipationModule } from 'src/contest-participation/contest-participation.module';
import { ContestWinner } from './entities/contest_winners.entity';
import { TelegramModule } from 'src/telegram/telegram.module';
import { ChannelModule } from 'src/channel/channel.module';
import { AdminModule } from 'src/admin/admin.module';
import { CronModule } from 'src/cron/cron.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contest, ContestWinner]),
    ContestParticipationModule,
    ChannelModule,
    AdminModule,
    forwardRef(() => TelegramModule),
    forwardRef(() => CronModule),
    forwardRef(() => CronModule),
    UsersModule,
    forwardRef(() => ContestParticipationModule),
  ],
  controllers: [ContestController],
  providers: [ContestService],
  exports: [ContestService],
})
export class ContestModule {}
