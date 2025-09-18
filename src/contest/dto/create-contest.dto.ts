import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDate,
  IsInt,
  IsPositive,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContestDto {
  @ApiProperty({
    description: 'Название конкурса',
    example: 'Розыгрыш iPhone 15',
  })
  @IsString({ message: 'Название должно быть строкой' })
  name: string;

  @ApiPropertyOptional({
    description: 'Описание конкурса',
    example: 'Участвуй в конкурсе и выиграй новенький iPhone 15!',
  })
  @IsOptional()
  @IsString({ message: 'Описание должно быть строкой' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Стратегия выбора победителя',
    enum: ['random', 'manual'],
    example: 'random',
  })
  @IsOptional()
  @IsEnum(['random', 'manual'], {
    message: 'Стратегия должна быть random или manual',
  })
  winnerStrategy?: 'random' | 'manual';

  @ApiPropertyOptional({
    description: 'ID групп, в которых разрешено участие (через запятую)',
    example: '-1001234567890,-1009876543210',
  })
  @IsOptional()
  @IsString({ message: 'Список разрешённых групп должен быть строкой' })
  allowedGroups?: string;

  @ApiPropertyOptional({
    description: 'ID обязательных групп для участия (через запятую)',
    example: '-1002223334445',
  })
  @IsOptional()
  @IsString({ message: 'Список обязательных групп должен быть строкой' })
  requiredGroups?: string;

  @ApiPropertyOptional({
    description: 'Дата начала конкурса',
    example: '2025-09-01T12:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDateString()
  startDate?: Date;

  @ApiProperty({
    description: 'Дата окончания конкурса',
    example: '2025-09-10T23:59:59Z',
  })
  @Type(() => Date)
  @IsDateString()
  endDate: Date;

  @ApiPropertyOptional({
    description: 'Дата публикации конкурса (если нужно запланировать)',
    example: '2025-08-30T10:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Дата публикации должна быть корректной датой' })
  scheduledAt?: Date;

  @ApiPropertyOptional({
    description: 'URL изображения конкурса',
    example: '/uploads/contest1.png',
  })
  @IsOptional()
  @IsString({ message: 'Ссылка на изображение должна быть строкой' })
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Количество призовых мест',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Количество призовых мест должно быть числом' })
  @IsPositive({ message: 'Количество призовых мест должно быть больше 0' })
  prizePlaces?: number;

  @ApiPropertyOptional({
    description: 'ID создателя конкурса',
    example: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'ID создателя должно быть числом' })
  @IsOptional()
  creatorId: number;

  @IsOptional()
  @IsString()
  buttonText: string;
}
