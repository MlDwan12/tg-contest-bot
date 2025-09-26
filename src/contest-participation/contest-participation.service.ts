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
  ) {}

  async registerParticipation(
    user: User,
    contest: any,
    status: 'verified' | 'winner' = 'verified',
    groupId: number,
  ): Promise<ContestParticipation[] | { data: [] }> {
    // await this.telegramService.isUserSubscribed(
    //   contest.requiredGroups,
    //   Number(user.telegramId),
    // );

    await this.telegramQueue.add('subscription-check', {
      telegramId: user.telegramId,
      requiredGroups: contest.requiredGroups,
    });

    const participant = contest.participations.length;

    // if (contest.status === 'completed') {
    //   const winners = await this.participationRepo.find({
    //     where: { contest: { id: contest.id }, status: 'winner' },
    //     relations: { user: true },
    //     select: ['id', 'status', 'user', 'contest'],
    //   });
    //   return winners;
    // }

    if (contest.status === 'completed') {
      const winners = await this.participationRepo.query(
        `
      SELECT id, "userId", "contestId", status, "prizePlace"
      FROM contest_participations
      WHERE "contestId" = $1 AND status = 'winner'
    `,
        [contest.id],
      );
      return winners;
    }
    console.log(participant);

    await this.participationRepo.query(
      `
    INSERT INTO contest_participations("userId", "contestId", "status", "groupId")
    VALUES ($1, $2, $3, $4)
    ON CONFLICT("userId", "contestId") DO UPDATE
    SET "status" = EXCLUDED."status", "groupId" = EXCLUDED."groupId"
  `,
      [user.id, contest.id, status, groupId],
    );

    const countResult = await this.participationRepo.query(
      `
    SELECT COUNT(*) AS participant_count
    FROM contest_participations
    WHERE "contestId" = $1
  `,
      [contest.id],
    );

    const participantCount = Number(countResult[0].participant_count);

    if (contest.telegramMessageIds && participantCount > participant) {
      void Promise.all(
        contest.telegramMessageIds.split(',').map((e) => {
          const [channel, message] = e.split(':');

          return this.telegramEditQueue.add('edit-counter', {
            channelId: channel,
            messageId: Number(message),
            contest,
            buttonText: contest?.buttonText,
            newName: undefined,
            newText: undefined,
            newImageUrl: undefined,
            clickCount: participantCount,
          });
        }),
      );
    }

    return [];
  }

  async updatePlace(id: string, contestId: number, place: number) {
    const participation = await this.participationRepo.findOne({
      where: { user: { telegramId: id }, contest: { id: contestId } },
      relations: ['contest', 'user'],
    });

    if (!participation) return null;

    if (participation.contest.id !== contestId) return null;

    participation.prizePlace = place;

    return this.participationRepo.save(participation);
  }

  async updateWinner(ids: number[], contestId: number) {
    // //this.logger.log(
    //   `Обновление победителей для конкурса id=${contestId}, ids=${ids}`,
    // );

    const contest = await this.contestService.getContestByIdWin(contestId);
    const participantsUpdate = await this.participationRepo.find({
      where: {
        id: In(ids),
        contest: { id: contestId },
      },
      relations: { user: true, contest: true },
    });

    if (!contest) {
      this.logger.warn(`Конкурс id=${contestId} не найден`);
      throw new HttpException('Конкурс не найден', HttpStatus.NOT_FOUND);
    }

    // //this.logger.log(
    //   `Найдено участников для обновления: ${participants.map((p) => p.id)}`,
    // );

    if (contest.winnerStrategy === 'manual' && !contest.winners.length) {
      contest.winnerStrategy = 'random';
      await this.contestService.saveContest(contest);
      //this.logger.log(`Стратегия победителей установлена в random`);
    }
    console.log(1231231231, participantsUpdate);

    if (contest.winners?.length) {
      let i = 1;
      contest.winners.forEach((winner) => {
        const participant = participantsUpdate.find(
          (p) => p.user?.id === winner.user.id, // теперь точно есть user
        );
        if (participant) {
          participant.status = 'winner';
          participant.prizePlace = i;
        }
        i++;
      });
    } else {
      participantsUpdate.forEach((p, idx) => {
        p.status = 'winner';
        p.prizePlace = idx + 1;
      });
    }

    await this.participationRepo.save(participantsUpdate);

    const updated = await this.participationRepo.find({
      where: { id: In(ids), contest: { id: contestId } },
      relations: { user: true },
    });

    return updated;
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
