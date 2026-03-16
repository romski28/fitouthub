-- Add AI intake persistence for DeepSeek requirement extraction

CREATE TABLE IF NOT EXISTS "ai_intakes" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT,
  "sessionId" TEXT,
  "rawPrompt" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "model" TEXT,
  "durationMs" INTEGER,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "title" TEXT,
  "intent" TEXT,
  "trades" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "locationPrimary" TEXT,
  "locationSecondary" TEXT,
  "locationTertiary" TEXT,
  "summary" TEXT,
  "scope" TEXT,
  "risks" JSONB,
  "assumptions" JSONB,
  "nextQuestions" JSONB,
  "project" JSONB,
  "budget" JSONB,
  "timeline" JSONB,
  "overallConfidence" DOUBLE PRECISION,
  "rawOutput" JSONB,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "projectId" TEXT,

  CONSTRAINT "ai_intakes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_intakes_requestId_key" ON "ai_intakes"("requestId");
CREATE INDEX IF NOT EXISTS "ai_intakes_userId_idx" ON "ai_intakes"("userId");
CREATE INDEX IF NOT EXISTS "ai_intakes_sessionId_idx" ON "ai_intakes"("sessionId");
CREATE INDEX IF NOT EXISTS "ai_intakes_status_idx" ON "ai_intakes"("status");
CREATE INDEX IF NOT EXISTS "ai_intakes_createdAt_idx" ON "ai_intakes"("createdAt");

ALTER TABLE "ai_intakes"
ADD CONSTRAINT "ai_intakes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
