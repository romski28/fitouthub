-- Add optional site inspection availability date to Project.
-- Store UTC timestamp values (API converts HK local date input to UTC).
-- Safe to run multiple times.

ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "siteInspectionAvailableOn" TIMESTAMP(3);

-- Optional verification
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'Project'
--   AND column_name = 'siteInspectionAvailableOn';
