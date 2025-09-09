import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateChannelDto {
  @ApiProperty({
    description: 'ID канала или группы в Telegram (обычно начинается с -100)',
    example: '-1002949180383',
  })
  @IsOptional()
  @IsString()
  telegramId: string;

  @ApiProperty({
    description: 'Имя канала или группы в Telegram (обычно уникальное)',
    example: 'гйцунш',
  })
  @IsString()
  telegramName: string;

  @ApiProperty({
    description: 'Название канала/группы',
    example: 'Конкурсы и розыгрыши',
  })
  @IsOptional()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Описание канала (опционально)',
    example: 'Здесь публикуются все активные конкурсы',
    required: false,
  })
  @IsOptional()
  @IsString()
  type?: string;
}
