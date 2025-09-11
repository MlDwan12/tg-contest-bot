import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Channel } from './entities/channel.entity';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateChannelDto } from './dto/create-channel.dto';
import { TelegramService } from 'src/telegram/telegram.service';

@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly _telegramService: TelegramService,
  ) {}

  async create(createChannelDto: CreateChannelDto): Promise<Channel> {
    try {
      this.logger.log(
        `Попытка создать канал: ${JSON.stringify(createChannelDto)}`,
      );

      const isExistChannel = await this.channelRepository.exists({
        where: { telegramName: createChannelDto.telegramName },
      });

      if (isExistChannel) {
        this.logger.warn(
          `Канал уже существует: ${createChannelDto.telegramName}`,
        );

        throw new HttpException(
          'Данный канал или группа уже существует',
          HttpStatus.CONFLICT,
        );
      }

      const chatInfo = await this._telegramService.getChatInfo(
        createChannelDto.telegramName,
      );

      const tempChannel = this.channelRepository.create({
        telegramId: String(chatInfo.id),
        telegramName: 'username' in chatInfo ? chatInfo.username! : undefined,
      });

      const isBotAdmin = await this._telegramService.isBotAdmin(tempChannel);
      if (!isBotAdmin) {
        this.logger.warn(
          `Бот не является админом в канале ${createChannelDto.telegramName}`,
        );
        throw new HttpException(
          'Бот должен быть администратором канала для его добавления',
          HttpStatus.FORBIDDEN,
        );
      }

      const chat = await this._telegramService.getChatInfo(
        createChannelDto.telegramName,
      );

      const channel = this.channelRepository.create({
        telegramId: String(chat.id),
        name: 'title' in chat ? chat.title : (chat.username ?? 'Без названия'),
        telegramName: 'username' in chat ? chat.username! : undefined,
        type: chat.type,
      });

      const saved = await this.channelRepository.save(channel);
      this.logger.log(`✅ Канал создан: ${saved.telegramId} (${saved.name})`);

      return saved;
    } catch (error) {
      this.logger.error(
        `Ошибка при создании канала: ${error.message}`,
        error.stack,
      );

      if (error instanceof HttpException) {
        throw error; // пробрасываем оригинал
      }

      throw new HttpException(
        'Ошибка при создании канала',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(): Promise<Channel[]> {
    try {
      this.logger.log('Запрос списка всех каналов');
      return await this.channelRepository.find();
    } catch (error) {
      this.logger.error(
        `Ошибка при получении списка каналов: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Ошибка при получении списка каналов',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findMany(ids: string[]): Promise<Channel[]> {
    try {
      this.logger.log(`Поиск каналов по id: ${ids.join(', ')}`);
      return await this.channelRepository.findBy({ telegramId: In(ids) });
    } catch (error) {
      this.logger.error(
        `Ошибка при поиске каналов: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Ошибка при поиске каналов',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(telegramId: string): Promise<void> {
    try {
      this.logger.warn(`Удаление канала telegramId=${telegramId}`);
      const result = await this.channelRepository.delete({ telegramId });

      if (result.affected === 0) {
        this.logger.warn(`Канал с telegramId=${telegramId} не найден`);
        throw new HttpException('Канал не найден', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`✅ Канал telegramId=${telegramId} удалён`);
    } catch (error) {
      this.logger.error(
        `Ошибка при удалении канала: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Ошибка при удалении канала',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
