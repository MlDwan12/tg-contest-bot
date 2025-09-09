import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Logger,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @Post()
  async create(@Body() createAdminDto: CreateAdminDto) {
    this.logger.log(
      `Создание администратора: ${JSON.stringify(createAdminDto)}`,
    );
    return this.adminService.create(createAdminDto);
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
