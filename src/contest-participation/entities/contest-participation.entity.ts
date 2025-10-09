import { Contest } from 'src/contest/entities/contest.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  Unique,
} from 'typeorm';

@Entity('contest_participations')
@Unique('contest_participations_user_contest_unique', ['user', 'contest'])
export class ContestParticipation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (u) => u.participations)
  user: User;

  @ManyToOne(() => Contest, (c) => c.participants, { onDelete: 'CASCADE' })
  contest: Contest;

  @Column({ default: 'verified' })
  status: 'verified' | 'winner';

  @Column({ type: 'bigint', nullable: true })
  groupId: number;

  @Column({ type: 'int', nullable: true })
  prizePlace?: number;
}
