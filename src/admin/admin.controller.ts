import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Logger,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UsersService } from 'src/users/users.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

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
    return this.adminService.create(createAdminDto);
  }

  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/broadcast',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 1 * 1024 * 1024, // 1 MB
      },
    }),
  )
  @Post('broadcast')
  async broadcast(
    @Body() data: any,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (image) data.imageUrl = `/uploads/broadcast/${image.filename}`;
    return this.userService.broadcast(data);
  }

  @Get()
  async findAll() {
    return this.adminService.findAll();
  }

  @Get(':userName')
  async findOne(@Param('userName') userName: string) {
    return this.adminService.findOne({ userName });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    this.logger.warn(`Удаление администратора с id=${id}`);
    return this.adminService.remove(+id);
  }
}
