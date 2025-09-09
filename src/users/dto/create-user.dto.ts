import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description:
      'Telegram ID пользователя (может быть отрицательным и очень большим)',
    example: '123456789',
  })
  @IsNumber()
  telegramId: number;

  @ApiProperty({
    description: 'Username пользователя (опционально, может быть пустым)',
    example: 'cool_user',
    required: false,
  })
  @IsString()
  userName?: string;
}
