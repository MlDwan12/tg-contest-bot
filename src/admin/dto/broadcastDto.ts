import { BroadcastType } from '../enums/broadcast.enum';

export class BroadcastDto {
  type: BroadcastType;
  text: string;
  userTgId?: string;
  contestId?: number;
  mediaUrl?: string;
  channelId?: string;
  channels?: string;
  buttonText?: string;
  buttonUrl?: string;
}
