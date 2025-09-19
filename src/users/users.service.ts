import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { ContestParticipation } from 'src/contest-participation/entities/contest-participation.entity';
import { TelegramService } from 'src/telegram/telegram.service';
import { ContestParticipationService } from 'src/contest-participation/contest-participation.service';
import { ChannelService } from 'src/channel/channel.service';
import { BroadcastDto } from 'src/admin/dto/broadcastDto';
import { BroadcastType } from 'src/admin/enums/broadcast.enum';
import { ContestService } from 'src/contest/contest.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly _telegramService: TelegramService,
    @Inject(forwardRef(() => ContestParticipationService))
    private readonly _contestParticipationService: ContestParticipationService,
    private readonly _channelService: ChannelService,
    private readonly _contestService: ContestService,
  ) {}

  async findOrCreate(tgUser: CreateUserDto): Promise<User> {
    const telegramId = String(tgUser.telegramId);
    const username = tgUser.userName;

    this.logger.debug(
      `findOrCreate: telegramId=${telegramId}, username=${username}`,
    );

    let user = await this.userRepo.findOne({
      where: { telegramId },
      select: ['id', 'telegramId', 'username'],
    });

    if (user) {
      this.logger.log(
        `Пользователь найден: id=${user.id}, username=${user.username}`,
      );
      return user;
    }

    this.logger.warn(
      `Пользователь не найден, создаём нового telegramId=${telegramId}`,
    );

    try {
      user = await this.userRepo.save(
        this.userRepo.create({ telegramId, username }),
      );
      this.logger.log(
        `Новый пользователь создан: id=${user.id}, username=${user.username}`,
      );
    } catch (error) {
      this.logger.error(
        `Ошибка при создании пользователя telegramId=${telegramId}: ${error.message}`,
        error.stack,
      );
      user = await this.userRepo.findOne({ where: { telegramId } });
      if (!user) throw error;
    }

    return user;
  }

  async getUserByTgId(
    telegramId: string,
  ): Promise<Pick<User, 'id' | 'telegramId' | 'username'> | null> {
    return this.userRepo.findOne({
      where: { telegramId },
      select: ['id', 'telegramId', 'username'],
    });
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepo.find();
  }

  async getAllUsersPag(
    page = 1,
    limit = 50,
  ): Promise<{ users: User[]; total: number }> {
    this.logger.debug(`getAllUsers: page=${page}, limit=${limit}`);

    const [users, total] = await this.userRepo.findAndCount({
      relations: { participations: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'ASC' },
    });

    this.logger.log(
      `Найдено пользователей: count=${users.length}, total=${total}`,
    );
    return { users, total };
  }

  async getUsersStats(page = 1, limit = 50) {
    this.logger.debug(`getUsersStats: page=${page}, limit=${limit}`);

    const users = await this.userRepo
      .createQueryBuilder('user')
      .select(['user.id', 'user.username'])
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    if (!users.length) {
      this.logger.warn(`getUsersStats: пользователей нет`);
      return [];
    }

    const userIds = users.map((u) => u.id);
    this.logger.debug(
      `getUsersStats: загружаем участия для userIds=${userIds.join(',')}`,
    );

    const participations = await this.dataSource
      .getRepository(ContestParticipation)
      .createQueryBuilder('p')
      .leftJoin('p.user', 'user')
      .leftJoin('p.contest', 'c')
      .leftJoin('c.allowedGroups', 'g')
      .select([
        'p.id',
        'user.id',
        'user.username',
        'c.id',
        'c.name',
        'g.id',
        'g.name',
      ])
      .where('p.userId IN (:...userIds)', { userIds })
      .getMany();

    const userMap: Record<number, any> = {};
    users.forEach((u) => {
      userMap[u.id] = {
        id: u.id,
        username: u.username,
        groups: {},
        totalParticipations: { count: 0, contests: [] },
      };
    });

    participations.forEach((p) => {
      if (!p.user || !p.contest) return;
      const u = userMap[p.user.id];

      u.totalParticipations.count++;
      u.totalParticipations.contests.push({
        id: p.contest.id,
        name: p.contest.name,
      });

      if (p.contest.allowedGroups) {
        p.contest.allowedGroups.forEach((g) => {
          if (!g?.name) return;
          u.groups[g.name] = (u.groups[g.name] || 0) + 1;
        });
      }
    });

    return Object.values(userMap).map((u) => ({
      id: u.id,
      username: u.username,
      totalParticipations: u.totalParticipations,
      groups: Object.entries(u.groups)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([name]) => name),
    }));
  }

  // async broadcast(data: {
  //   text: string;
  //   channelUsername: string;
  //   messageId: string;
  // }) {
  //   try {
  //     this.logger.log(
  //       `broadcast: начало рассылки channel=${data.channelUsername}`,
  //     );

  //     const channel = await this._channelService.findOneByName(
  //       data.channelUsername,
  //     );
  //     const users = await this._contestParticipationService.getAllByGroupId(
  //       channel?.telegramId!,
  //     );

  //     this.logger.debug(`broadcast: получено пользователей=${users.length}`);

  //     const uniqueUsers = Array.from(
  //       new Map(users.map((u) => [u.user.telegramId, u])).values(),
  //     );
  //     this.logger.log(
  //       `broadcast: уникальных пользователей=${uniqueUsers.length}`,
  //     );

  //     // 🔥 параллельная отправка
  //     const results = await Promise.allSettled(
  //       uniqueUsers.map((user) =>
  //         this._telegramService
  //           .sendPrivateMessage(
  //             user.user.telegramId,
  //             data.text,
  //             data.channelUsername,
  //             data.messageId,
  //           )
  //           .then(() => {
  //             this.logger.log(
  //               `Сообщение отправлено пользователю telegramId=${user.user.telegramId}`,
  //             );
  //           }),
  //       ),
  //     );

  //     const failed = results.filter((r) => r.status === 'rejected').length;
  //     if (failed > 0) {
  //       this.logger.warn(`broadcast: не удалось отправить ${failed} сообщения`);
  //     }

  //     this.logger.log(
  //       `broadcast: завершено, всего=${uniqueUsers.length}, ошибок=${failed}`,
  //     );
  //   } catch (error) {
  //     this.logger.error(
  //       `broadcast: критическая ошибка: ${error.message}`,
  //       error.stack,
  //     );
  //   }
  // }

  async broadcast(dto: BroadcastDto) {
    try {
      this.logger.log(`broadcast: старт, параметры=${JSON.stringify(dto)}`);

      let targets: { telegramId: string }[] | number[] = [];

      const contest = dto.contestId
        ? await this._contestService.getContestById(dto.contestId)
        : undefined;

      const channel = dto.channelUsername
        ? await this._channelService.findOneByName(dto.channelUsername)
        : null;

      const channelName = channel ? channel.telegramName : undefined;

      const messageId = contest?.telegramMessageIds
        ?.find((msg) => msg.split(':')[0] === channel?.telegramId)
        ?.split(':')[1];

      if (dto.type === BroadcastType.USER) {
        // 🔹 одному пользователю
        if (!dto.userTgId) {
          throw new HttpException(
            'Не указали id пользователя',
            HttpStatus.BAD_REQUEST,
          );
        }
        const user = await this.getUserByTgId(dto.userTgId);

        if (!user) {
          this.logger.warn(`broadcast: пользователь ${dto.userTgId} не найден`);
          return { success: false, message: 'User not found' };
        }

        await this._telegramService.sendPrivateMessage(
          user.telegramId,
          dto.text,
          channelName,
          messageId,
        );
        targets = [{ telegramId: user.telegramId }];
        this.logger.log(`broadcast: режим=USER, userId=${user.telegramId}`);
      }

      if (dto.type === BroadcastType.GROUP) {
        // 🔹 всем участникам группы
        const channels = await this._channelService.findManyByColumn(
          'telegramName',
          dto.channels!,
        );

        if (!channels) {
          this.logger.warn(
            `broadcast: группы с именами: ${dto.channels?.join(', ')} не найден`,
          );
          return { success: false, message: 'Channels not found' };
        }

        const users = await this._contestParticipationService.findManyByColumn(
          'groupId',
          channels.map((c) => Number(c.telegramId)),
        );
console.log(users);

        const uniqueUsers = Array.from(
          new Map(users.map((u) => [u.user.telegramId, u.user])).values(),
        );

        targets = uniqueUsers.map((u) => Number(u.telegramId));

        const checkedUsers = await this._telegramService.areUsersSubscribed(
          targets,
          channels,
        );

        await Promise.all(
          checkedUsers
            .filter((u) => u.subscribedToAtLeastOne)
            .map((u) =>
              this._telegramService
                .sendPrivateMessage(
                  u.telegramId,
                  dto.text,
                  channelName,
                  messageId,
                )
                .then(() => {
                  this.logger.log(
                    `Сообщение отправлено пользователю telegramId=${u.telegramId}`,
                  );
                }),
            ),
        );

        this.logger.log(
          `broadcast: режим=GROUP, group=${dto.channelUsername}, пользователей=${targets.length}`,
        );
      }

      if (dto.type === BroadcastType.ALL) {
        // 🔹 всем пользователям
        const allUsers = await this.getAllUsers();
        const channels = await this._channelService.findAll();
        const userIds = allUsers.map((u) => Number(u.telegramId));

        const checkedUsers = await this._telegramService.areUsersSubscribed(
          userIds,
          channels,
        );

        const targets = await Promise.all(
          checkedUsers
            .filter((u) => u.subscribedToAtLeastOne)
            .map(async (u) => {
              await this._telegramService.sendPrivateMessage(
                u.telegramId,
                dto.text,
                channelName,
                messageId,
              );
              this.logger.log(
                `Сообщение отправлено пользователю telegramId=${u.telegramId}`,
              );
              return u.telegramId; // возвращаем telegramId из промиса
            }),
        );

        // теперь targets — это массив всех отправленных telegramId
        this.logger.log(
          `Сообщения отправлены пользователям: ${targets.join(',')}`,
        );
        this.logger.log(
          `broadcast: режим=ALL, пользователей=${targets.length}`,
        );
      }

      // 🔥 параллельная отправка
      // const results = await Promise.allSettled(
      //   targets.map((t) =>
      //     this._telegramService
      //       .sendPrivateMessage(
      //         t.telegramId,
      //         dto.text,
      //         dto.channelUsername,
      //         dto.messageId,
      //       )
      //       .then(() =>
      //         this.logger.log(
      //           `Сообщение отправлено пользователю telegramId=${t.telegramId}`,
      //         ),
      //       ),
      //   ),
      // );

      // const failed = results.filter((r) => r.status === 'rejected').length;
      // this.logger.log(
      //   `broadcast: завершено, всего=${targets.length}, ошибок=${failed}`,
      // );

      return { success: true, total: targets.length };
    } catch (error) {
      this.logger.error(
        `broadcast: критическая ошибка: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
