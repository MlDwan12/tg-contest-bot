import { BroadcastType } from '../enums/broadcast.enum';

export class BroadcastDto {
  type: BroadcastType;
  text: string;
  userTgId?: string;
  contestId?: number;
  imageUrl?: string;
  channelUsername?: string;
  channels?: string[];
}
