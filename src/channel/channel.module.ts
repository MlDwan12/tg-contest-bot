import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from './entities/channel.entity';
import { TelegramModule } from 'src/telegram/telegram.module';

@Module({
  imports: [TypeOrmModule.forFeature([Channel]), TelegramModule],
  controllers: [ChannelController],
  providers: [ChannelService],
  exports: [ChannelService],
})
export class ChannelModule {}
