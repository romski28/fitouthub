-- AddMessages table for professional-client chat

-- Create table if not exists
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT PRIMARY KEY,
  "projectProfessionalId" TEXT NOT NULL,
  "senderType" TEXT NOT NULL,
  "senderProfessionalId" TEXT,
  "senderClientId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "readByProfessionalAt" TIMESTAMP WITH TIME ZONE,
  "readByClientAt" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "Message_projectProfessionalId_fkey" FOREIGN KEY ("projectProfessionalId") REFERENCES "ProjectProfessional"("id") ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Message_projectProfessionalId_idx" ON "Message"("projectProfessionalId");
CREATE INDEX IF NOT EXISTS "Message_senderType_idx" ON "Message"("senderType");
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");
