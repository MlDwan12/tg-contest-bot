import { Body, Controller, Get, Post, Logger, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateUserDto) {
    this.logger.log(`Создание пользователя: ${JSON.stringify(dto)}`);
    const user = await this.usersService.findOrCreate(dto);
    this.logger.log(`Пользователь успешно создан/найден: id=${user.id}`);
    return user;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllUsers() {
    this.logger.log('Запрос списка всех пользователей');
    const users = await this.usersService.getAllUsers();
    this.logger.log(`Количество пользователей: ${users.length}`);
    return users;
  }
}
