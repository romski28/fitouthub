-- AlterTable: Project - Add userPrompt field to capture initial search/creation prompt for AI training
ALTER TABLE "Project" ADD COLUMN "userPrompt" TEXT;

-- Comment on column for documentation
COMMENT ON COLUMN "Project"."userPrompt" IS 'Original natural language prompt from user search/creation for AI training purposes';
