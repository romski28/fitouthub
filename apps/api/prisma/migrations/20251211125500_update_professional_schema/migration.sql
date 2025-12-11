/*
  Warnings:

  - You are about to drop the column `primaryTradeId` on the `Professional` table. All the data in the column will be lost.
  - You are about to drop the column `productCategories` on the `Professional` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Professional` table. All the data in the column will be lost.
  - You are about to drop the column `businessType` on the `Professional` table. All the data in the column will be lost.
  - Changed the column `serviceArea` on the `Professional` table. No longer required, it is now nullable.
  - Added the required column `email` to the `Professional` table without a default value.
  - Added the required column `phone` to the `Professional` table without a default value.
  - Added the required column `professionType` to the `Professional` table without a default value.

*/
-- DropForeignKey
ALTER TABLE "Professional" DROP CONSTRAINT "Professional_primaryTradeId_fkey";

-- AlterTable
ALTER TABLE "Professional" DROP COLUMN "primaryTradeId",
DROP COLUMN "productCategories",
DROP COLUMN "type",
DROP COLUMN "businessType",
ADD COLUMN "email" TEXT NOT NULL DEFAULT 'noemail@example.com',
ADD COLUMN "phone" TEXT NOT NULL DEFAULT '000-0000-0000',
ADD COLUMN "professionType" TEXT NOT NULL DEFAULT 'contractor',
ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "serviceArea" SET DATA TYPE TEXT USING CASE WHEN "serviceArea" IS NULL THEN NULL ELSE "serviceArea"[0] END;

-- Update the default values to be set as not default anymore
ALTER TABLE "Professional" ALTER COLUMN "email" DROP DEFAULT,
ALTER COLUMN "phone" DROP DEFAULT,
ALTER COLUMN "professionType" DROP DEFAULT;
