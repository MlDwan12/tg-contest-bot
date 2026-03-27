import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { ContestModule } from './contest/contest.module';
import { ContestParticipationModule } from './contest-participation/contest-participation.module';
import { TelegramModule } from './telegram/telegram.module';
import { validationSchema } from './config/validation.schema';
import { ScheduleModule } from '@nestjs/schedule';
import { ChannelModule } from './channel/channel.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CronModule } from './cron/cron.module';
import { BullModule } from '@nestjs/bullmq';
import { QueueModule } from './queue/queue.module';
import { QueueCleaner } from './queue/queue-cleaner.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: configService.get<number>('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USER'),
        password: configService.get('DATABASE_PASSWORD', ''),
        database: configService.get('DATABASE_NAME'),
        autoLoadEntities: true,
        synchronize: false,
        extra: {
          max: 50, // по умолчанию часто меньше
        },
      }),
      inject: [ConfigService],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
    BullModule.registerQueue(
      {
        name: 'post-edit',
      },
      {
        name: 'subscription-check',
      },
      {
        name: 'broadcast',
      },
    ),
    UsersModule,
    ContestModule,
    ContestParticipationModule,
    TelegramModule,
    ChannelModule,
    ScheduleModule.forRoot(),
    AdminModule,
    AuthModule,
    CronModule,
    QueueModule,
  ],
  controllers: [],
  providers: [QueueCleaner],
})
export class AppModule {}
