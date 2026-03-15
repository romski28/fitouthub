-- Improves /financial/project/:projectId/summary query performance
-- Run manually in production before deploying dependent code.

CREATE INDEX IF NOT EXISTS "FinancialTransaction_projectId_createdAt_idx"
ON "FinancialTransaction"("projectId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "FinancialTransaction_projectId_type_status_idx"
ON "FinancialTransaction"("projectId", "type", "status");