-- Step 1 of 2: Add matrix_rating to the QuestionnaireQuestionType enum.
--
-- Run this file FIRST as a standalone execution (not wrapped in a transaction).
-- After it completes and commits, run 2026-03-31-contractor-tradesman-research-starter.sql.
--
-- Postgres rule: ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction as any DML that references the new enum value.
-- Splitting into two separate script runs is the only reliable workaround.

ALTER TYPE "QuestionnaireQuestionType" ADD VALUE IF NOT EXISTS 'matrix_rating';
