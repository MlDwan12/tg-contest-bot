import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findOrCreate(tgUser: CreateUserDto) {
    const telegramId = String(tgUser.telegramId);
    this.logger.log(`Поиск пользователя с telegramId=${telegramId}`);

    let user = await this.userRepo.findOne({ where: { telegramId } });
    if (user) {
      this.logger.log(
        `Пользователь найден: id=${user.id}, username=${user.username}`,
      );
      return user;
    }

    this.logger.log(
      `Пользователь не найден, создаём нового: ${JSON.stringify(tgUser)}`,
    );
    user = this.userRepo.create({ telegramId, username: tgUser.userName });
    user = await this.userRepo.save(user);
    this.logger.log(
      `Новый пользователь создан: id=${user.id}, username=${user.username}`,
    );

    return user;
  }

  async getAllUsers() {
    this.logger.log('Получение всех пользователей с их участием в конкурсах');
    const users = await this.userRepo.find({
      relations: { participations: true },
    });
    this.logger.log(`Найдено пользователей: ${users.length}`);
    return users;
  }
}
