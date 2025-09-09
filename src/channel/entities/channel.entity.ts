import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Entity,
} from 'typeorm';

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, nullable: true })
  telegramId: string;

  @Column({ unique: true, nullable: true })
  telegramName: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  type: string;

  @CreateDateColumn()
  createdAt: Date;
}
