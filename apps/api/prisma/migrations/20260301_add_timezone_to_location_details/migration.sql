-- Add timezone field to ProjectLocationDetails
ALTER TABLE "ProjectLocationDetails" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Hong_Kong';
