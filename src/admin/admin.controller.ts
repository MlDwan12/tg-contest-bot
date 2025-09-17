import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UsersService } from 'src/users/users.service';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly userService: UsersService,
  ) {}

  @Post()
  async create(@Body() createAdminDto: CreateAdminDto) {
    this.logger.log(
      `Создание администратора: ${JSON.stringify(createAdminDto)}`,
    );
    return this.adminService.create(createAdminDto);
  }

  @Post('broadcast')
  async broadcast(@Body() data: any) {
    this.logger.log(`Отправка рассылки на конкурс`);
    return this.userService.broadcast(data);
  }

  @Get()
  async findAll() {
    this.logger.log(`Запрос списка администраторов`);
    return this.adminService.findAll();
  }

  @Get(':userName')
  async findOne(@Param('userName') userName: string) {
    this.logger.log(`Поиск администратора по userName=${userName}`);
    return this.adminService.findOne({ userName });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    this.logger.warn(`Удаление администратора с id=${id}`);
    return this.adminService.remove(+id);
  }
}
