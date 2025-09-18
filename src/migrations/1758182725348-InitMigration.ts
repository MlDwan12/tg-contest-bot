import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitMigration1758182725348 implements MigrationInterface {
  name = 'InitMigration1758182725348';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "contest_winner" ("id" SERIAL NOT NULL, "contestId" integer, "userId" integer, CONSTRAINT "PK_d9f32444cfafdd06d06f57a2788" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "channels" ("id" SERIAL NOT NULL, "telegramId" character varying, "telegramName" character varying, "name" character varying, "isActive" boolean NOT NULL DEFAULT true, "type" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5e784a29c519f9afa906b70bcdd" UNIQUE ("telegramId"), CONSTRAINT "UQ_455d91cd8147c690e2aa65eafa5" UNIQUE ("telegramName"), CONSTRAINT "PK_bc603823f3f741359c2339389f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "admins" ("id" SERIAL NOT NULL, "userName" character varying NOT NULL, "password" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d0fa2d5008d8ced32560b3b4cde" UNIQUE ("userName"), CONSTRAINT "PK_e3b38270c97a854c48d2e80874e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."contests_winnerstrategy_enum" AS ENUM('random', 'manual')`,
    );
    await queryRunner.query(
      `CREATE TABLE "contests" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "description" character varying, "winnerStrategy" "public"."contests_winnerstrategy_enum" NOT NULL DEFAULT 'random', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "status" character varying NOT NULL DEFAULT 'Completed', "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "imageUrl" character varying, "buttonText" character varying, "creatorId" integer, "prizePlaces" integer NOT NULL, "telegramMessageIds" text, CONSTRAINT "PK_0b8012f5cf6f444a52179e1227a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "contest_participations" ("id" SERIAL NOT NULL, "status" character varying NOT NULL DEFAULT 'verified', "groupId" bigint, "prizePlace" integer, "userId" integer, "contestId" integer, CONSTRAINT "PK_ea26ae8ec96d7c112dd6ec6fa6d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" SERIAL NOT NULL, "telegramId" character varying NOT NULL, "username" character varying, "firstName" character varying, "lastName" character varying, CONSTRAINT "UQ_df18d17f84763558ac84192c754" UNIQUE ("telegramId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."scheduled_tasks_type_enum" AS ENUM('post_publish', 'contest_finish')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."scheduled_tasks_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "scheduled_tasks" ("id" SERIAL NOT NULL, "type" "public"."scheduled_tasks_type_enum" NOT NULL, "referenceId" integer NOT NULL, "runAt" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."scheduled_tasks_status_enum" NOT NULL DEFAULT 'pending', "payload" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_abc9348e8ae95b59b11a982ea87" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "contest_allowed_channels" ("contestId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_d7b95471da3a9631265716c2a76" PRIMARY KEY ("contestId", "channelId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e2ae3613680b95e50eb6b034cb" ON "contest_allowed_channels" ("contestId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b9dec9b0a2802a5854522b9280" ON "contest_allowed_channels" ("channelId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "contest_required_channels" ("contestId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_eed8ecbdc36446812888d69b2da" PRIMARY KEY ("contestId", "channelId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7952b6602a5ce5e9dd0bcfb9fe" ON "contest_required_channels" ("contestId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b2424cd383f6a714e96b189182" ON "contest_required_channels" ("channelId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_winner" ADD CONSTRAINT "FK_9e91ce980fec49e581c3b76f3dd" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_winner" ADD CONSTRAINT "FK_5017a9c1c2eb1d87f130bc98361" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contests" ADD CONSTRAINT "FK_0aa1119efa2dfffd78fa6c8607f" FOREIGN KEY ("creatorId") REFERENCES "admins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_participations" ADD CONSTRAINT "FK_00f0a61376fc1b9d26cde26effb" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_participations" ADD CONSTRAINT "FK_549679dafe31ecd07dee499adac" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_allowed_channels" ADD CONSTRAINT "FK_e2ae3613680b95e50eb6b034cbc" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_allowed_channels" ADD CONSTRAINT "FK_b9dec9b0a2802a5854522b92807" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_required_channels" ADD CONSTRAINT "FK_7952b6602a5ce5e9dd0bcfb9fe3" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_required_channels" ADD CONSTRAINT "FK_b2424cd383f6a714e96b1891824" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contest_required_channels" DROP CONSTRAINT "FK_b2424cd383f6a714e96b1891824"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_required_channels" DROP CONSTRAINT "FK_7952b6602a5ce5e9dd0bcfb9fe3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_allowed_channels" DROP CONSTRAINT "FK_b9dec9b0a2802a5854522b92807"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_allowed_channels" DROP CONSTRAINT "FK_e2ae3613680b95e50eb6b034cbc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_participations" DROP CONSTRAINT "FK_549679dafe31ecd07dee499adac"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_participations" DROP CONSTRAINT "FK_00f0a61376fc1b9d26cde26effb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contests" DROP CONSTRAINT "FK_0aa1119efa2dfffd78fa6c8607f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_winner" DROP CONSTRAINT "FK_5017a9c1c2eb1d87f130bc98361"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contest_winner" DROP CONSTRAINT "FK_9e91ce980fec49e581c3b76f3dd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b2424cd383f6a714e96b189182"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7952b6602a5ce5e9dd0bcfb9fe"`,
    );
    await queryRunner.query(`DROP TABLE "contest_required_channels"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b9dec9b0a2802a5854522b9280"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e2ae3613680b95e50eb6b034cb"`,
    );
    await queryRunner.query(`DROP TABLE "contest_allowed_channels"`);
    await queryRunner.query(`DROP TABLE "scheduled_tasks"`);
    await queryRunner.query(`DROP TYPE "public"."scheduled_tasks_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."scheduled_tasks_type_enum"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "contest_participations"`);
    await queryRunner.query(`DROP TABLE "contests"`);
    await queryRunner.query(
      `DROP TYPE "public"."contests_winnerstrategy_enum"`,
    );
    await queryRunner.query(`DROP TABLE "admins"`);
    await queryRunner.query(`DROP TABLE "channels"`);
    await queryRunner.query(`DROP TABLE "contest_winner"`);
  }
}
