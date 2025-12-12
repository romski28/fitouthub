/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Professional` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "locationPrimary" TEXT,
ADD COLUMN     "locationSecondary" TEXT,
ADD COLUMN     "locationTertiary" TEXT,
ADD COLUMN     "servicePrimaries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "serviceSecondaries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "Professional_email_key" ON "Professional"("email");
