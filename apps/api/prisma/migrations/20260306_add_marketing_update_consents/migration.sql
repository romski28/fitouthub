ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "allowPartnerOffers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "allowPlatformUpdates" BOOLEAN NOT NULL DEFAULT true;
