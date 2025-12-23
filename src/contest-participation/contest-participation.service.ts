import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ContestParticipation } from './entities/contest-participation.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Contest } from 'src/contest/entities/contest.entity';
import { User } from 'src/users/entities/user.entity';
import { TelegramService } from 'src/telegram/telegram.service';
import { ContestService } from 'src/contest/contest.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class ContestParticipationService {
  private readonly logger = new Logger(ContestParticipationService.name);

  constructor(
    @InjectRepository(ContestParticipation)
    private readonly participationRepo: Repository<ContestParticipation>,
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => ContestService))
    private contestService: ContestService,
    @InjectQueue('subscription-check') private readonly telegramQueue: Queue,
    @InjectQueue('post-edit') private readonly telegramEditQueue: Queue,
    @InjectRedis() private readonly redisClient: Redis,
  ) {}

  async registerParticipation(
    user: User,
    contest: any,
    status: 'verified' | 'winner' = 'verified',
    groupId: number,
  ): Promise<ContestParticipation[] | { data: [] }> {
    this.logger.log(
      `Регистрация участия: userId=${user.id}, contestId=${contest.id}, groupId=${groupId}, status=${status}`,
    );

    // 🟠 Проверка — конкурс завершён
    if (contest.status === 'completed') {
      this.logger.warn(
        `Попытка регистрации в завершённый конкурс id=${contest.id}`,
      );

      const winners = await this.participationRepo.query(
        `
      SELECT 
        cp.id,
        cp."contestId",
        cp.status,
        cp."prizePlace",
        u.id AS "userId",
        u.username,
        u."telegramId"
      FROM contest_participations cp
      JOIN users u ON u.id = cp."userId"
      WHERE cp."contestId" = $1 AND cp.status = 'winner'
      `,
        [contest.id],
      );
      return winners;
    }

    const requiredGroups = contest.requiredGroups?.map((g) => g.name) || [];

    // 🟡 Проверка — пользователь подписан на все требуемые группы
    // if (requiredGroups.length > 0) {
    //   await this.telegramService.isUserSubscribed(
    //     contest.requiredGroups,
    //     Number(user.telegramId),
    //   );
    // }

    const redisKey = `contest:participants:${contest.id}`;

    // 🟢 Пытаемся вставить нового участника
    const insertResult = await this.participationRepo.query(
      `
    INSERT INTO contest_participations("userId", "contestId", "status", "groupId")
    VALUES ($1, $2, $3, $4)
    ON CONFLICT("userId", "contestId") DO NOTHING
    RETURNING id
    `,
      [user.id, contest.id, status, groupId],
    );

    let currentCount: number;

    if (insertResult.length > 0) {
      // Новый уникальный участник
      currentCount = await this.redisClient.incr(redisKey);
      await this.redisClient.expire(redisKey, 60 * 60 * 24); // TTL на сутки
    } else {
      // Уже существующий участник — проверяем Redis
      currentCount = await this.redisClient
        .get(redisKey)
        .then((v) => Number(v));
      if (!currentCount) {
        const countResult = await this.participationRepo.query(
          `SELECT COUNT(*) AS participant_count FROM contest_participations WHERE "contestId" = $1`,
          [contest.id],
        );
        currentCount = Number(countResult[0].participant_count);
        await this.redisClient.set(redisKey, currentCount, 'EX', 60 * 60 * 24);
      }
    }

    this.logger.log(`Текущий счётчик участников (Redis): ${currentCount}`);

    // 🟣 Обновляем посты в Telegram
    if (
      contest.telegramMessageIds &&
      currentCount > 0 &&
      insertResult.length > 0
    ) {
      const messagePairs = contest.telegramMessageIds.split(',');

      for (const pair of messagePairs) {
        const [channel, message] = pair.split(':');
        const jobId = `update-post-${contest.id}-${message}`;

        try {
          const existingJob = await this.telegramEditQueue.getJob(jobId);

          const jobData = {
            channelId: channel,
            messageId: Number(message),
            contest,
            buttonText: contest?.buttonText,
            clickCount: currentCount,
          };

          if (existingJob) {
            const state = await existingJob.getState();

            if (state === 'active') {
              this.logger.debug(
                `Задача ${jobId} уже выполняется. Пропускаем удаление.`,
              );
              await this.telegramEditQueue.add('edit-counter', jobData, {
                delay: 5000,
              });
            } else {
              await existingJob.remove().catch(() => {});
              await this.telegramEditQueue.add('edit-counter', jobData, {
                delay: 3000,
                jobId,
                removeOnComplete: true,
                removeOnFail: true,
              });
            }
          } else {
            await this.telegramEditQueue.add('edit-counter', jobData, {
              delay: 3000,
              jobId,
              removeOnComplete: true,
              removeOnFail: true,
            });
          }

          // if (!existingJob) {
          //   await this.telegramEditQueue.add('edit-counter', jobData, {
          //     delay: 3000,
          //     jobId,
          //     removeOnComplete: true,
          //     removeOnFail: true,
          //   });
          //   this.logger.debug(
          //     `Добавлена новая задача Telegram обновления (${jobId})`,
          //   );
          // } else {
          //   await existingJob.remove();
          //   await this.telegramEditQueue.add('edit-counter', jobData, {
          //     delay: 3000,
          //     jobId,
          //     removeOnComplete: true,
          //     removeOnFail: true,
          //   });
          //   this.logger.debug(
          //     `Задача Telegram обновления (${jobId}) обновлена через пересоздание`,
          //   );
          // }
        } catch (err) {
          this.logger.error(
            `Ошибка при обновлении Telegram-задачи: ${err.message}`,
            err.stack,
          );
        }
      }
    }

    return [];
  }

  async updatePlace(id: string, contestId: number, place: number) {
    const participation = await this.participationRepo.findOne({
      where: { user: { telegramId: id }, contest: { id: contestId } },
      relations: ['contest', 'user'],
    });

    if (!participation) {
      this.logger.warn(
        `Попытка обновить место: участник не найден, contestId=${contestId}, telegramId=${id}`,
      );
      return null;
    }

    participation.prizePlace = place;
    this.logger.log(
      `Присвоено место #${place}: userId=${participation.user.id}, contestId=${contestId}`,
    );

    return this.participationRepo.save(participation);
  }

  async updateWinner(ids: number[], contestId: number) {
    try {
      this.logger.log(
        `Обновление победителей: contestId=${contestId}, ids=[${ids.join(', ')}]`,
      );

      const contest = await this.contestService.getContestByIdWin(contestId);
      if (!contest) {
        this.logger.error(`Конкурс не найден: id=${contestId}`);
        throw new HttpException('Конкурс не найден', HttpStatus.NOT_FOUND);
      }

      const participantsUpdate = await this.participationRepo.find({
        where: { id: In(ids), contest: { id: contestId } },
        relations: { user: true, contest: true },
      });

      if (contest.winnerStrategy === 'manual' && !contest.winners.length) {
        contest.winnerStrategy = 'random';
        await this.contestService.saveContest(contest);
        this.logger.warn(
          `У конкурса id=${contestId} не было победителей, стратегия изменена на random`,
        );
      }

      if (contest.winners?.length) {
        let i = 1;
        contest.winners.forEach((winner) => {
          const participant = participantsUpdate.find(
            (p) => p.user?.id === winner.user.id,
          );
          if (participant) {
            participant.status = 'winner';
            participant.prizePlace = i;
            this.logger.log(
              `Назначен победитель вручную: userId=${participant.user.id}, place=${i}`,
            );
          }
          i++;
        });
      } else {
        participantsUpdate.forEach((p, idx) => {
          p.status = 'winner';
          p.prizePlace = idx + 1;
          this.logger.log(
            `Назначен победитель автоматически: userId=${p.user.id}, place=${idx + 1}`,
          );
        });
      }

      await this.participationRepo.save(participantsUpdate);

      const updated = await this.participationRepo.find({
        where: { id: In(ids), contest: { id: contestId } },
        relations: { user: true },
      });

      this.logger.log(
        `Победители обновлены: contestId=${contestId}, count=${updated.length}`,
      );

      return updated;
    } catch (error) {
      this.logger.error('Ошибка при обновлении победителей', error);
      throw error;
    }
  }

  async getAllByGroupId(groupId: string) {
    return this.participationRepo.find({
      where: { groupId: Number(groupId) },
      relations: { user: true },
    });
  }

  async findManyByColumn<K extends keyof ContestParticipation>(
    column: K,
    values: ContestParticipation[K][],
  ): Promise<ContestParticipation[]> {
    const whereClause = { [column]: In(values as any) } as Record<K, any>;
    return this.participationRepo.find({
      where: whereClause,
      relations: { user: true },
    });
  }
}
