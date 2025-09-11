import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
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
import path from 'path';
// import path from 'path';

type TextMessage = Message.TextMessage;
type PhotoMessage = Message.PhotoMessage;

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(@InjectBot() private readonly bot: Telegraf<any>) {}

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

    const webAppUrl = `https://t.me/my_test_contest_bot/apprandom?startapp=${groupId}_${contestId}`;

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

  async isUserSubscribed(chats: Channel[], telegramId: number) {
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
    if (unsub.length) {
      const msg = `Вы не подписаны на ${unsub.join(', ')}`;
      this.logger.warn(msg);
      throw new HttpException(msg, HttpStatus.CONFLICT);
    }

    return results;
  }

  async sendPrivateMessage(
    telegramId: number | string,
    text: string,
    channelUsername: string,
    messageId: string,
  ): Promise<Message.TextMessage | Message.PhotoMessage> {
    try {
      this.logger.log(`Отправка ЛС пользователю ${telegramId}`);
      return await this.bot.telegram.sendMessage(telegramId, text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Перейти к конкурсу 🎲',
                url: `https://t.me/${channelUsername}/${messageId}`,
              },
            ],
          ],
        },
      });
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

  // async editPost(
  //   channelId: string,
  //   messageId: number,
  //   contest: Contest,
  //   newText?: string,
  //   newImageUrl?: string,
  //   buttonText?: string,
  // ): Promise<Message.TextMessage | Message.PhotoMessage | true | undefined> {
  //   try {
  //     this.logger.log(
  //       `Редактирование поста ${messageId} в канале ${channelId}`,
  //     );
  //     const webAppUrl = `https://t.me/my_test_contest_bot/apprandom?startapp=${channelId}_${contest.id}`;
  //     const inlineKeyboard: InlineKeyboardMarkup = {
  //       inline_keyboard: [
  //         [{ text: buttonText ?? contest.buttonText, url: webAppUrl }],
  //       ],
  //     };
  //
  //     // Если меняется картинка или есть текст, используем editMessageMedia
  //     if (newImageUrl) {
  //       this.logger.log(`Редактируем фото сообщения ${messageId}`);
  //       const media: InputMediaPhoto = {
  //         type: 'photo',
  //         media: newImageUrl, // URL или File ID
  //         caption: newText ?? contest.description,
  //         parse_mode: 'HTML',
  //       };
  //
  //       const edited = await this.bot.telegram.editMessageMedia(
  //         Number(channelId),
  //         messageId,
  //         undefined,
  //         media,
  //         { reply_markup: inlineKeyboard },
  //       );
  //
  //       this.logger.log(`Фото сообщения ${messageId} обновлено`);
  //       return edited as unknown as Message.PhotoMessage | true;
  //     }
  //
  //     // Если только текст или кнопка
  //     if (newText) {
  //       this.logger.log(`Редактируем текст сообщения ${messageId}`);
  //       const edited = await this.bot.telegram.editMessageCaption(
  //         Number(channelId),
  //         messageId,
  //         undefined,
  //         newText,
  //         { parse_mode: 'HTML', reply_markup: inlineKeyboard },
  //       );
  //
  //       this.logger.log(`Текст сообщения ${messageId} обновлён`);
  //       return edited as unknown as Message.TextMessage | true | undefined;
  //     }
  //
  //     // if (buttonText) {
  //     //   this.logger.log(`Редактируем кнопки сообщения ${messageId}`);
  //     //   const edited = await this.bot.telegram.editMessageReplyMarkup(
  //     //     Number(channelId),
  //     //     messageId,
  //     //     undefined,
  //     //     inlineKeyboard,
  //     //   );
  //
  //     //   this.logger.log(`Кнопки сообщения ${messageId} обновлены`);
  //     //   return edited as unknown as Message.TextMessage | true | undefined;
  //     // }
  //
  //     this.logger.log(`Нет изменений для сообщения ${messageId}`);
  //     return undefined;
  //   } catch (err) {
  //     this.logger.error(
  //       `Ошибка при редактировании поста ${messageId} в канале ${channelId}: ${err.message}`,
  //       err.stack,
  //     );
  //     throw new HttpException(
  //       'Не удалось редактировать пост в канале',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  // async editPost(
  //   channelId: string,
  //   messageId: number,
  //   contest: Contest,
  //   newText?: string,
  //   buttonText?: string,
  // ) {
  //   try {
  //     this.logger.log(
  //       `Редактирование поста ${messageId} в канале ${channelId}`,
  //     );
  //     // const webAppUrl = `https://t.me/my_test_contest_bot/apprandom?startapp=finished${contestId}`;
  //     const oldWebAppUrl = `https://t.me/my_test_contest_bot/apprandom?startapp=${channelId}_${contest.id}`;
  //
  //     const keyboard: InlineKeyboardMarkup = {
  //       inline_keyboard: [[{ text: 'Конкурс окончен 🎲', url: oldWebAppUrl }]],
  //     };
  //     const oldButton = {
  //       inline_keyboard: [
  //         [{ text: buttonText ?? contest.buttonText, url: oldWebAppUrl }],
  //       ],
  //     };
  //
  //     if (newText) {
  //       return (await this.bot.telegram.editMessageCaption(
  //         Number(channelId),
  //         messageId,
  //         undefined,
  //         newText,
  //         {
  //           parse_mode: 'HTML',
  //           reply_markup: oldButton,
  //         },
  //       )) as Message.TextMessage | true | undefined;
  //     }
  //
  //     return (await this.bot.telegram.editMessageReplyMarkup(
  //       channelId,
  //       messageId,
  //       undefined,
  //       keyboard,
  //     )) as Message.TextMessage | true | undefined;
  //   } catch (err) {
  //     this.logger.error(
  //       `Ошибка при редактировании поста ${messageId} в канале ${channelId}: ${err.message}`,
  //       err.stack,
  //     );
  //     throw new HttpException(
  //       'Не удалось редактировать пост в канале',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  // async editPost(
  //   channelId: string,
  //   messageId: number,
  //   contest: Contest,
  //   newText?: string,
  //   buttonText?: string,
  // ) {
  //   try {
  //     this.logger.log(
  //       `Редактирование поста ${messageId} в канале ${channelId}`,
  //     );

  //     const oldWebAppUrl = `https://t.me/my_test_contest_bot/apprandom?startapp=${channelId}_${contest.id}`;

  //     const keyboard: InlineKeyboardMarkup = {
  //       inline_keyboard: [[{ text: 'Конкурс окончен 🎲', url: oldWebAppUrl }]],
  //     };

  //     const oldButton = {
  //       inline_keyboard: [
  //         [{ text: buttonText ?? contest.buttonText, url: oldWebAppUrl }],
  //       ],
  //     };

  //     if (newText) {
  //       if (contest?.imageUrl) {
  //         // Если точно знаешь, что это фото с caption → используй editMessageCaption
  //         return (await this.bot.telegram.editMessageCaption(
  //           Number(channelId),
  //           messageId,
  //           undefined,
  //           newText,
  //           {
  //             parse_mode: 'HTML',
  //             reply_markup: oldButton,
  //           },
  //         )) as Message.TextMessage | true | undefined;
  //       } else {
  //         // Попробуем сначала как текст
  //         return (await this.bot.telegram.editMessageText(
  //           Number(channelId),
  //           messageId,
  //           undefined,
  //           newText,
  //           {
  //             parse_mode: 'HTML',
  //             reply_markup: oldButton,
  //           },
  //         )) as Message.TextMessage | true | undefined;
  //       }
  //     }

  //     return (await this.bot.telegram.editMessageReplyMarkup(
  //       Number(channelId),
  //       messageId,
  //       undefined,
  //       keyboard,
  //     )) as Message.TextMessage | true | undefined;
  //   } catch (err) {
  //     this.logger.error(
  //       `Ошибка при редактировании поста ${messageId} в канале ${channelId}: ${err.message}`,
  //       err.stack,
  //     );
  //     throw new HttpException(
  //       'Не удалось редактировать пост в канале',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  async editPost(
    channelId: string,
    messageId: number,
    contest: Contest,
    newName?: string,
    newText?: string,
    newImageUrl?: string,
    buttonText?: string,
  ): Promise<TextMessage | PhotoMessage | true | undefined> {
    const webAppUrl = `https://t.me/my_test_contest_bot/apprandom?startapp=${channelId}_${contest.id}`;
    const inlineKeyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: buttonText ?? contest.buttonText ?? 'Участвую! 🎉',
            url: webAppUrl,
          },
        ],
      ],
    };

    try {
      this.logger.log(
        `Редактирование поста ${messageId} в канале ${channelId}`,
      );
      console.log(newImageUrl);

      let result: unknown;

      if (newImageUrl) {
        this.logger.log(`Редактируем фото сообщения ${messageId}`);
        const media: InputMediaPhoto = {
          type: 'photo',
          media: { source: createReadStream(`.${newImageUrl}`) }, // URL или file_id
          caption: newText ?? contest.description,
          parse_mode: 'HTML',
        };

        await this.bot.telegram.editMessageMedia(
          Number(channelId),
          messageId,
          undefined,
          media,
          { reply_markup: inlineKeyboard },
        );

        this.logger.log(`Фото сообщения ${messageId} обновлено`);
      } else if (newText) {
        // Если это фото с caption
        if (contest?.imageUrl) {
          this.logger.log(`Редактируем caption фото сообщения ${messageId}`);
          result = await this.bot.telegram.editMessageCaption(
            Number(channelId),
            messageId,
            undefined,
            `${contest.name}/n/n${newText}`,
            { parse_mode: 'HTML', reply_markup: inlineKeyboard },
          );
        } else {
          // Просто текстовое сообщение
          this.logger.log(`Редактируем текст сообщения ${messageId}`);
          result = await this.bot.telegram.editMessageText(
            Number(channelId),
            messageId,
            undefined,
            `${contest.name}/n/n${newText}`,
            { parse_mode: 'HTML', reply_markup: inlineKeyboard },
          );
        }
        this.logger.log(`Текст сообщения ${messageId} обновлён`);
      }
      if (newName) {
        if (contest?.imageUrl) {
          this.logger.log(`Редактируем caption фото сообщения ${messageId}`);
          result = await this.bot.telegram.editMessageCaption(
            Number(channelId),
            messageId,
            undefined,
            `${newName}/n/n${contest?.description}`,
            { parse_mode: 'HTML', reply_markup: inlineKeyboard },
          );
        } else {
          // Просто текстовое сообщение
          this.logger.log(`Редактируем текст сообщения ${messageId}`);
          result = await this.bot.telegram.editMessageText(
            Number(channelId),
            messageId,
            undefined,
            `${newName}/n/n${contest?.description}`,
            { parse_mode: 'HTML', reply_markup: inlineKeyboard },
          );
        }
      } else if (buttonText) {
        // Только обновляем кнопки
        this.logger.log(`Редактируем кнопки сообщения ${messageId}`);
        const replyMarkup =
          buttonText === 'none' ? { inline_keyboard: [] } : inlineKeyboard;

        result = await this.bot.telegram.editMessageReplyMarkup(
          Number(channelId),
          messageId,
          undefined,
          replyMarkup,
        );
        this.logger.log(`Кнопки сообщения ${messageId} обновлены`);
      } else {
        this.logger.log(`Нет изменений для сообщения ${messageId}`);
        result = undefined;
      }

      return result as TextMessage | PhotoMessage | true | undefined;
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
      // Получаем информацию о самом боте
      const botInfo = await this.bot.telegram.getMe();

      // Проверяем статус бота в указанном чате
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
}
