import { forwardRef, Module } from '@nestjs/common';
import { ContestParticipationService } from './contest-participation.service';
import { ContestParticipationController } from './contest-participation.controller';
import { ContestParticipation } from './entities/contest-participation.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { ContestModule } from 'src/contest/contest.module';
import { TelegramModule } from 'src/telegram/telegram.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContestParticipation]),
    UsersModule,
    forwardRef(() => ContestModule),
    TelegramModule,
  ],
  controllers: [ContestParticipationController],
  providers: [ContestParticipationService],
  exports: [ContestParticipationService],
})
export class ContestParticipationModule {}
