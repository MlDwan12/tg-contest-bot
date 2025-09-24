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

@Injectable()
export class ContestParticipationService {
  private readonly logger = new Logger(ContestParticipationService.name);

  constructor(
    @InjectRepository(ContestParticipation)
    private readonly participationRepo: Repository<ContestParticipation>,
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => ContestService))
    private contestService: ContestService,
  ) {}

  async registerParticipation(
    user: User,
    contest: Contest,
    status: 'verified' | 'winner' = 'verified',
    groupId: number,
  ): Promise<ContestParticipation[] | { data: [] }> {
    await this.telegramService.isUserSubscribed(
      contest.requiredGroups,
      Number(user.telegramId),
    );

    if (contest.status === 'completed') {
      const winners = await this.participationRepo.find({
        where: { contest: { id: contest.id }, status: 'winner' },
        relations: { user: true },
        select: ['id', 'status', 'user', 'contest'],
      });
      return winners;
    }

    const [participation] = await this.participationRepo.query(
      `
    INSERT INTO contest_participations("userId", "contestId", "status", "groupId")
    VALUES ($1, $2, $3, $4)
    ON CONFLICT("userId", "contestId") DO UPDATE
    SET "status" = EXCLUDED."status", "groupId" = EXCLUDED."groupId"
    RETURNING id, "userId", "contestId", status, "groupId"
  `,
      [user.id, contest.id, status, groupId],
    );

    if (contest.telegramMessageIds?.length) {
      contest.telegramMessageIds.forEach((e) => {
        const [channel, message] = e.split(':');
        this.telegramService.editPostQueue(
          channel,
          Number(message),
          contest,
          undefined,
          undefined,
          undefined,
          contest.buttonText,
          false,
        );
      });
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

    const contest = await this.contestService.getContestById(contestId);
    const participants = await this.participationRepo.find({
      where: {
        id: In(ids),
        contest: { id: contestId },
      },
      relations: { contest: true, user: true },
    });

    if (!contest) {
      this.logger.warn(`Конкурс id=${contestId} не найден`);
      throw new HttpException('Конкурс не найден', HttpStatus.NOT_FOUND);
    }

    // //this.logger.log(
    //   `Найдено участников для обновления: ${participants.map((p) => p.id)}`,
    // );

    const participantsUpdate = participants;

    if (contest.winnerStrategy === 'manual' && !contest.winners.length) {
      contest.winnerStrategy = 'random';
      await this.contestService.saveContest(contest);
      //this.logger.log(`Стратегия победителей установлена в random`);
    }

    if (contest.winners.length) {
      let i = 1;
      contest.winners.forEach((winner) => {
        const participant = participantsUpdate.find(
          (p) => p.user.id === winner.user.id,
        );
        if (participant) {
          participant.status = 'winner';
          participant.prizePlace = i;
          // //this.logger.log(
          //   `Победитель обновлен: userId=${participant.user.id}, prizePlace=${i}`,
          // );
        }
        i++;
      });
    } else {
      for (let i = 0; i < participantsUpdate.length; i++) {
        participantsUpdate[i].status = 'winner';
        participantsUpdate[i].prizePlace = i + 1;
        // //this.logger.log(
        //   `Победитель назначен: userId=${participantsUpdate[i].user.id}, prizePlace=${i + 1}`,
        // );
      }
    }

    const updated = await this.participationRepo.save(participantsUpdate);
    // //this.logger.log(
    //   `Обновление победителей завершено, участников обновлено: ${updated.length}`,
    // );
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
