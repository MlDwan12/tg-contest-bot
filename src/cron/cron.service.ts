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
    // //this.logger.log(
    //   `Создана новая задача в БД: ${task.type}-${task.referenceId}`,
    // );
    return this.scheduledTaskRepo.save(scheduledTask);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scanTasksAndSchedule() {
    const now = new Date();
    const tasks = await this.scheduledTaskRepo.find({
      where: { status: ScheduledTaskStatus.PENDING },
    });
    //this.logger.log(`Сканирование задач: найдено ${tasks.length} задач`);

    for (const task of tasks) {
      const jobName = `${task.type}-${task.referenceId}`;
      let exists = false;
      try {
        exists = !!this.schedulerRegistry.getCronJob(jobName);
      } catch {
        exists = false;
      }

      if (exists) {
        //this.logger.log(`Задача ${jobName} уже запланирована, пропускаем`);
        continue;
      }

      const runAt = new Date(task.runAt);
      if (runAt <= now && task.status === ScheduledTaskStatus.PENDING) {
        // просрочено — запускаем немедленно
        //this.logger.log(`Просроченная задача ${jobName}, запускаем немедленно`);
        await this.executeTask(task); // нужно, чтобы у тебя был метод выполнить задачу сразу
      } else {
        // запланировано на будущее
        //this.logger.log(`Запланирована задача ${jobName} на ${runAt}`);
        this.scheduleTask(task);
      }
    }
  }

  scheduleTask(task: any) {
    const cronExpression = this.convertDateToCron(new Date(task.runAt));
    // //this.logger.log(
    //   `Создание CronJob для задачи ${task.type}-${task.referenceId}`,
    // );

    const job = new CronJob(cronExpression, async () => {
      // //this.logger.log(
      //   `Выполнение задачи: ${task.type} для referenceId: ${task.referenceId}`,
      // );
      const contest = await this.contestService.getContestById(
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
              // //this.logger.log(
              //   `Конкурс ${contest.id} отправлен в канал ${channel.telegramId}`,
              // );
            }),
          );

          if (contest.status === 'pending') {
            contest.telegramMessageIds = telegramMessageIds;
            contest.status = 'active';
            await this.contestService.saveContest(contest);
            telegramMessageIds.length = 0;
            //this.logger.log(`Конкурс ${contest.id} активирован`);
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

          const winners = await this.contestService.getWinners(contest.id);
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
                console.log(telegramMessageIds);

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
                  await this._telegramService.sendPrivateMessage(
                    winner.user.telegramId,
                    'Поздравляю, вы победили в конкурсе 🎉',
                    group.telegramName,
                    messageIds[0]!,
                  );
                  this.logger.log(
                    `ЛС отправлено победителю userId=${winner.user.id}`,
                  );
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
            //this.logger.log(`Конкурс ${contest.id} завершен`);
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
    // //this.logger.log(
    //   `CronJob ${task.type}-${task.referenceId} успешно добавлен и запущен`,
    // );
  }

  private convertDateToCron(date: Date): string {
    return `${date.getSeconds()} ${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;
  }

  public getValueByGroupId(input: string, groupId: string): string | null {
    console.log(input, groupId);

    const cleaned = input.replace(/^\[|\]$/g, '');
    const pairs = cleaned.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split(':');
      if (key === groupId) return value;
    }
    return null;
  }

  async findTaskByRef(type: ScheduledTaskType, referenceId: number) {
    //this.logger.log(`Поиск задачи: ${type}-${referenceId}`);
    return this.scheduledTaskRepo.findOne({
      where: { type, referenceId, status: ScheduledTaskStatus.PENDING },
    });
  }

  async deleteTaskFromDb(id: number | string) {
    //this.logger.log(`Удаление задачи из БД, id=${id}`);
    return this.scheduledTaskRepo.delete(id);
  }

  removeScheduledJob(task: ScheduledTask) {
    const jobName = `${task.type}-${task.referenceId}`;
    try {
      this.schedulerRegistry.deleteCronJob(jobName);
      //this.logger.log(`Удалён CronJob ${jobName}`);
    } catch {
      this.logger.warn(`CronJob ${jobName} не найден для удаления`);
    }
  }

  public async executeTask(task: ScheduledTask) {
    // if (!task) return;
    console.log(123);

    this.logger.debug(
      `Начало выполнения задачи: ${task.type}-${task.referenceId}`,
    );
    console.log('getContestById======> ', task.referenceId);

    const contest = await this.contestService.getContestById(task.referenceId);
    if (!contest) {
      this.logger.error(`Конкурс ${task.referenceId} не найден`);
      return;
    }

    try {
      // --- Публикация поста ---
      if (task.type === ScheduledTaskType.POST_PUBLISH) {
        console.log('contest.name=====>', contest.name);

        const channels = contest.allowedGroups;
        const telegramMessageIds: string[] = [];

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
      }

      // --- Завершение конкурса ---
      if (task.type === ScheduledTaskType.CONTEST_FINISH) {
        await this.handleContestCompletion(contest);
      }

      // --- Обновляем статус задачи ---
      task.status = ScheduledTaskStatus.COMPLETED;
      await this.scheduledTaskRepo.save(task);

      // --- Попытка вызвать CronJob, если он есть ---
      const jobName = `${task.type}-${task.referenceId}`;
      if (this.schedulerRegistry.doesExist('cron', jobName)) {
        const job = this.schedulerRegistry.getCronJob(jobName);
        await job.fireOnTick();
        this.schedulerRegistry.deleteCronJob(jobName);
        this.logger.debug(`CronJob ${jobName} успешно выполнен и удален`);
      } else {
        this.logger.debug(
          `CronJob ${jobName} не найден, задача выполнена напрямую`,
        );
      }
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
    const channelsName = contest.allowedGroups
      .map((e) => `${e.telegramName}`)
      .join('\n\n');

    contest.status = 'completed';
    await this.contestService.saveContest(contest);
    console.log(1222222222222);

    const winners = await this.contestService.getWinners(contest.id);

    if (winners.length) {
      await Promise.all(
        winners.map(async (winner) => {
          const group = contest.allowedGroups.find(
            (c) => c.telegramId === winner.groupId.toString(),
          );
          if (!group) {
            this.logger.warn(`Группа с id ${winner.groupId} не найдена`);
            return;
          }
          console.log(contest.telegramMessageIds);

          const messageIdsArray = Array.isArray(contest.telegramMessageIds)
            ? contest.telegramMessageIds
            : typeof contest.telegramMessageIds === 'string'
              ? contest.telegramMessageIds.split(',').map((id) => id.trim())
              : [];

          messageIdsArray
            .filter((msgId): msgId is string => msgId !== null)
            .map((msgId) => this.getValueByGroupId(msgId, group.telegramId));

          await this._telegramService.sendPrivateMessage(
            winner.user.telegramId,
            'Поздравляю, вы победили в конкурсе 🎉',
            group.telegramName,
            messageIdsArray[0]!,
          );
        }),
      );
      console.log(1, contest);

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

      for (const adminId of this.adminIds) {
        await this._telegramService.sendPrivateMessage(
          adminId,
          `Завершен конкурс: ${contest.name}\n\nГруппы, которые участвовали в розыгрыше:\n\n${channelsName}`,
        );
      }
    }
  }
}
