import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { SchedulerRegistry, Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ScheduledTask,
  ScheduledTaskStatus,
  ScheduledTaskType,
} from './entities/cron.entity';
import { CronJob } from 'cron';
import { ContestService } from 'src/contest/contest.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { ContestParticipationService } from 'src/contest-participation/contest-participation.service';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { Contest } from 'src/contest/entities/contest.entity';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  private readonly adminIds: string[];

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectRepository(ScheduledTask)
    private readonly scheduledTaskRepo: Repository<ScheduledTask>,
    @Inject(forwardRef(() => ContestService))
    private contestService: ContestService,
    private _telegramService: TelegramService,
    @InjectBot() private readonly bot: Telegraf<any>,
    private readonly configService: ConfigService,
  ) {
    this.adminIds = this.configService
      .get<string>('ADMIN_IDS')!
      .split(',')
      .map((id) => id.trim());
  }

  async createTaskInDb(task: {
    type: ScheduledTaskType;
    referenceId: number;
    runAt: Date;
    payload?: Record<string, any>;
  }): Promise<ScheduledTask> {
    const scheduledTask = this.scheduledTaskRepo.create({
      type: task.type,
      referenceId: task.referenceId,
      runAt: task.runAt,
      status: ScheduledTaskStatus.PENDING,
      payload: task.payload,
    });
    return this.scheduledTaskRepo.save(scheduledTask);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scanTasksAndSchedule() {
    const now = new Date();
    const tasks = await this.scheduledTaskRepo.find({
      where: { status: ScheduledTaskStatus.PENDING },
    });

    for (const task of tasks) {
      const jobName = `${task.type}-${task.referenceId}`;
      let exists = false;
      try {
        exists = !!this.schedulerRegistry.getCronJob(jobName);
      } catch {
        exists = false;
      }

      if (exists) {
        continue;
      }

      const runAt = new Date(task.runAt);
      if (runAt <= now && task.status === ScheduledTaskStatus.PENDING) {
        const contest = await this.contestService.getContestByIdWin(
          task.referenceId,
        );
        await this.executeTask(task, contest);
      } else {
        this.scheduleTask(task);
      }
    }
  }

  scheduleTask(task: any) {
    const cronExpression = this.convertDateToCron(new Date(task.runAt));

    const job = new CronJob(cronExpression, async () => {
      const contest: any = await this.contestService.getContestByIdWin(
        task.referenceId,
      );

      if (!contest) {
        this.logger.error(`Конкурс ${task.referenceId} не найден`);
        return;
      }

      try {
        const oldTask = await this.scheduledTaskRepo.findOne({
          where: {
            type: task.type,
            referenceId: task.referenceId,
            status: ScheduledTaskStatus.PENDING,
          },
        });

        if (oldTask)
          this.schedulerRegistry.deleteCronJob(
            `${oldTask.type}-${oldTask.referenceId}`,
          );

        const channels = contest.allowedGroups;
        const telegramMessageIds: string[] = [];

        if (task.type === ScheduledTaskType.POST_PUBLISH) {
          await Promise.all(
            channels.map(async (channel) => {
              const telegramMessageId = await this._telegramService.sendPosts(
                channel.telegramId,
                `${contest.name}\n\n${contest.description}`,
                contest.imageUrl,
                contest.id,
                channel.telegramId,
                contest.buttonText,
              );
              const messageIdStr = `${telegramMessageId[0].chatId}:${telegramMessageId[0].messageId}`;

              telegramMessageIds.push(messageIdStr);
            }),
          );

          if (contest.status === 'pending') {
            contest.telegramMessageIds = telegramMessageIds;
            contest.status = 'active';
            await this.contestService.saveContest(contest);
            telegramMessageIds.length = 0;
          }
        } else if (task.type === ScheduledTaskType.CONTEST_FINISH) {
          this.logger.log(`Запуск завершения конкурса ${contest.id}`);

          const channelsName = contest.allowedGroups
            .map((e) => `@${e.telegramName}`)
            .join('\n\n');
          this.logger.debug(`Список каналов для конкурса: ${channelsName}`);

          contest.status = 'completed';
          await this.contestService.saveContest(contest);
          this.logger.log(
            `Статус конкурса ${contest.id} установлен на 'completed'`,
          );

          const winners = await this.contestService.getWinners(contest);
          this.logger.log(`Найдено ${winners.length} победителей`);

          if (winners.length) {
            await Promise.all(
              winners.map(async (winner) => {
                this.logger.debug(
                  `Обрабатываем победителя: userId=${winner.user.id}, groupId=${winner.groupId}`,
                );

                const group = channels.find(
                  (c) => c.telegramId === winner.groupId.toString(),
                );
                if (!group) {
                  this.logger.warn(
                    `Группа с id ${winner.groupId} не найдена для победителя userId=${winner.user.id}`,
                  );
                  return;
                }
                this.logger.debug(
                  `Соответствующая группа найдена: ${group.telegramName} (${group.telegramId})`,
                );
                console.log(
                  typeof contest.telegramMessageIds,
                  contest.telegramMessageIds,
                );

                const telegramMessageIds = (() => {
                  if (!contest.telegramMessageIds) return [];
                  if (Array.isArray(contest.telegramMessageIds))
                    return contest.telegramMessageIds;
                  if (typeof contest.telegramMessageIds === 'string')
                    return contest.telegramMessageIds
                      .split(',')
                      .map((id) => id.trim());
                  return [];
                })();

                const messageIds = telegramMessageIds
                  .filter((msgId): msgId is string => msgId !== null)
                  .map((msgId) =>
                    this.getValueByGroupId(msgId, group.telegramId),
                  );

                await Promise.all(
                  telegramMessageIds.map(async (e) => {
                    await this._telegramService.editPostQueue(
                      e.split(':')[0],
                      Number(e.split(':')[1]),
                      contest,
                      undefined,
                      undefined,
                      undefined,
                      'Узнать результат',
                      true,
                    );
                  }),
                );
                this.logger.debug(
                  `Сообщения для группы ${group.telegramName}: ${messageIds.join(', ')}`,
                );

                if (!messageIds.length) {
                  this.logger.warn(
                    `Нет сообщений для группы ${group.telegramName}, победитель userId=${winner.user.id}`,
                  );
                }

                try {
                  // await this._telegramService.sendPrivateMessage(
                  //   winner.user.telegramId,
                  //   'Поздравляю, вы победили в конкурсе 🎉',
                  //   group.telegramName,
                  //   messageIds[0]!,
                  // );
                  // this.logger.log(
                  //   `ЛС отправлено победителю userId=${winner.user.id}`,
                  // );
                } catch (err) {
                  this.logger.error(
                    `Ошибка при отправке ЛС победителю userId=${winner.user.id}: ${err.message}`,
                  );
                }
              }),
            );

            for (const adminId of this.adminIds) {
              await this._telegramService.sendPrivateMessage(
                adminId,
                `Завершен конкурс: ${contest.name}\n\nГруппы, которые участвовали в розыгрыше:\n\n${channelsName}`,
              );
            }
          } else {
            for (const adminId of this.adminIds) {
              await this._telegramService.sendPrivateMessage(
                adminId,
                `Произошла ошибка при выборе победителей`,
              );
            }
          }
        }

        if (oldTask) await this.scheduledTaskRepo.delete(oldTask.id);
      } catch (err) {
        this.logger.error(
          `Ошибка выполнения задачи ${task.type}-${task.referenceId}`,
          err.stack,
        );

        for (const adminId of this.adminIds) {
          await this._telegramService.sendPrivateMessage(
            adminId,
            `Произошла ошибка при завершен конкурса: ${contest.name}\n\nНужно завершить конкурс в ручную, через админ панель.`,
          );
        }
      }
    });

    this.schedulerRegistry.addCronJob(`${task.type}-${task.referenceId}`, job);
    job.start();
  }

  private convertDateToCron(date: Date): string {
    return `${date.getSeconds()} ${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;
  }

  public getValueByGroupId(input: string, groupId: string): string | null {
    const cleaned = input.replace(/^\[|\]$/g, '');
    const pairs = cleaned.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split(':');
      if (key === groupId) return value;
    }
    return null;
  }

  async findTaskByRef(type: ScheduledTaskType, referenceId: number) {
    return this.scheduledTaskRepo.findOne({
      where: { type, referenceId, status: ScheduledTaskStatus.PENDING },
    });
  }

  async deleteTaskFromDb(id: number | string) {
    return this.scheduledTaskRepo.delete(id);
  }

  removeScheduledJob(task: ScheduledTask) {
    const jobName = `${task.type}-${task.referenceId}`;
    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch {
      this.logger.warn(`CronJob ${jobName} не найден для удаления`);
    }
  }

  public async executeTask(task: ScheduledTask, contest: any) {
    this.logger.debug(
      `Начало выполнения задачи: ${task?.type}-${task?.referenceId}`,
    );

    try {
      if (task.type === ScheduledTaskType.POST_PUBLISH) {
        const channels = contest.allowedGroups;
        const telegramMessageIds: string[] = [];

        try {
          await Promise.all(
            channels.map(async (channel) => {
              const telegramMessageId = await this._telegramService.sendPosts(
                channel.telegramId,
                `${contest.name}\n\n${contest.description}`,
                contest.imageUrl,
                contest.id,
                channel.telegramId,
                contest.buttonText,
              );

              const messageIdStr = `${telegramMessageId[0].chatId}:${telegramMessageId[0].messageId}`;
              telegramMessageIds.push(messageIdStr);
            }),
          );

          if (contest.status === 'pending') {
            contest.telegramMessageIds = telegramMessageIds;
            contest.status = 'active';
            await this.contestService.saveContest(contest);
          }
        } catch (error) {
          this.logger.error('Ошибка при публикации постов в тг');
        }
      }

      // --- Завершение конкурса ---
      if (task.type === ScheduledTaskType.CONTEST_FINISH) {
        await this.handleContestCompletion(contest);
      }

      // --- Обновляем статус задачи ---
      task.status = ScheduledTaskStatus.COMPLETED;
      await this.scheduledTaskRepo.save(task);
    } catch (err) {
      this.logger.error(
        `Ошибка при выполнении задачи ${task.type}-${task.referenceId}`,
        err.stack,
      );
      task.status = ScheduledTaskStatus.FAILED;
      await this.scheduledTaskRepo.save(task);
    }
  }

  private async handleContestCompletion(contest: any) {
    try {
      const channelsName = contest.allowedGroups
        .map((e) => `@${e.telegramName}`)
        .join('\n\n');

      contest.status = 'completed';
      await this.contestService.saveContest(contest);

      const winners = await this.contestService.getWinners(contest);

      if (winners.length) {
        try {
          await Promise.all(
            winners.map(async (winner) => {
              const group = contest.allowedGroups.find(
                (c) => c.telegramId === winner.groupId.toString(),
              );
              if (!group) {
                this.logger.warn(`Группа с id ${winner.groupId} не найдена`);
                return;
              }

              const messageIdsArray = Array.isArray(contest.telegramMessageIds)
                ? contest.telegramMessageIds
                : typeof contest.telegramMessageIds === 'string'
                  ? contest.telegramMessageIds.split(',').map((id) => id.trim())
                  : [];

              messageIdsArray
                .filter((msgId): msgId is string => msgId !== null)
                .map((msgId) =>
                  this.getValueByGroupId(msgId, group.telegramId),
                );

              // await this._telegramService.sendPrivateMessage(
              //   winner.user.telegramId,
              //   'Поздравляю, вы победили в конкурсе 🎉',
              //   group.telegramName,
              //   messageIdsArray[0]!,
              // );
            }),
          );
        } catch (error) {
          this.logger.error('Ошибка при рассылке в тг', error);
          throw error;
        }

        try {
          for (const msgId of contest.telegramMessageIds ?? []) {
            if (msgId) {
              await this._telegramService.editPostQueue(
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
        } catch (error) {
          this.logger.error('Ошибка при редактировании постов в тг', error);
          throw error;
        }

        for (const adminId of this.adminIds) {
          await this._telegramService.sendPrivateMessage(
            adminId,
            `Завершен конкурс: ${contest.name}\n\nГруппы, которые участвовали в розыгрыше:\n\n${channelsName}`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Ошибка при завершении конкурса', error?.stack);
    }
  }
}
