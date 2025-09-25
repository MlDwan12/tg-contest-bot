import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueUserContestToParticipation1758789749166
  implements MigrationInterface
{
  name = 'AddUniqueUserContestToParticipation1758789749166';

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
