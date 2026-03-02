-- Remove redundant Client table and FK constraint
-- Client table is empty and clients are already stored in User table with role='client'

-- Drop the foreign key constraint from Project to Client
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_clientId_fkey";

-- Drop the Client table (no data loss - table is empty)
DROP TABLE IF EXISTS "Client" CASCADE;

-- Note: Project.clientId column is kept for potential future use
-- If you want to repurpose it to reference User table instead, run:
-- ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" 
--   FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
