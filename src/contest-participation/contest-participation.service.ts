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

    // Проверка, если конкурс завершён
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

    const participantBefore = contest.participations.length;
    const redisKey = `contest:participants:${contest.id}`;

    // Используем транзакцию: вставляем только если ещё нет записи
    const insertResult = await this.participationRepo.query(
      `
    INSERT INTO contest_participations("userId", "contestId", "status", "groupId")
    VALUES ($1, $2, $3, $4)
    ON CONFLICT("userId", "contestId") DO NOTHING
    RETURNING id
    `,
      [user.id, contest.id, status, groupId],
    );

    const isNewParticipant = insertResult.length > 0;

    // Только если реально вставили нового участника — инкремент Redis
    if (isNewParticipant) {
      await this.redisClient.set(
        redisKey,
        Number(participantBefore + 1),
        'EX',
        60,
      );
      await this.redisClient.expire(redisKey, 60); // TTL на сутки
    } else {
      // Если участник уже был, можно подтянуть Redis из базы
      const countResult = await this.participationRepo.query(
        `SELECT COUNT(*) AS participant_count FROM contest_participations WHERE "contestId" = $1`,
        [contest.id],
      );
      await this.redisClient.set(
        redisKey,
        Number(countResult[0].participant_count),
        'EX',
        60 * 60 * 24,
      );
    }

    // Берём актуальное количество участников из базы
    const countResult = await this.participationRepo.query(
      `SELECT COUNT(*) AS participant_count FROM contest_participations WHERE "contestId" = $1`,
      [contest.id],
    );
    const dbCount = Number(countResult[0].participant_count);

    // Обновляем посты в Telegram только если количество участников увеличилось
    if (contest.telegramMessageIds && dbCount > participantBefore) {
      this.logger.log(
        `Обновление счётчика участников в постах: contestId=${contest.id}, count=${dbCount}`,
      );

      contest.telegramMessageIds.split(',').forEach((e) => {
        const [channel, message] = e.split(':');
        const jobId = `update-post-${contest.id}-${message}`;
        void this.telegramEditQueue.getJob(jobId).then((existingJob) => {
          if (!existingJob) {
            this.telegramEditQueue.add(
              'edit-counter',
              {
                channelId: channel,
                messageId: Number(message),
                contest,
                buttonText: contest?.buttonText,
                clickCount: dbCount,
              },
              { delay: 5000, jobId, removeOnComplete: true },
            );
          }
        });
      });
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
