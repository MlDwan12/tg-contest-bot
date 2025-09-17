import {
  Body,
  Controller,
  Get,
  Post,
  Logger,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { User } from './entities/user.entity';

@ApiTags('Users')
@ApiBearerAuth() // Показываем, что эндпоинты защищены Bearer токеном
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Создать пользователя или найти существующего' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'Пользователь создан/найден',
    type: User,
  })
  async create(@Body() dto: CreateUserDto): Promise<User> {
    this.logger.log(
      `Создание пользователя: telegramId=${dto.telegramId}, username=${dto.userName}`,
    );
    const user = await this.usersService.findOrCreate(dto);
    this.logger.log(`Пользователь успешно создан/найден: id=${user.id}`);
    return user;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Получить всех пользователей с участием в конкурсах',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Номер страницы',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Количество пользователей на странице',
  })
  @ApiResponse({
    status: 200,
    description: 'Список пользователей с пагинацией',
    schema: {
      example: {
        users: [
          {
            id: 1,
            telegramId: '123456',
            username: 'JohnDoe',
            participations: [],
          },
        ],
        total: 1,
      },
    },
  })
  async getAllUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    this.logger.log(
      `Запрос списка пользователей, page=${page}, limit=${limit}`,
    );
    const users = await this.usersService.getUsersStats();

    return users;
  }
}
