-- ============================================================================
-- CLEANUP AND REPOPULATION SCRIPT FOR NOTIFICATION PREFERENCES
-- ============================================================================
-- This script:
-- 1. Identifies duplicate users (keep latest, mark for review)
-- 2. Flushes notification_log and notification_preference tables
-- 3. Repopulates notification_preference for all users and professionals
-- ============================================================================

-- STEP 1: Identify duplicate users (for review)
-- This shows users with duplicate emails - keep the most recent
SELECT 
  email,
  COUNT(*) as count,
  ARRAY_AGG(id ORDER BY "createdAt" DESC) as ids,
  MAX("createdAt") as latest_created
FROM "User"
GROUP BY email
HAVING COUNT(*) > 1;

-- STEP 2: Identify duplicate professionals (for review)
SELECT 
  email,
  COUNT(*) as count,
  ARRAY_AGG(id ORDER BY "createdAt" DESC) as ids,
  MAX("createdAt") as latest_created
FROM "Professional"
GROUP BY email
HAVING COUNT(*) > 1;

-- ============================================================================
-- CLEANUP: Delete old notification logs and preferences
-- ============================================================================
DELETE FROM "NotificationLog";
DELETE FROM "NotificationPreference";

-- ============================================================================
-- REPOPULATE: Create default notification preferences for all users
-- ============================================================================
INSERT INTO "NotificationPreference" (
  id,
  "userId",
  "primaryChannel",
  "fallbackChannel",
  "enableEmail",
  "enableWhatsApp",
  "enableSMS",
  "enableWeChat",
  "allowPartnerOffers",
  "allowPlatformUpdates",
  "createdAt",
  "updatedAt"
)
SELECT 
  gen_random_uuid(),
  u.id,
  'EMAIL'::"NotificationChannel",                    -- primaryChannel
  'WHATSAPP'::"NotificationChannel",                 -- fallbackChannel
  true,                             -- enableEmail
  CASE WHEN u."mobile" IS NOT NULL THEN true ELSE false END,  -- enableWhatsApp
  CASE WHEN u."mobile" IS NOT NULL THEN true ELSE false END,  -- enableSMS
  false,                            -- enableWeChat
  false,                            -- allowPartnerOffers (default: no partner offers)
  true,                             -- allowPlatformUpdates (default: yes to platform updates)
  NOW(),
  NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "NotificationPreference" np WHERE np."userId" = u.id
);

-- ============================================================================
-- REPOPULATE: Create default notification preferences for all professionals
-- ============================================================================
INSERT INTO "NotificationPreference" (
  id,
  "professionalId",
  "primaryChannel",
  "fallbackChannel",
  "enableEmail",
  "enableWhatsApp",
  "enableSMS",
  "enableWeChat",
  "allowPartnerOffers",
  "allowPlatformUpdates",
  "createdAt",
  "updatedAt"
)
SELECT 
  gen_random_uuid(),
  p.id,
  'EMAIL'::"NotificationChannel",                    -- primaryChannel
  'WHATSAPP'::"NotificationChannel",                 -- fallbackChannel
  true,                             -- enableEmail
  CASE WHEN p."phone" IS NOT NULL THEN true ELSE false END,  -- enableWhatsApp
  CASE WHEN p."phone" IS NOT NULL THEN true ELSE false END,  -- enableSMS
  false,                            -- enableWeChat
  false,                            -- allowPartnerOffers (default: no partner offers)
  true,                             -- allowPlatformUpdates (default: yes to platform updates)
  NOW(),
  NOW()
FROM "Professional" p
WHERE NOT EXISTS (
  SELECT 1 FROM "NotificationPreference" np WHERE np."professionalId" = p.id
);

-- ============================================================================
-- VERIFICATION: Show results
-- ============================================================================
SELECT 
  'Users with notification prefs' as type,
  COUNT(*) as count
FROM "NotificationPreference"
WHERE "userId" IS NOT NULL

UNION ALL

SELECT 
  'Professionals with notification prefs' as type,
  COUNT(*) as count
FROM "NotificationPreference"
WHERE "professionalId" IS NOT NULL

UNION ALL

SELECT 
  'Users without notification prefs' as type,
  COUNT(*) as count
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "NotificationPreference" np WHERE np."userId" = u.id
)

UNION ALL

SELECT 
  'Professionals without notification prefs' as type,
  COUNT(*) as count
FROM "Professional" p
WHERE NOT EXISTS (
  SELECT 1 FROM "NotificationPreference" np WHERE np."professionalId" = p.id
);
