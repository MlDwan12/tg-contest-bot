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
  ): Promise<{ data: [] } | ContestParticipation[]> {
    this.logger.log(
      `Регистрация участия пользователя ${user.username} в конкурсе ${contest.name} (contestId=${contest.id})`,
    );

    // Проверка подписки
    await this.telegramService.isUserSubscribed(
      contest.requiredGroups,
      Number(user.telegramId),
    );
    this.logger.log(
      `Проверка подписки пользователя ${user.telegramId} завершена`,
    );

    if (contest.status === 'completed') {
      const winners = contest.participants.filter((p) => p.status === 'winner');
      this.logger.log(
        `Конкурс уже завершен, возвращаем победителей: ${winners.map((p) => p.user.id)}`,
      );
      return winners;
    }

    const exists = await this.participationRepo.findOne({
      where: { user: { id: user.id }, contest: { id: contest.id } },
    });

    if (exists) {
      this.logger.log(
        `Участие пользователя ${user.id} уже существует, обновляем статус`,
      );
      exists.status = status;
      await this.participationRepo.save(exists);
      return [];
    }

    const participation = this.participationRepo.create({
      user,
      contest,
      status,
      groupId,
    });
    await this.participationRepo.save(participation);
    this.logger.log(
      `Участие пользователя ${user.id} создано с id=${participation.id}`,
    );
    return [];
  }

  async updateWinner(ids: number[], contestId: number) {
    this.logger.log(
      `Обновление победителей для конкурса id=${contestId}, ids=${ids}`,
    );

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

    this.logger.log(
      `Найдено участников для обновления: ${participants.map((p) => p.id)}`,
    );

    const participantsUpdate = participants;

    if (contest.winnerStrategy === 'manual' && !contest.winners.length) {
      contest.winnerStrategy = 'random';
      await this.contestService.saveContest(contest);
      this.logger.log(`Стратегия победителей установлена в random`);
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
          this.logger.log(
            `Победитель обновлен: userId=${participant.user.id}, prizePlace=${i}`,
          );
        }
        i++;
      });
    } else {
      for (let i = 0; i < participantsUpdate.length; i++) {
        participantsUpdate[i].status = 'winner';
        participantsUpdate[i].prizePlace = i + 1;
        this.logger.log(
          `Победитель назначен: userId=${participantsUpdate[i].user.id}, prizePlace=${i + 1}`,
        );
      }
    }

    const updated = await this.participationRepo.save(participantsUpdate);
    this.logger.log(
      `Обновление победителей завершено, участников обновлено: ${updated.length}`,
    );
    return updated;
  }
}
