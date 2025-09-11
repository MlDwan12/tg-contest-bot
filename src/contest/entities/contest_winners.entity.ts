import { User } from 'src/users/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Contest } from './contest.entity';

@Entity()
export class ContestWinner {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Contest, (contest) => contest.winners, { cascade: true })
  contest: Contest;

  @ManyToOne(() => User)
  user: User;
}
