-- ============================================================
-- Add uploadedById + uploadedByRole to ProjectPhoto
-- Tracks which user (client or professional) uploaded each file
-- Legacy files (null uploadedById) are treated as client-owned
-- ============================================================

ALTER TABLE "ProjectPhoto"
ADD COLUMN IF NOT EXISTS "uploadedById" TEXT;

ALTER TABLE "ProjectPhoto"
ADD COLUMN IF NOT EXISTS "uploadedByRole" TEXT;

-- Index for ownership queries (delete permission checks)
CREATE INDEX IF NOT EXISTS idx_project_photo_uploaded_by
ON "ProjectPhoto"("uploadedById");
