import { BroadcastType } from '../enums/broadcast.enum';

export class BroadcastDto {
  type: BroadcastType;
  text: string;
  userTgId?: string;
  contestId?: number;
  channelUsername?: string;
  channels?: string[];
}
