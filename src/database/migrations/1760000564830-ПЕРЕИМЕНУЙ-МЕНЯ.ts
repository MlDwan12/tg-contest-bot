import { MigrationInterface, QueryRunner } from 'typeorm';

export class fix1760000564830 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contest_participations" ADD CONSTRAINT "contest_participations_user_contest_unique" UNIQUE ("userId", "contestId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contest_participations" DROP CONSTRAINT "contest_participations_user_contest_unique"`,
    );
  }
}
