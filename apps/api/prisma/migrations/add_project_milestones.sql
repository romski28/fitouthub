-- Add services_used column to Project table
ALTER TABLE "Project" ADD COLUMN "servicesUsed" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Create MilestoneTemplate table
CREATE TABLE "MilestoneTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tradeId" TEXT NOT NULL,
  "stageName" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "description" TEXT,
  "estimatedDurationDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MilestoneTemplate_tradeId_fkey" FOREIGN KEY ("tradeId") 
    REFERENCES "Tradesman" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MilestoneTemplate_tradeId_sequence_key" UNIQUE ("tradeId", "sequence")
);

-- Create indexes for MilestoneTemplate
CREATE INDEX "MilestoneTemplate_tradeId_idx" ON "MilestoneTemplate"("tradeId");

-- Create ProjectMilestone table
CREATE TABLE "ProjectMilestone" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "projectProfessionalId" TEXT,
  "templateId" TEXT,
  "title" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_started',
  "percentComplete" INTEGER NOT NULL DEFAULT 0,
  "plannedStartDate" TIMESTAMP(3),
  "plannedEndDate" TIMESTAMP(3),
  "actualEndDate" TIMESTAMP(3),
  "description" TEXT,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") 
    REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectMilestone_projectProfessionalId_fkey" FOREIGN KEY ("projectProfessionalId") 
    REFERENCES "ProjectProfessional" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProjectMilestone_templateId_fkey" FOREIGN KEY ("templateId") 
    REFERENCES "MilestoneTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProjectMilestone_projectId_sequence_key" UNIQUE ("projectId", "sequence")
);

-- Create indexes for ProjectMilestone
CREATE INDEX "ProjectMilestone_projectId_idx" ON "ProjectMilestone"("projectId");
CREATE INDEX "ProjectMilestone_projectProfessionalId_idx" ON "ProjectMilestone"("projectProfessionalId");
CREATE INDEX "ProjectMilestone_templateId_idx" ON "ProjectMilestone"("templateId");
CREATE INDEX "ProjectMilestone_status_idx" ON "ProjectMilestone"("status");
