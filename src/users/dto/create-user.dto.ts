import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description:
      'Telegram ID пользователя (может быть отрицательным и очень большим)',
    example: '123456789',
  })
  @IsNumber()
  telegramId: number;

  @ApiPropertyOptional({
    description: 'Username пользователя (опционально, может быть пустым)',
    example: 'cool_user',
    required: false,
  })
  @IsOptional()
  @IsString()
  userName?: string;
}
