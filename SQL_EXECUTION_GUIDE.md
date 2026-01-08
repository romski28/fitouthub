# Financial Transaction Consolidation - SQL Execution Guide

## Overview
This SQL adds 5 new columns to `FinancialTransaction` table to support unified financial data tracking with professional linking and action lifecycle management.

## New Columns Added

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `professionalId` | TEXT | Yes | null | Direct FK to Professional for filtering |
| `actionBy` | TEXT | Yes | null | User ID who took action (approve/reject/complete) |
| `actionByRole` | VARCHAR(50) | Yes | null | Role of person taking action (client/admin/professional) |
| `actionComplete` | BOOLEAN | No | false | Flag: has action been completed? |
| `actionAt` | TIMESTAMP(3) | Yes | null | When action was taken |

## Execution Steps

### 1. Backup Database
In Supabase:
- Go to **Project Settings** → **Backups**
- Create a manual backup before proceeding

### 2. Execute SQL
In Supabase SQL Editor:
- Open file: `apps/api/sql/consolidate-financial-transactions.sql`
- Copy all SQL (excluding comments starting with --)
- Paste into Supabase SQL Editor
- Click **Run**

**Alternative:** Run step-by-step (safer):
1. Run Step 1 (ALTER TABLE - add columns)
2. Run Step 2 (Add foreign key constraint)
3. Run Step 3 (Populate professionalId from projectProfessional)
4. Run Step 4 (Mark completed transactions)
5. Run Step 5 (Mark info transactions)
6. Run Step 6 (Create indexes)

### 3. Verify
Uncomment and run the verification queries in Step 7 to confirm:
- Columns exist and have correct types
- Data populated correctly
- Indexes created

### 4. Confirm Application Updates
After SQL is executed, the application code needs updates (Phase 2):
- Transaction creation endpoints must populate `professionalId`
- Approval endpoints must set `actionBy`, `actionByRole`, `actionAt`, `actionComplete`
- Frontend must use `actionComplete` for filtering pending items

## Rollback (If Needed)

If something goes wrong, restore from backup:
1. Go to **Project Settings** → **Backups**
2. Find the backup created before migration
3. Click **Restore** (this will require application downtime)

Or manually rollback:
```sql
-- Remove new columns
ALTER TABLE "FinancialTransaction"
DROP COLUMN IF EXISTS "professionalId",
DROP COLUMN IF EXISTS "actionBy",
DROP COLUMN IF EXISTS "actionByRole",
DROP COLUMN IF EXISTS "actionComplete",
DROP COLUMN IF EXISTS "actionAt";

-- Remove indexes
DROP INDEX IF EXISTS "FinancialTransaction_professionalId_idx";
DROP INDEX IF EXISTS "FinancialTransaction_actionComplete_idx";
```

## Important Notes

- **Backward Compatibility**: `approvedBy` and `approvedAt` columns are kept for now
- **Data Migration**: Existing completed transactions are automatically marked `actionComplete = true`
- **Index Creation**: Indexes optimize filtering for the new fields (needed for pending action queries)
- **No Data Loss**: Migration only adds columns; no existing data is deleted

## Testing Checklist

After SQL execution and application updates:

- [ ] Create advance payment request → FinancialTransaction has `professionalId` populated
- [ ] Approve advance payment → `actionBy`, `actionByRole`, `actionAt` set; `actionComplete = true`
- [ ] Reject advance payment → `actionComplete = true`, `status = 'rejected'`
- [ ] Query pending actions: `WHERE actionComplete = false AND status = 'pending'` returns correct items
- [ ] Filter by professional: `WHERE professionalId = <id>` returns only that professional's transactions
- [ ] Financials view still displays correctly

## Questions?

Refer to the full plan: `FINANCIAL_CONSOLIDATION_PLAN.md`
