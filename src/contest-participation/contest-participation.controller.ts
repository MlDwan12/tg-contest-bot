import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ContestParticipationService } from './contest-participation.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UsersService } from 'src/users/users.service';
import { ContestService } from 'src/contest/contest.service';

@Controller('contest-participation')
export class ContestParticipationController {
  private readonly logger = new Logger(ContestParticipationController.name);

  constructor(
    private readonly contestParticipationService: ContestParticipationService,
    private readonly userService: UsersService,
    private readonly contestService: ContestService,
  ) {}

  @Post()
  async create(
    @Body()
    dto: {
      contestId: number;
      telegramId: number;
      userName: string;
      groupId: number;
    },
  ) {
    this.logger.log(
      `Регистрация участия пользователя ${dto.userName} в конкурсе id=${dto.contestId}`,
    );

    if (!dto.contestId) {
      this.logger.warn(`Попытка зарегистрировать участие без contestId`);
      throw new HttpException(
        `Конкурс с id:  ${dto.contestId} не найден`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const contest = await this.contestService.getContestById(dto.contestId);
    if (!contest) {
      this.logger.warn(`Конкурс id=${dto.contestId} не найден`);
      throw new HttpException(
        `Конкурс с id: ${dto.contestId} не найден`,
        HttpStatus.NOT_FOUND,
      );
    }

    const user = await this.userService.findOrCreate({
      telegramId: dto.telegramId,
      userName: dto.userName,
    });

    this.logger.log(
      `Пользователь ${user.username} найден/создан с telegramId=${user.telegramId}`,
    );
    this.logger.log(`Регистрация участия в группе id=${dto.groupId}`);

    const participation =
      await this.contestParticipationService.registerParticipation(
        user,
        contest,
        'verified',
        dto.groupId,
      );

    this.logger.log(
      `Участие зарегистрировано: userId=${user.id}, contestId=${contest.id}`,
    );
    return participation;
  }
}
