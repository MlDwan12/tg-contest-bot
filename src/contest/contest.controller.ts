import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ContestService } from './contest.service';
import { CreateContestDto } from './dto/create-contest.dto';
import { Contest } from './entities/contest.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { UpdateContestDto } from './dto/update-contest.dto';
import { CurrentUserId } from 'src/decorators/adminId';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('contest')
export class ContestController {
  private readonly logger = new Logger(ContestController.name);

  constructor(private readonly contestService: ContestService) {}

  @Get()
  getAll(): Promise<Contest[]> {
    this.logger.log('Получен запрос: список всех конкурсов');
    return this.contestService.getContests();
  }

  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number): Promise<Contest | null> {
    this.logger.log(`Получен запрос: конкурс id=${id}`);
    return this.contestService.getContestById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  create(
    @CurrentUserId() userId: number,
    @Body() dto: CreateContestDto,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<Contest> {
    this.logger.log(`Создание конкурса пользователем id=${userId}`);
    if (image) dto.imageUrl = `/uploads/${image.filename}`;
    if (userId) dto.creatorId = userId;

    return this.contestService.createContest(dto);
  }

  @Delete(':contestId')
  async remove(@Param('contestId', ParseIntPipe) contestId: number) {
    this.logger.warn(`Удаление конкурса id=${contestId}`);
    await this.contestService.removeContest(contestId);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  updateContest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContestDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    this.logger.log(`Обновление конкурса id=${id}`);
    if (image) dto['imageUrl'] = `/uploads/${image.filename}`;
    return this.contestService.updateContest(id, dto);
  }
}
