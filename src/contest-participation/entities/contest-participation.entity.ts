import { Contest } from 'src/contest/entities/contest.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  Unique,
  JoinColumn,
} from 'typeorm';

@Entity('contest_participations')
@Unique('contest_participations_user_contest_unique', ['userId', 'contestId'])
export class ContestParticipation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (u) => u.participations)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => Contest, (c) => c.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: Contest;

  @Column()
  contestId: number;

  @Column({ default: 'verified' })
  status: 'verified' | 'winner';

  @Column({ type: 'bigint', nullable: true })
  groupId: number;

  @Column({ type: 'int', nullable: true })
  prizePlace?: number;
}
