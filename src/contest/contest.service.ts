import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Contest } from './entities/contest.entity';
import { CreateContestDto } from './dto/create-contest.dto';
import { TelegramService } from 'src/telegram/telegram.service';
import { UpdateContestDto } from './dto/update-contest.dto';
import { ChannelService } from 'src/channel/channel.service';
import { AdminService } from 'src/admin/admin.service';
import { CronService } from 'src/cron/cron.service';
import { ScheduledTaskType } from 'src/cron/entities/cron.entity';
import { UsersService } from 'src/users/users.service';
import { ContestParticipationService } from 'src/contest-participation/contest-participation.service';
import { ContestWinner } from './entities/contest_winners.entity';

@Injectable()
export class ContestService {
  private readonly logger = new Logger(ContestService.name);

  constructor(
    @InjectRepository(Contest)
    private readonly contestRepo: Repository<Contest>,
    @InjectRepository(ContestWinner)
    private readonly contestWinnerRepo: Repository<ContestWinner>,
    private readonly _telegramPostService: TelegramService,
    private readonly _channelService: ChannelService,
    private readonly _adminService: AdminService,
    private readonly _cronService: CronService,
    private readonly _contestParticipationService: ContestParticipationService,
    private readonly _userService: UsersService,
  ) {}

  private readonly channels = '-1002949180383';

  getChannels() {
    this.logger.log('Возвращаю список каналов');
    return this.channels;
  }

  async getScheduledContests(now: Date): Promise<Contest[]> {
    this.logger.log(`Поиск запланированных конкурсов на дату: ${now}`);
    return this.contestRepo.find({
      where: {
        startDate: LessThanOrEqual(now),
        status: 'pending',
      },
    });
  }

  async getActiveContests(): Promise<Contest[]> {
    this.logger.log('Получение всех активных конкурсов');
    return this.contestRepo.find({ where: { status: 'active' } });
  }

