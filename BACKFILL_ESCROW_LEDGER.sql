-- Backfill EscrowLedger with historical confirmed deposits and releases
-- Run this once to populate the ledger from existing FinancialTransaction records

BEGIN;

-- Insert credit entries for confirmed escrow deposits
INSERT INTO "EscrowLedger" (
  id,
  "projectId",
  "projectProfessionalId",
  "transactionId",
  direction,
  amount,
  currency,
  description,
  "createdAt",
  "createdBy",
  meta
)
SELECT
  gen_random_uuid(),
  ft."projectId",
  ft."projectProfessionalId",
  ft.id,
  'credit',
  ft.amount,
  'HKD',
  'Backfill: ' || ft.description,
  ft."updatedAt",  -- use updatedAt as proxy for when it was confirmed
  ft."actionBy",
  jsonb_build_object('backfilled', true, 'originalType', ft.type)
FROM "FinancialTransaction" ft
WHERE ft.type IN ('escrow_deposit', 'escrow_deposit_confirmation')
  AND LOWER(ft.status) = 'confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM "EscrowLedger" el
    WHERE el."transactionId" = ft.id
  );

-- Insert debit entries for confirmed payment releases
INSERT INTO "EscrowLedger" (
  id,
  "projectId",
  "projectProfessionalId",
  "transactionId",
  direction,
  amount,
  currency,
  description,
  "createdAt",
  "createdBy",
  meta
)
SELECT
  gen_random_uuid(),
  ft."projectId",
  ft."projectProfessionalId",
  ft.id,
  'debit',
  ft.amount,
  'HKD',
  'Backfill: ' || ft.description,
  ft."updatedAt",
  ft."actionBy",
  jsonb_build_object('backfilled', true, 'originalType', ft.type)
FROM "FinancialTransaction" ft
WHERE ft.type IN ('release_payment', 'advance_payment_request')
  AND LOWER(ft.status) = 'confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM "EscrowLedger" el
    WHERE el."transactionId" = ft.id
  );

-- Recalculate and set escrowHeld for each project based on ledger
WITH ledger_balance AS (
  SELECT
    el."projectId",
    SUM(CASE WHEN el.direction = 'credit' THEN el.amount ELSE -el.amount END) AS balance
  FROM "EscrowLedger" el
  GROUP BY el."projectId"
)
UPDATE "Project" p
SET "escrowHeld" = COALESCE(lb.balance, 0),
    "escrowHeldUpdatedAt" = now()
FROM ledger_balance lb
WHERE p.id = lb."projectId";

COMMIT;

-- Verification query (run separately to check results):
-- SELECT
--   p.id AS project_id,
--   p."projectName",
--   p."escrowHeld",
--   p."escrowRequired",
--   COUNT(el.id) AS ledger_entries
-- FROM "Project" p
-- LEFT JOIN "EscrowLedger" el ON el."projectId" = p.id
-- WHERE p."escrowRequired" IS NOT NULL
-- GROUP BY p.id, p."projectName", p."escrowHeld", p."escrowRequired"
-- ORDER BY p."createdAt" DESC;
