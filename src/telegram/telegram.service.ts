import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Telegraf, Telegram } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { createReadStream } from 'fs';
import {
  InlineKeyboardMarkup,
  InputMediaPhoto,
  Message,
} from 'telegraf/typings/core/types/typegram';
import { Channel } from 'src/channel/entities/channel.entity';
import { Contest } from 'src/contest/entities/contest.entity';
import { UsersService } from 'src/users/users.service';

type TextMessage = Message.TextMessage;
type PhotoMessage = Message.PhotoMessage;

interface SubscriptionDetail {
  chat: string;
  subscribed: boolean;
}

interface SubscriptionResult {
  telegramId: number;
  subscribedToAtLeastOne: boolean;
  details: SubscriptionDetail[];
  notSubscribedChats: string[];
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<any>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async sendPosts(
    chatIds: string | string[],
    text: string,
    photoUrl?: string,
    contestId?: number,
    groupId?: string,
    buttonText?: string,
  ): Promise<{ chatId: string; messageId: number }[]> {
    const chatIdsArray = Array.isArray(chatIds)
      ? [...new Set(chatIds)]
      : [...new Set(chatIds.split(',').map((id) => id.trim()))];

    this.logger.log(
      `Отправка постов в чаты: ${chatIdsArray.join(', ')}, contestId=${contestId}, groupId=${groupId}`,
    );

    const webAppUrl = `${process.env.MINI_APP_URL}?startapp=${groupId}_${contestId}`;
    // const webAppUrl = `https://t.me/my_test_contest_bot/apprandom?startapp=${groupId}_${contestId}`;

    const promises = chatIdsArray.map(async (chatId) => {
      try {
        let sentMessage: Message.PhotoMessage | Message.TextMessage;

        if (photoUrl) {
          const img = createReadStream(`.${photoUrl}`);
          const options: Parameters<Telegram['sendPhoto']>[2] = {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: buttonText ?? 'Участвовать', url: webAppUrl }],
              ],
            },
          };
          sentMessage = await this.bot.telegram.sendPhoto(
            chatId,
            { source: img },
            options,
          );
        } else {
          sentMessage = await this.bot.telegram.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: buttonText ?? 'Участвовать', url: webAppUrl }],
              ],
            },
          });
        }

        this.logger.log(
          `Сообщение успешно отправлено в чат ${chatId}, messageId=${sentMessage.message_id}`,
        );
        return { chatId, messageId: sentMessage.message_id };
      } catch (err) {
        this.logger.error(
          `Ошибка при отправке сообщения в чат ${chatId}: ${err.message}`,
          err.stack,
        );
        throw new HttpException(
          'Непредвиденная ошибка при отправке постов',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });

    return Promise.all(promises);
  }

  async deleteMessage(chatId: string, messageId: number) {
    try {
      this.logger.log(`Удаление сообщения ${messageId} из чата ${chatId}`);
      await this.bot.telegram.deleteMessage(chatId, messageId);
    } catch (err) {
      this.logger.error(
        `Ошибка при удалении сообщения ${messageId} из чата ${chatId}: ${err.message}`,
        err.stack,
      );
      throw new HttpException(
        'Непредвиденная ошибка при удалении постов и чатов',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getChatInfo(usernameOrId: string) {
    try {
      this.logger.log(`Получение информации о чате ${usernameOrId}`);
      return await this.bot.telegram.getChat(usernameOrId);
    } catch (err) {
      this.logger.error(
        `Ошибка при получении информации о чате ${usernameOrId}: ${err.message}`,
        err.stack,
      );
      throw new HttpException(
        'Непредвиденная ошибка при получении информации о чате',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async isUserSubscribed(
    chats: Channel[],
    telegramId: number,
    needCheck: boolean = true,
  ) {
    this.logger.log(
      `Проверка подписки пользователя ${telegramId} в ${chats.length} чатах`,
    );
    const results: { chat: string; subscribed: boolean }[] = [];

    for (const chat of chats) {
      try {
        const member = await this.bot.telegram.getChatMember(
          chat.telegramId,
          telegramId,
        );

        const subscribed = ['member', 'administrator', 'creator'].includes(
          member.status,
        );
        results.push({ chat: chat.telegramName, subscribed });
      } catch (err) {
        this.logger.warn(
          `Ошибка проверки подписки в чате ${chat.telegramId} для пользователя ${telegramId}: ${err.message}`,
        );
        results.push({ chat: chat.telegramName, subscribed: false });
      }
    }

    const unsub = results.filter((r) => !r.subscribed).map((r) => r.chat);
    if (unsub.length && needCheck) {
      const msg = `Вы не подписаны на ${unsub.join(', ')}`;
      this.logger.warn(msg);
      throw new HttpException(msg, HttpStatus.CONFLICT);
    }

    return results;
  }

  async areUsersSubscribed(
    users: number[],
    chats: Channel[],
  ): Promise<SubscriptionResult[]> {
    this.logger.log(
      `Проверка подписки ${users.length} пользователей в ${chats.length} чатах`,
    );

    return Promise.all(
      users.map(async (telegramId) => {
        const results = await Promise.allSettled(
          chats.map(async (chat) => {
            try {
              const member = await this.bot.telegram.getChatMember(
                chat.telegramId,
                telegramId,
              );
              const subscribed = [
                'member',
                'administrator',
                'creator',
              ].includes(member.status);
              return { chat: chat.telegramName, subscribed };
            } catch (err) {
              this.logger.warn(
                `Ошибка проверки подписки: chat=${chat.telegramId}, user=${telegramId}, ${err.message}`,
              );
              return { chat: chat.telegramName, subscribed: false };
            }
          }),
        );

        // Форматируем результаты
        const details: SubscriptionDetail[] = results.map((r) =>
          r.status === 'fulfilled'
            ? r.value
            : { chat: 'unknown', subscribed: false },
        );

        const notSubscribedChats = details
          .filter((d) => !d.subscribed)
          .map((d) => d.chat);

        const subscribedToAtLeastOne = details.some((d) => d.subscribed);

        return {
          telegramId,
          subscribedToAtLeastOne,
          details,
          notSubscribedChats,
        };
      }),
    );
  }

  // async sendPrivateMessage(
  //   telegramId: number | string,
  //   text: string,
  //   channelUsername?: string,
  //   messageId?: string,
  // ): Promise<Message.TextMessage | Message.PhotoMessage> {
  //   try {
  //     this.logger.log(`Отправка ЛС пользователю ${telegramId}`);
  //     return await this.bot.telegram.sendMessage(telegramId, text, {
  //       parse_mode: 'HTML',
  //       reply_markup: {
  //         inline_keyboard:
  //           channelUsername && messageId
  //             ? [
  //                 [
  //                   {
  //                     text,
  //                     url: `https://t.me/${channelUsername}/${messageId}`,
  //                   },
  //                 ],
  //               ]
  //             : [],
  //       },
  //     });
  //   } catch (err) {
  //     this.logger.error(
  //       `Ошибка при отправке ЛС пользователю ${telegramId}: ${err.message}`,
  //       err.stack,
  //     );
  //     throw new HttpException(
  //       'Не удалось отправить сообщение в личку',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  async sendPrivateMessage(
    telegramId: number | string,
    text: string,
    channelUsername?: string,
    messageId?: string,
    photoUrl?: string, // добавляем параметр для изображения
  ): Promise<Message.TextMessage | Message.PhotoMessage> {
    try {
      this.logger.log(`Отправка ЛС пользователю ${telegramId}`);

      if (photoUrl) {
        // Отправляем фото с подписью
        console.log(photoUrl);
        const img = createReadStream(`.${photoUrl}`);

        return await this.bot.telegram.sendPhoto(
          telegramId,
          { source: img },
          {
            caption: text,
            parse_mode: 'HTML',
            reply_markup:
              channelUsername && messageId
                ? {
                    inline_keyboard: [
                      [
                        {
                          text,
                          url: `https://t.me/${channelUsername}/${messageId}`,
                        },
                      ],
                    ],
                  }
                : undefined,
          },
        );
      } else {
        // Отправляем обычное сообщение
        return await this.bot.telegram.sendMessage(telegramId, text, {
          parse_mode: 'HTML',
          reply_markup:
            channelUsername && messageId
              ? {
                  inline_keyboard: [
                    [
                      {
                        text,
                        url: `https://t.me/${channelUsername}/${messageId}`,
                      },
                    ],
                  ],
                }
              : undefined,
        });
      }
    } catch (err) {
      this.logger.error(
        `Ошибка при отправке ЛС пользователю ${telegramId}: ${err.message}`,
        err.stack,
      );
      throw new HttpException(
        'Не удалось отправить сообщение в личку',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async editPost(
    channelId: string,
    messageId: number,
    contest: Contest,
    newName?: string,
    newText?: string,
    newImageUrl?: string,
    buttonText?: string,
  ): Promise<TextMessage | PhotoMessage | true | undefined> {
    console.log('contest ====> ', contest);
    console.log('fields ====> ', { newName, newText, newImageUrl, buttonText });

    const webAppUrl = `${process.env.MINI_APP_URL}?startapp=${channelId}_${contest.id}`;
    const countPart =
      contest.status === 'active' ? `(${contest.participants.length + 1})` : '';
    const inlineKeyboard: InlineKeyboardMarkup =
      buttonText === 'none'
        ? { inline_keyboard: [] }
        : {
            inline_keyboard: [
              [
                {
                  text: `${buttonText ?? contest.buttonText ?? 'Участвую! 🎉'} ${countPart}`,
                  url: webAppUrl,
                },
              ],
            ],
          };
    const contentText = `${newName ?? contest.name}\n\n${newText ?? contest.description}`;

    try {
      this.logger.log(
        `Редактирование поста ${messageId} в канале ${channelId}`,
      );

      if (newImageUrl) {
        this.logger.log(`Редактируем фото сообщения ${messageId}`);
        const media: InputMediaPhoto = {
          type: 'photo',
          media: { source: createReadStream(`.${newImageUrl}`) }, // URL или file_id
          caption: contentText,
          parse_mode: 'HTML',
        };

        const result = await this.bot.telegram.editMessageMedia(
          Number(channelId),
          messageId,
          undefined,
          media,
          { reply_markup: inlineKeyboard },
        );

        this.logger.log(`Фото сообщения ${messageId} обновлено`);
        return result as TextMessage | PhotoMessage | true | undefined;
      }

      if (contest?.imageUrl) {
        this.logger.log(`Редактируем caption фото сообщения ${messageId}`);
        const result = await this.bot.telegram.editMessageCaption(
          Number(channelId),
          messageId,
          undefined,
          contentText,
          { parse_mode: 'HTML', reply_markup: inlineKeyboard },
        );

        this.logger.log(`Текст сообщения ${messageId} обновлён`);
        return result as TextMessage | PhotoMessage | true | undefined;
      } else {
        // Просто текстовое сообщение
        this.logger.log(`Редактируем текст сообщения ${messageId}`);
        const result = await this.bot.telegram.editMessageText(
          Number(channelId),
          messageId,
          undefined,
          contentText,
          { parse_mode: 'HTML', reply_markup: inlineKeyboard },
        );

        this.logger.log(`Текст сообщения ${messageId} обновлён`);
        return result as TextMessage | PhotoMessage | true | undefined;
      }
    } catch (err) {
      this.logger.error(
        `Ошибка при редактировании поста ${messageId} в канале ${channelId}: ${err.message}`,
        err.stack,
      );
      throw new HttpException(
        'Не удалось редактировать пост в канале',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async isBotAdmin(channel: Channel): Promise<boolean> {
    try {
      const botInfo = await this.bot.telegram.getMe();

      const member = await this.bot.telegram.getChatMember(
        channel.telegramId,
        botInfo.id,
      );

      const isAdmin = ['administrator', 'creator'].includes(member.status);

      this.logger.log(
        `Бот ${botInfo.username} является ${
          isAdmin ? '' : 'не '
        }админом в чате ${channel.telegramName}`,
      );

      return isAdmin;
    } catch (err) {
      this.logger.error(
        `Ошибка при проверке прав бота в канале ${channel.telegramName}: ${err.message}`,
        err.stack,
      );
      throw new HttpException(
        'Не удалось проверить права бота в канале',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async checkHealth() {
    try {
      const me = await this.bot.telegram.getMe();
      return me;
    } catch (err) {
      throw new Error(`Telegram bot not available: ${err.message}`);
    }
  }
}
