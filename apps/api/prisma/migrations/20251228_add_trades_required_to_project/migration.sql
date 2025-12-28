-- Add tradesRequired array field to Project table
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "tradesRequired" TEXT[] NOT NULL DEFAULT '{}';

-- Optional: Migrate existing projectName data to tradesRequired for projects with single-word trade names
-- Uncomment below if you want to auto-migrate existing data:
-- UPDATE "Project"
-- SET "tradesRequired" = ARRAY["projectName"]
-- WHERE "projectName" IN ('Plumber', 'Electrician', 'Carpenter', 'Painter', 'Tiler', 'Mason', 'Builder', 'Architect', 'HVAC Technician', 'Glazier', 'Renovator', 'Project Manager', 'Plasterer', 'Flooring Specialist', 'Roofer', 'Landscaper', 'Fencer', 'Window & Door Installer', 'Smart Home Installer', 'Bricklayer', 'Steelworker', 'Insulation Installer', 'Interior Designer', 'Landscape Designer', 'Surveyor');
