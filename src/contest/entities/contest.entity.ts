import { ContestParticipation } from 'src/contest-participation/entities/contest-participation.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
  ManyToOne,
  JoinTable,
  ManyToMany,
} from 'typeorm';
import { ContestWinner } from './contest_winners.entity';
import { Channel } from 'src/channel/entities/channel.entity';
import { Admin } from 'src/admin/entities/admin.entity';

@Entity('contests')
export class Contest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ['random', 'manual'], default: 'random' })
  winnerStrategy: 'random' | 'manual';

  @OneToMany(() => ContestWinner, (w) => w.contest)
  winners: ContestWinner[];

  @OneToMany(() => ContestParticipation, (p) => p.contest)
  participants: ContestParticipation[];

  @ManyToMany(() => Channel, { eager: true })
  @JoinTable({
    name: 'contest_allowed_channels',
    joinColumn: { name: 'contestId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'channelId', referencedColumnName: 'id' },
  })
  allowedGroups: Channel[];

  @ManyToMany(() => Channel, { eager: true })
  @JoinTable({
    name: 'contest_required_channels',
    joinColumn: { name: 'contestId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'channelId', referencedColumnName: 'id' },
  })
  requiredGroups: Channel[];

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: 'Completed' })
  status: 'pending' | 'active' | 'completed';

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string;

  @Column({ type: 'varchar', nullable: true })
  buttonText: string;

  @ManyToOne(() => Admin)
  @JoinColumn({ name: 'creatorId' })
  creator: Admin;

  @Column({ nullable: true })
  creatorId: number;

  @Column({ type: 'integer' })
  prizePlaces: number;

  @Column({ type: 'simple-array', nullable: true })
  telegramMessageIds?: string[];
}
