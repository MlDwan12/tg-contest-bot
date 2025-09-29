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
import { ConfigService } from '@nestjs/config';
import { Admin } from 'src/admin/entities/admin.entity';
import { User } from 'src/users/entities/user.entity';
import { Channel } from 'src/channel/entities/channel.entity';

@Injectable()
export class ContestService {
  private readonly logger = new Logger(ContestService.name);
  private readonly adminIds: string[];

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
    private readonly configService: ConfigService,
  ) {
    this.adminIds = this.configService
      .get<string>('ADMIN_IDS')!
      .split(',')
      .map((id) => id.trim());
  }

  private readonly channels = '-1002949180383';

  getChannels() {
    this.logger.debug('Возвращаю список каналов');
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

  async getActiveContests(): Promise<any> {
    this.logger.log('Получение всех активных конкурсов');
    return this.contestRepo.find({ where: { status: 'active' } });
  }

  async getContestsShortInfo(options?: {
    fields?: (keyof Contest)[];
    include?: {
      creator?: (keyof Admin)[];
      participants?: {
        fields?: (keyof ContestParticipation)[];
        user?: (keyof User)[];
      };
      winners?: {
        fields?: (keyof ContestWinner)[];
        user?: (keyof User)[];
      };
      allowedGroups?: (keyof Channel)[];
      requiredGroups?: (keyof Channel)[];
    };
  }) {
    this.logger.debug('Запрос списка всех конкурсов для карточек');
    const fields = options?.fields?.length
      ? options.fields.map((f) => `contest."${f}"`).join(', ')
      : 'contest.*';

    let joins = '';
    const extraFields: string[] = [];

    if (options?.include?.creator) {
      joins += ` LEFT JOIN admins AS creator ON creator.id = contest."creatorId"`;
      const creatorFields = options.include.creator
        .map((f) => `creator."${f}" AS "creator_${f}"`)
        .join(', ');
      extraFields.push(creatorFields);
    }

    if (options?.include?.participants) {
      joins += ` LEFT JOIN contest_participations AS participants ON participants."contestId" = contest.id`;
      extraFields.push(`COUNT(participants.id) AS "participantCount"`);
    }

    if (options?.include?.winners) {
      joins += ` LEFT JOIN contest_winners AS winners ON winners."contestId" = contest.id`;
      extraFields.push(`COUNT(winners.id) AS "winnerCount"`);
    }

    if (options?.include?.allowedGroups) {
      joins += ` LEFT JOIN contest_allowed_channels AS ac ON ac."contestId" = contest.id`;
      joins += ` LEFT JOIN channels AS allowedGroups ON allowedGroups.id = ac."channelId"`;
      extraFields.push(`json_agg(DISTINCT allowedGroups.*) AS "allowedGroups"`);
    }

    if (options?.include?.requiredGroups) {
      joins += ` LEFT JOIN contest_required_channels AS rc ON rc."contestId" = contest.id`;
      joins += ` LEFT JOIN channels AS requiredGroups ON requiredGroups.id = rc."channelId"`;
      extraFields.push(
        `json_agg(DISTINCT requiredGroups.*) AS "requiredGroups"`,
      );
    }

    const sql = `
    SELECT
      ${fields}
      ${extraFields.length ? ', ' + extraFields.join(', ') : ''}
    FROM contests AS contest
    ${joins}
    GROUP BY contest.id${options?.include?.creator ? ', creator.id' : ''}
  `;
    this.logger.debug(
      'Запрос на получение списка всех конкурсов для карточек собран',
    );

    return this.contestRepo.query(sql);
  }

  async getContestsFullInfo(): Promise<Contest[]> {
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

  async getContestByIdWin(id: number) {
    this.logger.debug(`Получение конкурса по id=${id} для бизнес логики`);
    return this.contestRepo.findOne({
      where: { id },
      relations: {
        allowedGroups: true,
        requiredGroups: true,
        winners: { user: { participations: { contest: true } }, contest: true },
        participants: { user: { participations: { contest: true } }, contest: true },
      },
    });
  }

  async getContestById(id: number): Promise<any> {
    this.logger.debug(`Получение конкурса по id=${id} для клиента`);
    const contest: Contest = await this.contestRepo.query(
      `SELECT * FROM contests WHERE id = $1`,
      [id],
    );

    if (!contest[0]) return null;

    const [allowedGroups, requiredGroups, winners, participations] =
      await Promise.all([
        this.contestRepo.query(
          `SELECT id, name, "telegramId", "telegramName" 
       FROM channels 
       JOIN contest_allowed_channels cac ON cac."channelId" = channels.id
       WHERE cac."contestId" = $1`,
          [id],
        ),
        this.contestRepo.query(
          `SELECT id, name, "telegramId", "telegramName" 
       FROM channels 
       JOIN contest_required_channels crc ON crc."channelId" = channels.id
       WHERE crc."contestId" = $1`,
          [id],
        ),
        this.contestRepo.query(
          `SELECT cw.id, cw."userId", u."telegramId", u."username"
     FROM contest_winner cw
     JOIN users u ON u.id = cw."userId"
     WHERE cw."contestId" = $1`,
          [id],
        ),
        this.contestRepo.query(
          `SELECT 
  json_build_object(
    'id', u.id,
    'username', u.username,
    'telegramId', u."telegramId",
    'firstName', u."firstName",
    'lastName', u."lastName"
  ) AS "user",
  cp."prizePlace",
  cp."status",
  cp."groupId"
FROM contest_participations cp
JOIN users u ON u.id = cp."userId"
WHERE cp."contestId" = $1;`,
          [id],
        ),
      ]);
    this.logger.debug(`Получен конкурс с id=${id} для клиента`);
    const { telegramMessageIds, ...otherInfo } = contest[0];
    return {
      ...otherInfo,
      telegramMessageIds: telegramMessageIds ?? '',
      allowedGroups,
      requiredGroups,
      winners: winners.map((e) => {
        return {
          id: e.id,
          user: {
            id: e.userId,
            telegramId: e.telegramId,
            username: e.username,
          },
        };
      }),
      participations,
    };
  }

  saveContest(data) {
    this.logger.debug(`Сохранение конкурса`);

    return this.contestRepo.save(data);
  }

  async createContest(dto: CreateContestDto): Promise<Contest> {
    this.logger.debug(`Создание нового конкурса: `, dto);

    this.logger.debug('Получение групп по которым будет происходит рассылка');
    const allowedChannels = dto.allowedGroups
      ? await this._channelService.findMany(
          dto.allowedGroups.split(',').map(String),
        )
      : [];
    this.logger.log('Получены группы по которым будет происходит рассылка');

    this.logger.debug('Получение обязательных для подписки на конкурс групп');
    const requiredChannels = dto.requiredGroups
      ? await this._channelService.findMany(
          dto.requiredGroups.split(',').map(String),
        )
      : [];
    this.logger.log('Получены группы обязательные для подписки на конкурс');

    this.logger.debug('Получение информации о создателе конкурса');
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
    this.logger.log('Получены группы обязательные для подписки на конкурс');

    this.logger.debug('Создание объекта конкурса');
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
    this.logger.log('Создан объект конкурса');

    this.logger.debug('Сохранение объекта конкурса');
    const savedContest = await this.contestRepo.save(contest);
    this.logger.log('Конкурс сохранен');

    if (savedContest.allowedGroups?.length && !dto.startDate) {
      this.logger.debug('Немедленная публикация конкурса');
      const telegramMessageIds = await this._telegramPostService.sendPosts(
        savedContest.allowedGroups.map((g) => g.id.toString()),
        `${savedContest.name}\n\n${savedContest.description}`,
        savedContest.imageUrl,
        savedContest.id,
        undefined,
        dto.buttonText,
      );
      this.logger.log('Конкурсы опубликован');

      savedContest.telegramMessageIds = telegramMessageIds.map(
        (id) => `${id.chatId}:${id.messageId}`,
      );

      this.logger.debug('Сохранение id постов конкурса');
      await this.contestRepo.save(savedContest);
      this.logger.log('Конкурс сохранен');
    }

    await this._cronService.createTaskInDb({
      type: ScheduledTaskType.CONTEST_FINISH,
      referenceId: savedContest.id,
      runAt: new Date(dto.endDate),
      payload: { buttonText: dto.buttonText },
    });

    if (dto.startDate) {
      await this._cronService.createTaskInDb({
        type: ScheduledTaskType.POST_PUBLISH,
        referenceId: savedContest.id,
        runAt: new Date(dto.startDate),
        payload: { buttonText: dto.buttonText },
      });

      this._cronService.scheduleTask({
        type: ScheduledTaskType.POST_PUBLISH,
        referenceId: savedContest.id,
        runAt: savedContest.startDate,
      });
    } else {
      this._cronService.scheduleTask({
        type: ScheduledTaskType.CONTEST_FINISH,
        referenceId: savedContest.id,
        runAt: savedContest.endDate,
      });
    }

    return savedContest;
  }

  async updateContest(id: number, dto: UpdateContestDto): Promise<any> {
    this.logger.log('Обновление конкурса');

    this.logger.debug(`Получение конкурса с id=${id}`);
    const contest = await this.contestRepo.findOne({
      where: { id },
      relations: { participants: true },
    });
    if (!contest) {
      this.logger.error(`Конкурс id=${id} не найден`);
      throw new NotFoundException('Contest not found');
    }
    this.logger.log('Конкурс получен');

    Object.assign(contest, dto);

    this.logger.debug(
      `Поля для обновления: ${JSON.stringify(dto)} | Конкурс id=${id}`,
    );

    if (dto.winners) {
      this.logger.debug(`Обновление победителей`);

      this.logger.debug(`Удаление старых`);
      await this.contestWinnerRepo.delete({ contest: { id: contest.id } });
      this.logger.log(`Победители удалены`);

      this.logger.debug(`Добавление победителей`);
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
          winner.contest = contest;

          this.logger.debug(`Сохранение победителей`);
          return this.contestWinnerRepo.save(winner);
        }),
      );

      contest.winners = winners;
      this.logger.log(`Победители сохранены`);
    }

    this.logger.debug(`Сохранение изменений конкурса`);
    await this.contestRepo.save(contest);
    this.logger.log(`Изменения сохранены`);

    if (
      (dto.description || dto.buttonText || dto.name || dto.imageUrl) &&
      contest.telegramMessageIds
    ) {
      this.logger.debug(`Изменения опубликованных постов`);
      for (const msgId of contest.telegramMessageIds ?? []) {
        if (!msgId) continue;

        this.logger.debug(`Получение id канала и поста`);
        const [chatId, messageId] = msgId.split(':');
        this.logger.log(`id канала и поста получены`);

        this.logger.debug(`Обновление поста`);
        await this._telegramPostService.editPostQueue(
          chatId,
          Number(messageId),
          contest,
          dto.name ?? undefined,
          dto.description ?? undefined,
          dto.imageUrl ?? undefined,
          dto.buttonText ?? undefined,
          true,
        );
        this.logger.debug(`Пост обновлен`);
      }
    }

    if (dto.endDate) {
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
        this.logger.log(`Задача удалена из бд`);

        this.logger.debug(`Удаление кроны`);
        this._cronService.removeScheduledJob(task);
        this.logger.debug(`Крона удалена`);
      }

      this.logger.debug(`Запись новой таски в бд`);
      await this._cronService.createTaskInDb({
        type: ScheduledTaskType.CONTEST_FINISH,
        referenceId: contest.id,
        runAt: dto.endDate,
      });
      this.logger.log(`Таска записана в бд`);
    }

    this.logger.debug(`Получение обновленного конкурса`);
    const res = await this.contestRepo.findOne({
      where: { id: contest.id },
      relations: ['winners', 'winners.user'],
    });
    this.logger.log(`Конкурс получен`);

    return res;
  }

  async myContest(id: string, chatId: string) {
    this.logger.debug(`Получение списка конкурсов пользователя с id=${id}`);
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

  async getWinners(contest) {
    this.logger.debug(`Получение победителей`);

    if (!contest) {
      this.logger.error(`Конкурс id=${contest?.id} не найден`);
      throw new HttpException('конкурс не найден', HttpStatus.NOT_FOUND);
    }
    let winners: number[] = [];
    this.logger.debug(`Получение id победителей`);

    if (contest.winners?.length) {
      this.logger.debug(`Получение победителей, тип конкурса 1`);
      console.log(123131231231231231, contest.winners);

      winners = contest.winners
        .flatMap((e) => {
          return e.user.participations.filter(
            (p) => p.contest.id === contest.id,
          );
        })
        .map((p) => p.id);
    }

    if (
      contest?.participants ??
      (contest?.participations && !contest.winners.length)
    ) {
      this.logger.debug(`Получение победителей, тип конкурса 2`);
      const randomElements = await this.getRandomElement(
        contest?.participants && contest.participants.length > 0
          ? contest.participants
          : contest.participations,
        contest.prizePlaces,
        contest.requiredGroups,
      );

      winners = randomElements.map((e) => e.id);
    }
    this.logger.log('Получен список победителей', winners);

    return this._contestParticipationService.updateWinner(winners, contest.id);
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

  private async getRandomElement(
    arr: ContestParticipation[],
    count: number,
    requiredGroups,
  ): Promise<ContestParticipation[]> {
    this.logger.log(`Выбор случайных элементов (${count}) из массива`);
    if (!arr || arr.length === 0 || count <= 0) return [];

    // 1. Фильтруем только подписанных
    const subscribed: any = [];
    for (const p of arr) {
      const check = await this._telegramPostService.isUserSubscribed(
        requiredGroups,
        Number(p.user.telegramId),
        false,
      );

      if (!check.some((r) => !r.subscribed)) {
        subscribed.push(p);
      }
    }

    if (subscribed.length === 0) return [];

    // 2. Перемешиваем (Fisher-Yates)
    for (let i = subscribed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [subscribed[i], subscribed[j]] = [subscribed[j], subscribed[i]];
    }

    // 3. Берём первые count
    return subscribed.slice(0, Math.min(count, subscribed.length));
  }

  async completeContest(contestId: number): Promise<void> {
    this.logger.debug('Ручное завершение конкурса запущенно');

    this.logger.debug('Получение конкурса');
    const contest = await this.contestRepo.findOne({
      where: { id: contestId },
      relations: {
        winners: {
          user: { participations: { contest: true, user: true } },
          contest: true,
        },
        allowedGroups: true,
        participants: {
          user: { participations: { contest: true, user: true } },
        },
      },
    });

    this.logger.log('Получен конкурс', contest);

    if (!contest) {
      throw new HttpException('Конкурс не найден', HttpStatus.NOT_FOUND);
    }

    if (contest.status === 'completed') {
      throw new HttpException('Конкурс уже завершён', HttpStatus.BAD_REQUEST);
    }

    this.logger.debug('Поиск кроны');
    const task = await this._cronService.findTaskByRef(
      ScheduledTaskType.CONTEST_FINISH,
      contestId,
    );
    this.logger.log('ПОлучена крона', task);

    if (!task) {
      const channelsName = contest.allowedGroups
        .map((e) => `@${e.telegramName}`)
        .join('\n\n');

      const channels = contest.allowedGroups;

      contest.status = 'completed';

      this.logger.debug('Сохранение статуса кроны');
      await this.saveContest(contest);

      this.logger.debug('Получение списка победителей');
      const winners = await this.getWinners(contest);

      if (winners.length) {
        this.logger.debug('Рассылка победителям (тип 1)');
        await Promise.all(
          winners.map(async (winner) => {
            this.logger.debug('Получение групп');
            const group = channels.find(
              (c) => c.telegramId === winner.groupId.toString(),
            );

            if (!group) {
              this.logger.warn(`Группа с id ${winner.groupId} не найдена`);
              return;
            }

            this.logger.debug('Получение id поста для ссылки на конкурс');
            const messageIds = (contest.telegramMessageIds ?? [])
              .filter((msgId): msgId is string => msgId !== null)
              .map((msgId) =>
                this._cronService.getValueByGroupId(msgId, group.telegramId),
              );

            this.logger.debug('Отправка сообщения победителю');
            await this._telegramPostService.sendPrivateMessage(
              winner.user.telegramId,
              'Поздравляю, вы победили в конкурсе 🎉',
              group.telegramName,
              messageIds[0]!,
            );
            this.logger.log('Сообщение победителю');
          }),
        );

        this.logger.debug('Редактирование постов по завершению конкурса');
        for (const msgId of contest.telegramMessageIds ?? []) {
          if (msgId) {
            await this._telegramPostService.editPostQueue(
              msgId.split(':')[0],
              Number(msgId.split(':')[1]),
              contest,
              undefined,
              undefined,
              undefined,
              'Узнать результат',
              true,
            );
          }
        }
        this.logger.log('Посты отредактированы');

        this.logger.debug('Отправка сообщений админам');
        for (const adminId of this.adminIds) {
          await this._telegramPostService.sendPrivateMessage(
            adminId,
            `Завершен конкурс: ${contest.name}\n\nГруппы, которые участвовали в розыгрыше:\n\n${channelsName}`,
          );
        }
        this.logger.log('Сообщения админам отправлены');
      }
    } else await this._cronService.executeTask(task, contest);
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

      await this._telegramPostService.editPostQueue(
        chatId,
        Number(messageId),
        contest,
        undefined,
        undefined,
        undefined,
        'none',
        true,
      );
    }
  }
}
