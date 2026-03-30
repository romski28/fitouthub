-- Questionnaire system schema
-- Apply manually in production. Keep starter data/loading separate from this schema file.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionnaireStatus') THEN
    CREATE TYPE "QuestionnaireStatus" AS ENUM ('draft', 'active', 'archived');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionnaireQuestionType') THEN
    CREATE TYPE "QuestionnaireQuestionType" AS ENUM (
      'short_text',
      'long_text',
      'single_select',
      'multi_select',
      'yes_no',
      'number',
      'email',
      'phone',
      'date'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionnaireInviteStatus') THEN
    CREATE TYPE "QuestionnaireInviteStatus" AS ENUM ('pending', 'opened', 'submitted', 'expired', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionnaireSubmissionStatus') THEN
    CREATE TYPE "QuestionnaireSubmissionStatus" AS ENUM ('in_progress', 'completed', 'abandoned');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Questionnaire" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "audienceKey" TEXT NOT NULL,
  "description" TEXT,
  "welcomeTitle" TEXT,
  "welcomeMessage" TEXT,
  "thankYouTitle" TEXT,
  "thankYouMessage" TEXT,
  "joinCtaLabel" TEXT,
  "joinCtaUrl" TEXT,
  "status" "QuestionnaireStatus" NOT NULL DEFAULT 'draft',
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "QuestionnaireQuestion" (
  "id" TEXT PRIMARY KEY,
  "questionnaireId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" "QuestionnaireQuestionType" NOT NULL,
  "placeholder" TEXT,
  "helpText" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL,
  "settings" JSONB,
  CONSTRAINT "QuestionnaireQuestion_questionnaireId_fkey"
    FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireQuestion_questionnaireId_code_key"
    UNIQUE ("questionnaireId", "code")
);

CREATE TABLE IF NOT EXISTS "QuestionnaireQuestionOption" (
  "id" TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "QuestionnaireQuestionOption_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireQuestionOption_questionId_value_key"
    UNIQUE ("questionId", "value")
);

CREATE TABLE IF NOT EXISTS "QuestionnaireTemplate" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "type" "QuestionnaireQuestionType" NOT NULL,
  "description" TEXT,
  "placeholder" TEXT,
  "helpText" TEXT,
  "audienceKey" TEXT,
  "settings" JSONB,
  "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "QuestionnaireTemplateOption" (
  "id" TEXT PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "QuestionnaireTemplateOption_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "QuestionnaireTemplate"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireTemplateOption_templateId_value_key"
    UNIQUE ("templateId", "value")
);

CREATE TABLE IF NOT EXISTS "QuestionnaireInvite" (
  "id" TEXT PRIMARY KEY,
  "questionnaireId" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "email" TEXT NOT NULL,
  "recipientName" TEXT,
  "roleLabel" TEXT,
  "companyName" TEXT,
  "projectId" TEXT,
  "professionalId" TEXT,
  "invitedBy" TEXT,
  "expiresAt" TIMESTAMP(3),
  "firstOpenedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "status" "QuestionnaireInviteStatus" NOT NULL DEFAULT 'pending',
  "customMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionnaireInvite_questionnaireId_fkey"
    FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "QuestionnaireSubmission" (
  "id" TEXT PRIMARY KEY,
  "questionnaireId" TEXT NOT NULL,
  "inviteId" TEXT UNIQUE,
  "respondentEmail" TEXT,
  "respondentName" TEXT,
  "status" "QuestionnaireSubmissionStatus" NOT NULL DEFAULT 'in_progress',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "QuestionnaireSubmission_questionnaireId_fkey"
    FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireSubmission_inviteId_fkey"
    FOREIGN KEY ("inviteId") REFERENCES "QuestionnaireInvite"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "QuestionnaireAnswer" (
  "id" TEXT PRIMARY KEY,
  "submissionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "value" JSONB,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionnaireAnswer_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "QuestionnaireSubmission"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireAnswer_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireAnswer_submissionId_questionId_key"
    UNIQUE ("submissionId", "questionId")
);

CREATE INDEX IF NOT EXISTS "Questionnaire_audienceKey_idx" ON "Questionnaire"("audienceKey");
CREATE INDEX IF NOT EXISTS "Questionnaire_status_idx" ON "Questionnaire"("status");
CREATE INDEX IF NOT EXISTS "QuestionnaireQuestion_questionnaireId_sortOrder_idx" ON "QuestionnaireQuestion"("questionnaireId", "sortOrder");
CREATE INDEX IF NOT EXISTS "QuestionnaireQuestionOption_questionId_sortOrder_idx" ON "QuestionnaireQuestionOption"("questionId", "sortOrder");
CREATE INDEX IF NOT EXISTS "QuestionnaireTemplate_audienceKey_idx" ON "QuestionnaireTemplate"("audienceKey");
CREATE INDEX IF NOT EXISTS "QuestionnaireTemplateOption_templateId_sortOrder_idx" ON "QuestionnaireTemplateOption"("templateId", "sortOrder");
CREATE INDEX IF NOT EXISTS "QuestionnaireInvite_token_idx" ON "QuestionnaireInvite"("token");
CREATE INDEX IF NOT EXISTS "QuestionnaireInvite_questionnaireId_idx" ON "QuestionnaireInvite"("questionnaireId");
CREATE INDEX IF NOT EXISTS "QuestionnaireInvite_status_idx" ON "QuestionnaireInvite"("status");
CREATE INDEX IF NOT EXISTS "QuestionnaireInvite_email_idx" ON "QuestionnaireInvite"("email");
CREATE INDEX IF NOT EXISTS "QuestionnaireSubmission_questionnaireId_idx" ON "QuestionnaireSubmission"("questionnaireId");
CREATE INDEX IF NOT EXISTS "QuestionnaireSubmission_status_idx" ON "QuestionnaireSubmission"("status");
CREATE INDEX IF NOT EXISTS "QuestionnaireAnswer_questionId_idx" ON "QuestionnaireAnswer"("questionId");
