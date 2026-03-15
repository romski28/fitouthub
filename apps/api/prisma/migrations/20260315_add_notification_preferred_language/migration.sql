-- Add preferred language for notification/system messaging
ALTER TABLE "NotificationPreference"
ADD COLUMN "preferredLanguage" TEXT NOT NULL DEFAULT 'en';

-- Ensure any existing rows are normalized to English by default
UPDATE "NotificationPreference"
SET "preferredLanguage" = 'en'
WHERE "preferredLanguage" IS NULL OR "preferredLanguage" = '';