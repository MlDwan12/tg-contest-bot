import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ScheduledTaskType {
  POST_PUBLISH = 'post_publish',
  CONTEST_FINISH = 'contest_finish',
}

export enum ScheduledTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('scheduled_tasks')
export class ScheduledTask {
  @PrimaryGeneratedColumn('increment')
  id: string;

  @Column({ type: 'enum', enum: ScheduledTaskType })
  type: ScheduledTaskType;

  @Column()
  referenceId: number; // id поста или конкурса

  @Column({ type: 'timestamptz' })
  runAt: Date; // когда выполнять

  @Column({
    type: 'enum',
    enum: ScheduledTaskStatus,
    default: ScheduledTaskStatus.PENDING,
  })
  status: ScheduledTaskStatus;

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, any>; // дополнительные данные

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
