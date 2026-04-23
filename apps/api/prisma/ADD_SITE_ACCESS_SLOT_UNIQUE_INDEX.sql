CREATE UNIQUE INDEX IF NOT EXISTS "SiteAccessRequest_active_visit_slot_unique"
ON "SiteAccessRequest" ("projectId", "visitScheduledAt")
WHERE "visitScheduledAt" IS NOT NULL
  AND "status" IN ('pending', 'approved_visit_scheduled');