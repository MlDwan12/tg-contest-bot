import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
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
import { join } from 'path';
import { promises as fs } from 'fs';
import { ContestParticipation } from 'src/contest-participation/entities/contest-participation.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

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
    @Inject(forwardRef(() => ContestParticipationService))
    private readonly _contestParticipationService: ContestParticipationService,
    @Inject(forwardRef(() => UsersService))
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
    this.logger.log('Сохранение конкурса в базу', data);
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

    this.logger.debug(
      `StartDate DTO: ${dto.startDate}, parsed: ${dto.startDate ? new Date(dto.startDate) : 'N/A'}`,
    );

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
      this._cronService.scheduleTask({
        type: ScheduledTaskType.POST_PUBLISH,
        referenceId: savedContest.id,
        runAt: savedContest.startDate,
      });
      this.logger.log(
        `Запланирована публикация конкурса id=${savedContest.id} локально`,
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

  async updateContest(id: number, dto: UpdateContestDto): Promise<any> {
    this.logger.log(`Обновление конкурса id=${id}`);

    const contest = await this.contestRepo.findOne({
      where: { id },
      relations: { participants: true },
    });
    if (!contest) {
      this.logger.error(`Конкурс id=${id} не найден`);
      throw new NotFoundException('Contest not found');
    }

    Object.assign(contest, dto);

    this.logger.debug(
      `Поля для обновления: ${JSON.stringify(dto)} | Конкурс id=${id}`,
    );

    // Если нужно обновить посты в телеграме
    if (dto.description || dto.buttonText || dto.name || dto.imageUrl) {
      for (const msgId of contest.telegramMessageIds ?? []) {
        if (!msgId) continue;
        const [chatId, messageId] = msgId.split(':');
        // await this._telegramPostService.editPost(
        //   chatId,
        //   Number(messageId),
        //   contest,
        //   dto.name ?? undefined,
        //   dto.description ?? undefined,
        //   dto.imageUrl ?? undefined,
        //   dto.buttonText ?? undefined,
        // );

        await this._telegramPostService.editPostQueue(
          chatId,
          Number(messageId),
          contest,
          dto.name ?? undefined,
          dto.description ?? undefined,
          dto.imageUrl ?? undefined,
          dto.buttonText ?? undefined,
        );
      }
    }

    if (dto.winners) {
      console.log('ПОДКРУЧЕННЫЕ=======>', dto.winners);
      await this.contestWinnerRepo.delete({ contest: { id: contest.id } });
      // Сохраняем победителей вручную через репозиторий
      const winners = await Promise.all(
        dto.winners.split(',').map(async (userId, index) => {
          const winner = new ContestWinner();
          winner.user = await this._userService.findOrCreate({
            telegramId: Number(userId),
          });

          await this._contestParticipationService.updatePlace(
            userId,
            contest.id,
            index + 1,
          );
          winner.contest = contest; // обязательно указываем ссылку на конкурс
          return this.contestWinnerRepo.save(winner); // сохраняем и возвращаем
        }),
      );
      console.log('КАК ПОЛУЧАЕМ ПОСЛЕ ЗАПИСИ=====>', winners);

      // Обновляем relation вручную (без cascade)
      contest.winners = winners;
    }

    // Сохраняем сам конкурс (без cascade на winners)
    await this.contestRepo.save(contest);

    this.logger.log(`Конкурс id=${id} успешно обновлён`);

    if (dto.endDate) {
      this.logger.debug(
        `Изменение даты завершения для конкурса: {id:${contest.id} name: ${contest.name}`,
      );

      this.logger.debug(`Поиск крона для завершения конкурса`);
      const task = await this._cronService.findTaskByRef(
        ScheduledTaskType.CONTEST_FINISH,
        id,
      );

      if (task) {
        this.logger.debug(
          `Найдена задача для конкурса: ${JSON.stringify(task)}`,
        );
        this.logger.debug(`Удаление задачи с ${task.id} из бд`);
        await this._cronService.deleteTaskFromDb(task.id);
        this.logger.debug(`Задача удалена из бд`);

        this.logger.debug(`Удаление крон джобы`);
        this._cronService.removeScheduledJob(task);
      }

      this.logger.debug(`Запись новой таски в бд`);
      await this._cronService.createTaskInDb({
        type: ScheduledTaskType.CONTEST_FINISH,
        referenceId: contest.id,
        runAt: dto.endDate,
      });
      this.logger.debug(`Таска записана в бд`);
    }

    const res = await this.contestRepo.findOne({
      where: { id: contest.id },
      relations: ['winners', 'winners.user'], // подгружаем победителей и их пользователей
    });

    return res;
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
      relations: {
        participants: { user: true, contest: { requiredGroups: true } },
        winners: {
          user: {
            participations: { contest: { requiredGroups: true }, user: true },
          },
        },
      },
    });

    if (!contest) {
      this.logger.error(`Конкурс id=${constestId} не найден`);
      throw new HttpException('конкурс не найден', HttpStatus.NOT_FOUND);
    }
    let winners: number[] = [];

    if (contest.winners?.length) {
      console.log(
        'ПРИСВОЕНИЕ МЕСТ ПОЛУЧЕНИЕ до мапа========>',
        contest.winners,
      );

      return contest.winners.flatMap((e) => {
        return e.user.participations
          .map((p) => {
            if (p.contest.id === constestId) return p;
          })
          .filter((p) => p !== undefined);
      });
    }

    if (contest.participants && !contest.winners.length) {
      const randomElements = await this.getRandomElement(
        contest.participants,
        contest.prizePlaces,
      );
      winners = randomElements.map((e) => e.id);
      this.logger.log(
        `Победители выбраны для конкурса id=${constestId}: ${winners.join(',')}`,
      );
    }

    return this._contestParticipationService.updateWinner(winners, constestId);
  }

  async removeContest(id: number) {
    this.logger.warn(`Удаление конкурса id=${id}`);
    try {
      const contest = await this.contestRepo.findOne({ where: { id } });
      if (!contest) {
        this.logger.error(`Попытка удалить несуществующий конкурс id=${id}`);
        throw new NotFoundException('Конкурс не найден');
      }

      this.logger.debug(`Поиск постов если уже опубликовано`);

      if (contest.imageUrl) {
        const filePath = join(process.cwd(), contest.imageUrl); // contest.imageUrl типа "/uploads/123.png"
        try {
          await fs.unlink(filePath);
          this.logger.log(`Картинка конкурса удалена: ${filePath}`);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            this.logger.warn(`Не удалось удалить картинку: ${filePath}`, err);
          } else {
            this.logger.debug(`Картинка уже отсутствует: ${filePath}`);
          }
        }
      }

      const posts = contest.telegramMessageIds?.map((e) => {
        const [chatId, messageId] = e.split(':');
        return { chatId, messageId: Number(messageId) };
      });

      this.logger.debug(`Конкурс опубликован в: ${JSON.stringify(posts)}`);

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

      await this.contestRepo.remove(contest);

      this.logger.debug(`Поиск задач конкурса`);

      const taskPub = await this._cronService.findTaskByRef(
        ScheduledTaskType.POST_PUBLISH,
        id,
      );
      const taskFin = await this._cronService.findTaskByRef(
        ScheduledTaskType.CONTEST_FINISH,
        id,
      );

      this.logger.debug(
        `Найдены таски: {taskPub: ${JSON.stringify(taskPub)}, taskFin: ${JSON.stringify(taskFin)}}`,
      );

      if (taskPub) {
        this.logger.debug(`Удаление задачи из бд`);
        await this._cronService.deleteTaskFromDb(taskPub.id);
        this.logger.debug(`Удаление задачи`);
        this._cronService.removeScheduledJob(taskPub);
      }

      if (taskFin) {
        this.logger.debug(`Удаление задачи из бд`);
        await this._cronService.deleteTaskFromDb(taskFin.id);
        this.logger.debug(`Удаление задачи`);
        this._cronService.removeScheduledJob(taskFin);
      }
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error; // пробрасываем оригинал
      }

      throw new HttpException(
        'Ошибка при удалении поста',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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

  private async getRandomElement(
    arr: ContestParticipation[],
    count: number,
  ): Promise<ContestParticipation[]> {
    this.logger.log(`Выбор случайных элементов (${count}) из массива`);
    if (!arr || arr.length === 0 || count <= 0) return [];
    const result: ContestParticipation[] = [];
    const usedIndices = new Set<number>();
    const n = Math.min(count, arr.length);

    while (result.length < n) {
      const randomIndex = Math.floor(Math.random() * arr.length);

      const isUnsub = (
        await this._telegramPostService.isUserSubscribed(
          arr[randomIndex].contest.requiredGroups,
          Number(arr[randomIndex].user.telegramId),
          false,
        )
      ).some((r) => !r.subscribed);

      if (!usedIndices.has(randomIndex) && !isUnsub) {
        usedIndices.add(randomIndex);
        result.push(arr[randomIndex]);
      }
    }

    return result;
  }

  async completeContest(contestId: number): Promise<void> {
    const contest = await this.contestRepo.findOne({
      where: { id: contestId },
    });

    if (!contest) {
      throw new HttpException('Конкурс не найден', HttpStatus.NOT_FOUND);
    }

    if (contest.status === 'completed') {
      throw new HttpException('Конкурс уже завершён', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`✅ Конкурс #${contestId} завершён`);

    const task = await this._cronService.findTaskByRef(
      ScheduledTaskType.CONTEST_FINISH,
      contestId,
    );

    if (!task)
      throw new HttpException(
        'Задача на завершение не найдена',
        HttpStatus.CONFLICT,
      );
    await this._cronService.executeTask(task);
  }

  async cancelContest(contestId: number): Promise<void> {
    const contest = await this.contestRepo.findOne({
      where: { id: contestId },
    });

    if (!contest) {
      throw new HttpException('Конкурс не найден', HttpStatus.NOT_FOUND);
    }

    if (contest.status === 'completed') {
      throw new HttpException('Конкурс уже завершён', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`✅ Конкурс #${contestId} завершён`);
    const taskPub = await this._cronService.findTaskByRef(
      ScheduledTaskType.POST_PUBLISH,
      contestId,
    );
    const taskFin = await this._cronService.findTaskByRef(
      ScheduledTaskType.CONTEST_FINISH,
      contestId,
    );

    this.logger.debug(
      `Найдены таски: {taskPub: ${JSON.stringify(taskPub)}, taskFin: ${JSON.stringify(taskFin)}}`,
    );

    if (taskPub) {
      this.logger.debug(`Удаление задачи из бд`);
      await this._cronService.deleteTaskFromDb(taskPub.id);
      this.logger.debug(`Удаление задачи`);
      this._cronService.removeScheduledJob(taskPub);
    }

    if (taskFin) {
      this.logger.debug(`Удаление задачи из бд`);
      await this._cronService.deleteTaskFromDb(taskFin.id);
      this.logger.debug(`Удаление задачи`);
      this._cronService.removeScheduledJob(taskFin);
    }
    contest.status = 'completed';
    await this.contestRepo.save(contest);

    for (const msgId of contest.telegramMessageIds ?? []) {
      if (!msgId) continue;

      const [chatId, messageId] = msgId.split(':');
      // await this._telegramPostService.editPost(
      //   chatId,
      //   Number(messageId),
      //   contest,
      //   undefined,
      //   undefined,
      //   undefined,
      //   'none',
      // );

      await this._telegramPostService.editPostQueue(
        chatId,
        Number(messageId),
        contest,
        undefined,
        undefined,
        undefined,
        'none',
      );
    }
  }
}
