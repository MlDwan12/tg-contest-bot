// import { Processor, Process } from '@nestjs/bull';
// import { Job } from 'bull';
// import { Injectable, Logger } from '@nestjs/common';
// import Redis from 'ioredis';
// import { TelegramService } from 'src/telegram/telegram.service';

// const redis = new Redis({ host: '127.0.0.1', port: 6379 });

// @Injectable()
// @Processor('contest')
// export class ContestProcessor {
//   private readonly logger = new Logger(ContestProcessor.name);

//   constructor(private readonly bot: TelegramService) {}

//   @Process('updateMessage')
//   async handleUpdate(job: Job<any>) {
//     const {
//       channelId,
//       messageId,
//       contestId,
//       newName,
//       newText,
//       newImageUrl,
//       buttonText,
//     } = job.data;

//     // Берём актуальный счётчик из Redis
//     const key = `contest:${contestId}:${channelId}:${messageId}`;
//     const count = (await redis.get(key)) || '0';

//     const webAppUrl = `${process.env.MINI_APP_URL}?startapp=${channelId}_${contestId}`;
//     const inlineKeyboard =
//       buttonText === 'none'
//         ? { inline_keyboard: [] }
//         : {
//             inline_keyboard: [
//               [
//                 {
//                   text: `${buttonText ?? 'Участвую! 🎉'} (${count})`,
//                   url: webAppUrl,
//                 },
//               ],
//             ],
//           };

//     const contentText = `${newName ?? ''}\n\n${newText ?? ''}`;

//     // Редактируем сообщение через Bot API
//     if (newImageUrl) {
//       await this.bot.editPost(
//         channelId,
//         messageId,
//         undefined,
//         {
//           type: 'photo',
//           media: { source: newImageUrl },
//           caption: contentText,
//           parse_mode: 'HTML',
//         },
//         { reply_markup: inlineKeyboard },
//       );
//     } else {
//       await this.bot.telegram.editMessageText(
//         Number(channelId),
//         messageId,
//         undefined,
//         contentText,
//         { parse_mode: 'HTML', reply_markup: inlineKeyboard },
//       );
//     }

//     this.logger.log(`✅ Updated message ${messageId} for contest ${contestId}`);
//   }
// }
