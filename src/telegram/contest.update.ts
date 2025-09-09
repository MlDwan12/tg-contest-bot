import { Update, Start, Command, Ctx, On, Action } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { ContestService } from 'src/contest/contest.service';
import { ContestParticipationService } from 'src/contest-participation/contest-participation.service';
import { Message, ParseMode } from 'telegraf/typings/core/types/typegram';
import { TelegramService } from './telegram.service';

interface CreateContestSession {
  step?: 'name' | 'description';
  name?: string;
  description?: string;
  scheduledContestId?: number;
}

@Update()
@Injectable()
export class ContestUpdate {
  private readonly logger = new Logger(ContestUpdate.name);

  constructor(
    private readonly userService: UsersService,
    private readonly contestService: ContestService,
    private readonly contestParticipationService: ContestParticipationService,
    private readonly telegramService: TelegramService,
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    const tgUser = ctx.from;
    const chatId = ctx.chat?.id;

    this.logger.log(
      `Bot started by chatId=${chatId}, user=${tgUser?.username}`,
    );

    if (tgUser) {
      await this.userService.findOrCreate({
        telegramId: tgUser.id,
        userName: tgUser.username || '',
      });

      await ctx.reply(
        `Привет, ${tgUser.first_name || 'друг'}!\n` +
          `ID чата: ${chatId}\n` +
          `Для списка конкурсов: /contests`,
      );
    } else if (ctx.channelPost) {
      const channelId = ctx.channelPost.chat.id;
      this.logger.log(`Channel post detected, channelId=${channelId}`);
      await ctx.reply(`ID этого канала: ${channelId}`);
    } else {
      this.logger.warn('Не удалось определить пользователя Telegram или канал');
      await ctx.reply(
        'Не удалось определить пользователя Telegram или канал 😕',
      );
    }
  }

  @Command('contests')
  async list(@Ctx() ctx: Context) {
    this.logger.log('Команда /contests вызвана');
    const contests = await this.contestService.getActiveContests();
    if (!contests.length) return ctx.reply('Нет активных конкурсов');

    let msg = '📋 Активные конкурсы:\n\n';
    contests.forEach(
      (c) => (msg += `ID: ${c.id} — ${c.name}\n${c.description || ''}\n\n`),
    );
    msg += 'Чтобы участвовать: /participate <id>';

    await ctx.reply(msg);
  }

  @Command('createcontest')
  async startCreate(@Ctx() ctx: Context & { session: CreateContestSession }) {
    this.logger.log('Начато создание конкурса');
    ctx.session = { step: 'name' };
    await ctx.reply('✍️ Введите название конкурса:');
  }

  @On('text')
  async handleCreate(@Ctx() ctx: Context & { session?: CreateContestSession }) {
    const message = ctx.message as Message.TextMessage;
    const text = message.text?.trim();
    if (!text) return;

    this.logger.log(`Получено сообщение: ${text}`);

    if (ctx.session?.step) {
      switch (ctx.session.step) {
        case 'name':
          ctx.session.name = text;
          ctx.session.step = 'description';
          this.logger.log(`Название конкурса установлено: ${text}`);
          await ctx.reply('📄 Теперь введите описание конкурса:');
          return;

        case 'description': {
          ctx.session.description = text;
          this.logger.log(`Описание конкурса установлено: ${text}`);

          if (!ctx.session.name) {
            this.logger.warn('Название конкурса не задано');
            await ctx.reply(
              '❌ Название конкурса не задано. Начните заново с /createcontest',
            );
            ctx.session = {};
            return;
          }

          const contest = await this.contestService.createContest({
            name: ctx.session.name,
            description: ctx.session.description,
            endDate: new Date(),
            creatorId: 0,
            buttonText: 'Участвовать',
          });

          this.logger.log(
            `Создан конкурс id=${contest.id}, name=${contest.name}`,
          );

          const postText = `🎉 Новый конкурс!\n\n<b>${contest.name}</b>\n\n${contest.description}`;
          await ctx.reply(postText, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '📢 Опубликовать',
                    callback_data: `publish_${contest.id}`,
                  },
                  {
                    text: '⏰ Отложить',
                    callback_data: `schedule_${contest.id}`,
                  },
                ],
              ],
            },
          });

          ctx.session = {};
          return;
        }
      }
    }
  }

  @Action(/publish_(.+)/)
  async publish(@Ctx() ctx: Context & { match?: RegExpExecArray }) {
    if (!ctx.match) return await ctx.answerCbQuery('❌ Неверные данные');

    const contestId = Number(ctx.match[1]);
    this.logger.log(`Публикация конкурса id=${contestId}`);

    const contest = await this.contestService.getContestById(contestId);

    if (!contest) {
      this.logger.warn(`Конкурс id=${contestId} не найден`);
      return await ctx.answerCbQuery('❌ Конкурс не найден');
    }

    contest.status = 'active';
    await this.contestService.saveContest(contest);

    await ctx.reply(`✅ Конкурс "${contest.name}" опубликован!`);
    await ctx.answerCbQuery('✅ Опубликовано!');
  }

  @Action(/schedule_(.+)/)
  async schedule(
    @Ctx()
    ctx: Context & { match?: RegExpExecArray; session?: CreateContestSession },
  ) {
    const contestId = Number(ctx.match?.[1]);
    this.logger.log(`Отложенная публикация конкурса id=${contestId}`);

    const contest = await this.contestService.getContestById(contestId);
    if (!contest) {
      this.logger.warn(`Конкурс id=${contestId} не найден`);
      return await ctx.answerCbQuery('❌ Конкурс не найден');
    }

    contest.status = 'pending';
    await this.contestService.saveContest(contest);

    ctx.session = { scheduledContestId: contest.id };

    await ctx.answerCbQuery('⏰ Конкурс сохранён для отложенной публикации!');
    await ctx.reply(
      '📅 Укажи дату/время публикации в формате YYYY-MM-DD HH:mm (например: 2025-08-25 18:00)',
    );
  }
}
