import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelController {
  private readonly logger = new Logger(ChannelController.name);

  constructor(private readonly channelService: ChannelService) {}

  @Get()
  async findAll() {
    try {
      this.logger.log('Запрос списка каналов');
      return await this.channelService.findAll();
    } catch (error: any) {
      this.logger.error('Ошибка при получении списка каналов', error.stack);
      throw new HttpException(
        'Ошибка при получении списка каналов',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  async create(@Body() dto: CreateChannelDto) {
    try {
      this.logger.log(`Создание канала: ${JSON.stringify(dto)}`);
      return await this.channelService.create(dto);
    } catch (error: any) {
      this.logger.error(
        `Ошибка при создании канала: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Ошибка при создании канала',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':telegramId')
  async remove(@Param('telegramId') telegramId: string) {
    try {
      this.logger.warn(`Удаление канала telegramId=${telegramId}`);
      return await this.channelService.remove(telegramId);
    } catch (error: any) {
      this.logger.error(
        `Ошибка при удалении канала telegramId=${telegramId}: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Ошибка при удалении канала',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
