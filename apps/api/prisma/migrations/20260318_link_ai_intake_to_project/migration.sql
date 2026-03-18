-- Link AI intakes to converted projects

-- Add aiIntakeId column to Project table
ALTER TABLE "Project" ADD COLUMN "aiIntakeId" TEXT;

-- Add index on aiIntakeId for query performance
CREATE INDEX "Project_aiIntakeId_idx" ON "Project"("aiIntakeId");

-- Add unique constraint on projectId in ai_intakes (one-to-one relationship)
ALTER TABLE "ai_intakes" ADD CONSTRAINT "ai_intakes_projectId_key" UNIQUE ("projectId");

-- Add foreign key from Project to AiIntake
ALTER TABLE "Project"
ADD CONSTRAINT "Project_aiIntakeId_fkey"
FOREIGN KEY ("aiIntakeId") REFERENCES "ai_intakes"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
