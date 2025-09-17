import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { ChannelModule } from 'src/channel/channel.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { ContestParticipationModule } from 'src/contest-participation/contest-participation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => TelegramModule),
    forwardRef(() => ChannelModule),
    forwardRef(() => ContestParticipationModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
