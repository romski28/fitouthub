-- AlterTable
ALTER TABLE "ProjectProfessional" ADD COLUMN "directContactShared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "directContactSharedAt" TIMESTAMP(3);
