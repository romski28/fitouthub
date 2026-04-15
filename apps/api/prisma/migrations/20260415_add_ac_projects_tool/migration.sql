-- Create AC calculator saved-project tables
CREATE TABLE "AcProject" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "professionalId" TEXT,
  "linkedProjectId" TEXT,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "calculationMethod" TEXT NOT NULL DEFAULT 'area',
  "combineRooms" BOOLEAN NOT NULL DEFAULT false,
  "totalBtu" INTEGER,
  "recommendedSystem" TEXT,
  "compressorSuggestion" TEXT,
  "shoppingList" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AcProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcRoom" (
  "id" TEXT NOT NULL,
  "acProjectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lengthMeters" DECIMAL(8,2) NOT NULL,
  "widthMeters" DECIMAL(8,2) NOT NULL,
  "heightMeters" DECIMAL(8,2) NOT NULL,
  "heatProfile" TEXT NOT NULL DEFAULT 'warm',
  "occupants" INTEGER NOT NULL DEFAULT 1,
  "floor" INTEGER,
  "westFacing" BOOLEAN NOT NULL DEFAULT false,
  "largeWindows" BOOLEAN NOT NULL DEFAULT false,
  "calculatedArea" DECIMAL(10,2),
  "calculatedVolume" DECIMAL(10,2),
  "calculatedBtu" INTEGER,
  "suggestedUnitSize" INTEGER,
  "recommendedAcType" TEXT,
  "notes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AcRoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcProject_userId_idx" ON "AcProject"("userId");
CREATE INDEX "AcProject_professionalId_idx" ON "AcProject"("professionalId");
CREATE INDEX "AcProject_linkedProjectId_idx" ON "AcProject"("linkedProjectId");
CREATE INDEX "AcProject_updatedAt_idx" ON "AcProject"("updatedAt");
CREATE INDEX "AcRoom_acProjectId_idx" ON "AcRoom"("acProjectId");

ALTER TABLE "AcProject"
  ADD CONSTRAINT "AcProject_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcProject"
  ADD CONSTRAINT "AcProject_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcProject"
  ADD CONSTRAINT "AcProject_linkedProjectId_fkey"
  FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AcRoom"
  ADD CONSTRAINT "AcRoom_acProjectId_fkey"
  FOREIGN KEY ("acProjectId") REFERENCES "AcProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
