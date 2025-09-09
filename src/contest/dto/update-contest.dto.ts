import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateContestDto } from './create-contest.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateContestDto extends PartialType(CreateContestDto) {
  @ApiPropertyOptional({
    description: 'ID групп, в которых разрешено участие (через запятую)',
    example: '-1001234567890,-1009876543210',
  })
  @IsOptional()
  @IsString({ message: 'Список разрешённых групп должен быть строкой' })
  winners?: string;
}
