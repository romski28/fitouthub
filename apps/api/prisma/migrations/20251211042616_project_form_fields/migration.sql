/*
  Warnings:

  - You are about to drop the column `title` on the `Project` table. All the data in the column will be lost.
  - Added the required column `clientName` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectName` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `region` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "title",
ADD COLUMN     "budget" DECIMAL(12,2),
ADD COLUMN     "clientName" TEXT NOT NULL,
ADD COLUMN     "contractorName" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "projectName" TEXT NOT NULL,
ADD COLUMN     "region" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending';
