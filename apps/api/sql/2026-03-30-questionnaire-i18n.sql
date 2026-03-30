-- Questionnaire multilingual extension
-- Run this manually AFTER prisma/add-questionnaire-system.sql
-- Safe to re-run due to IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS "QuestionnaireTranslation" (
  "id" TEXT PRIMARY KEY,
  "questionnaireId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "welcomeTitle" TEXT,
  "welcomeMessage" TEXT,
  "thankYouTitle" TEXT,
  "thankYouMessage" TEXT,
  "joinCtaLabel" TEXT,
  "joinCtaUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionnaireTranslation_questionnaireId_fkey"
    FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireTranslation_questionnaireId_locale_key"
    UNIQUE ("questionnaireId", "locale")
);

CREATE TABLE IF NOT EXISTS "QuestionnaireQuestionTranslation" (
  "id" TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "placeholder" TEXT,
  "helpText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionnaireQuestionTranslation_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireQuestionTranslation_questionId_locale_key"
    UNIQUE ("questionId", "locale")
);

CREATE TABLE IF NOT EXISTS "QuestionnaireQuestionOptionTranslation" (
  "id" TEXT PRIMARY KEY,
  "optionId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionnaireQuestionOptionTranslation_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "QuestionnaireQuestionOption"("id") ON DELETE CASCADE,
  CONSTRAINT "QuestionnaireQuestionOptionTranslation_optionId_locale_key"
    UNIQUE ("optionId", "locale")
);

CREATE INDEX IF NOT EXISTS "QuestionnaireTranslation_locale_idx" ON "QuestionnaireTranslation"("locale");
CREATE INDEX IF NOT EXISTS "QuestionnaireTranslation_questionnaireId_idx" ON "QuestionnaireTranslation"("questionnaireId");
CREATE INDEX IF NOT EXISTS "QuestionnaireQuestionTranslation_locale_idx" ON "QuestionnaireQuestionTranslation"("locale");
CREATE INDEX IF NOT EXISTS "QuestionnaireQuestionTranslation_questionId_idx" ON "QuestionnaireQuestionTranslation"("questionId");
CREATE INDEX IF NOT EXISTS "QuestionnaireQuestionOptionTranslation_locale_idx" ON "QuestionnaireQuestionOptionTranslation"("locale");
CREATE INDEX IF NOT EXISTS "QuestionnaireQuestionOptionTranslation_optionId_idx" ON "QuestionnaireQuestionOptionTranslation"("optionId");
