-- Ensure UUID generation available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add DB default for ServiceMapping.id so CSV imports can omit id
ALTER TABLE "ServiceMapping"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;