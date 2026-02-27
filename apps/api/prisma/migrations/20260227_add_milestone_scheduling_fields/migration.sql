-- AlterTable
ALTER TABLE "ProjectMilestone" 
ADD COLUMN "startTimeSlot" TEXT,
ADD COLUMN "endTimeSlot" TEXT,
ADD COLUMN "estimatedHours" INTEGER,
ADD COLUMN "siteAccessRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "siteAccessNotes" TEXT;

-- CreateIndex
CREATE INDEX "ProjectMilestone_plannedStartDate_idx" ON "ProjectMilestone"("plannedStartDate");
