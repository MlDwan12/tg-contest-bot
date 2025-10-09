import { CronService } from './cron.service';
import { CronController } from './cron.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledTask } from './entities/cron.entity';
import { ContestModule } from 'src/contest/contest.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { ContestParticipationModule } from 'src/contest-participation/contest-participation.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledTask]),
    forwardRef(() => ContestModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => ContestParticipationModule),
  ],
  controllers: [CronController],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
