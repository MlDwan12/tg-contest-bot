import { PartialType } from '@nestjs/mapped-types';
import { CreateContestParticipationDto } from './create-contest-participation.dto';

export class UpdateContestParticipationDto extends PartialType(CreateContestParticipationDto) {}