  async getContests(): Promise<Contest[]> {
    this.logger.log('Запрос списка всех конкурсов');
    return this.contestRepo
      .createQueryBuilder('contest')
      .leftJoinAndSelect('contest.creator', 'creator')
      .leftJoinAndSelect('contest.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'participantUser')
      .leftJoinAndSelect('contest.winners', 'winners')
      .leftJoinAndSelect('contest.allowedGroups', 'allowedGroups')
      .leftJoinAndSelect('contest.requiredGroups', 'requiredGroups')
      .getMany();
  }

  async getContestById(id: number): Promise<Contest | null> {
    this.logger.log(`Поиск конкурса по id=${id}`);
    return this.contestRepo
      .createQueryBuilder('contest')
      .leftJoinAndSelect('contest.creator', 'creator')
      .leftJoinAndSelect('contest.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'participantUser')
      .leftJoinAndSelect('contest.winners', 'winners')
      .leftJoinAndSelect('winners.user', 'winnerUser')
      .leftJoinAndSelect('contest.allowedGroups', 'allowedGroups')
      .leftJoinAndSelect('contest.requiredGroups', 'requiredGroups')
      .where('contest.id = :id', { id })
      .getOne();
  }

  saveContest(data) {
    this.logger.log('Сохранение конкурса в базу');
    return this.contestRepo.save(data);
  }

  async createContest(dto: CreateContestDto): Promise<Contest> {
    this.logger.log(`Создание нового конкурса: ${dto.name}`);

    const allowedChannels = dto.allowedGroups
      ? await this._channelService.findMany(
          dto.allowedGroups.split(',').map(String),
        )
      : [];

    const requiredChannels = dto.requiredGroups
      ? await this._channelService.findMany(
          dto.requiredGroups.split(',').map(String),
        )
      : [];

    const creator = await this._adminService.findOne({ id: dto.creatorId });
    if (!creator) {
      this.logger.error(
        `Не найден админ с id=${dto.creatorId}, создание конкурса прервано`,
      );
      throw new HttpException(
        'Админ с предоставленным id не найден',
        HttpStatus.NOT_FOUND,
      );
    }

    const contest = this.contestRepo.create({
      name: dto.name,
      description: dto.description,
      winnerStrategy: dto.winnerStrategy ?? 'random',
      allowedGroups: allowedChannels,
      requiredGroups: requiredChannels,
      startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
      endDate: new Date(dto.endDate),
      prizePlaces: dto.prizePlaces ?? 1,
      status: dto.startDate ? 'pending' : 'active',
      creator,
      imageUrl: dto.imageUrl,
      buttonText: dto.buttonText.trim() ? dto.buttonText : 'Участвовать',
    });

    const savedContest = await this.contestRepo.save(contest);
    this.logger.log(`✅ Конкурс создан, id=${savedContest.id}`);

    if (savedContest.allowedGroups?.length && !dto.startDate) {
      this.logger.log('Публикация конкурса в Telegram...');
      const telegramMessageIds = await this.publishContest(
        savedContest,
        dto.buttonText,
      );
      savedContest.telegramMessageIds = telegramMessageIds;
      await this.contestRepo.save(savedContest);
      this.logger.log(
        `Сообщения опубликованы: ${telegramMessageIds.join(',')}`,
      );
    }

    await this._cronService.createTaskInDb({
      type: ScheduledTaskType.CONTEST_FINISH,
      referenceId: savedContest.id,
      runAt: new Date(dto.endDate),
      payload: { buttonText: dto.buttonText },
    });
    this.logger.log(
      `Создана cron-задача завершения конкурса id=${savedContest.id}`,
    );

    if (dto.startDate) {
      await this._cronService.createTaskInDb({
        type: ScheduledTaskType.POST_PUBLISH,
        referenceId: savedContest.id,
        runAt: new Date(dto.startDate),
        payload: { buttonText: dto.buttonText },
      });
      this.logger.log(
        `Создана cron-задача публикации конкурса id=${savedContest.id}`,
      );
    } else {
      this._cronService.scheduleTask({
        type: ScheduledTaskType.CONTEST_FINISH,
        referenceId: savedContest.id,
        runAt: savedContest.endDate,
      });
      this.logger.log(
        `Запланировано завершение конкурса id=${savedContest.id} локально`,
      );
    }

    return savedContest;
  }

  async updateContest(id: number, dto: UpdateContestDto): Promise<Contest> {
    this.logger.log(`Обновление конкурса id=${id}`);
    const contest = await this.contestRepo.findOne({ where: { id } });
    if (!contest) {
      this.logger.error(`Конкурс id=${id} не найден`);
      throw new NotFoundException('Contest not found');
    }

    // здесь у тебя будет логика обновления...
    this.logger.log(`Конкурс id=${id} успешно обновлён`);
    return this.contestRepo.save(contest);
  }

  async myContest(id: string, chatId: string) {
    this.logger.log(
      `Запрос конкурсов пользователя telegramId=${id} в чате ${chatId}`,
    );
    return this.contestRepo.find({
      relations: {
        participants: { user: true },
      },
      where: {
        participants: { user: { telegramId: id } },
        allowedGroups: { telegramId: chatId },
      },
    });
  }

  async getWinners(constestId: number) {
    this.logger.log(`Запуск выбора победителей для конкурса id=${constestId}`);
    const contest = await this.contestRepo.findOne({
      where: { id: constestId },
      relations: { participants: { user: true } },
    });

    if (!contest) {
      this.logger.error(`Конкурс id=${constestId} не найден`);
      throw new HttpException('конкурс не найден', HttpStatus.NOT_FOUND);
    }

    const randomElements = this.getRandomElement(
      contest.participants,
      contest.prizePlaces,
    );
    if (!randomElements?.length) {
      this.logger.warn(`Нет участников для конкурса id=${constestId}`);
      throw new HttpException('Нет участников', HttpStatus.CONFLICT);
    }

    const winners = randomElements.map((e) => e.id);
    this.logger.log(
      `Победители выбраны для конкурса id=${constestId}: ${winners.join(',')}`,
    );

    return this._contestParticipationService.updateWinner(winners, constestId);
  }

  async removeContest(id: number) {
    this.logger.warn(`Удаление конкурса id=${id}`);
    const contest = await this.contestRepo.findOne({ where: { id } });
    if (!contest) {
      this.logger.error(`Попытка удалить несуществующий конкурс id=${id}`);
      throw new NotFoundException('Contest not found');
    }

    const posts = contest.telegramMessageIds?.map((e) => {
      const [chatId, messageId] = e.split(':');
      return { chatId, messageId: Number(messageId) };
    });

    if (posts?.length) {
      this.logger.log(
        `Удаление сообщений конкурса id=${id} из Telegram: ${posts.length} шт.`,
      );
      for (const post of posts) {
        try {
          await this._telegramPostService.deleteMessage(
            post.chatId,
            post.messageId,
          );
        } catch (err) {
          this.logger.warn(
            `Не удалось удалить сообщение ${post.chatId}:${post.messageId}`,
          );
        }
      }
    }
  }

  private async publishContest(
    contest: Contest,
    buttonText?: string,
  ): Promise<string[]> {
    this.logger.log(`Публикация конкурса id=${contest.id} в Telegram`);
    const text = `📢 Новый конкурс: ${contest.name}\n\n${contest.description || ''}`;
    const telegramMessageIds: string[] = [];

    for (const group of contest.allowedGroups) {
      const msgId = await this._telegramPostService.sendPosts(
        group.telegramId,
        text,
        contest.imageUrl,
        contest.id,
        group.telegramId,
        buttonText,
      );
      telegramMessageIds.push(
        ...msgId.map((msg) => `${msg.chatId}:${msg.messageId}`),
      );
    }

    this.logger.log(
      `Сообщения конкурса id=${contest.id} опубликованы: ${telegramMessageIds.join(',')}`,
    );
    return telegramMessageIds;
  }

  private getRandomElement<T>(arr: T[], count: number): T[] | null {
    this.logger.log(`Выбор случайных элементов (${count}) из массива`);
    if (!arr || arr.length === 0 || count <= 0) return [];
    const result: T[] = [];
    const usedIndices = new Set<number>();
    const n = Math.min(count, arr.length);

    while (result.length < n) {
      const randomIndex = Math.floor(Math.random() * arr.length);
      if (!usedIndices.has(randomIndex)) {
        usedIndices.add(randomIndex);
        result.push(arr[randomIndex]);
      }
    }

    return result;
  }
}
