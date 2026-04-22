/**
 * Platform Fee Implementation - Manual SQL Execution Guide
 * 
 * This document outlines the steps to safely apply schema changes and seed data
 * for Phase A platform fee functionality.
 * 
 * IMPORTANT: Always test on a staging database first.
 */

# EXECUTION STEPS

## Step 1: Run Schema Migration SQL
Location: apps/api/prisma/ADD_PLATFORM_FEE_SCHEMA.sql

```bash
# Using psql directly (replace with your connection details)
psql -h <host> -U <user> -d <dbname> -f apps/api/prisma/ADD_PLATFORM_FEE_SCHEMA.sql
```

Or execute the SQL file contents via your database admin tool (e.g., pgAdmin, DBeaver).

The SQL script performs:
- ALTER TABLE ProjectProfessional: adds 7 new columns
- CREATE TABLE PlatformFeeQuoteBand: tier-based fee bands
- CREATE TABLE PlatformFeePerformanceAdjustment: pro adjustment rules
- CREATE TABLE PlatformFeeLoyaltyAdjustment: client adjustment rules
- INSERT seed data: initial flat 12% tiered policy
- Backfill: legacy quotes marked with 'legacy-no-fee'
- CREATE INDEXes for query performance


## Step 2: Update Prisma Client
```bash
cd apps/api
pnpm prisma generate
# Regenerates @prisma/client to include new models
```


## Step 3: Start API Server + Run Tests
```bash
cd apps/api
pnpm start:dev
# Validate schema introspection and no runtime errors
# Run test-connection.js to confirm database accessibility
```


## Step 4: Backend Code Deployment
Already implemented:
- apps/api/src/common/platform-fee.service.ts: Fee calculation logic
- apps/api/src/professional/professional.controller.ts: submitQuote updated
- apps/api/src/projects/projects.service.ts: updateQuote updated

Changes automatically wire service injection via NestJS DI.


## Step 5: Frontend - Show Base Amount to Professional (Optional)
In future: can display "Your quote (base): $X before FoH fee"
For now: professionals submit base, API calculates gross silently.


## Rollback Plan (if needed)

Drop the new columns and tables:

```sql
-- Drop foreign key constraints if any (unlikely)
ALTER TABLE "ProjectProfessional" 
DROP COLUMN "quoteBaseAmount",
DROP COLUMN "quotePlatformFeeAmount",
DROP COLUMN "quotePlatformFeePercent",
DROP COLUMN "quotePricingVersion",
DROP COLUMN "quotePlatformFeeBreakdown",
DROP COLUMN "feeCalculatedAt";

DROP TABLE IF EXISTS "PlatformFeeLoyaltyAdjustment";
DROP TABLE IF EXISTS "PlatformFeePerformanceAdjustment";
DROP TABLE IF EXISTS "PlatformFeeQuoteBand";

-- Revert schema.prisma to previous version (git checkout)
```


## Monitoring & Validation

After deployment, monitor:
1. Quote submission success rate (should remain 100%)
2. Fee calculation accuracy (spot check 5-10 quotes, verify math)
3. API response time (fee lookups should be <50ms per quote)
4. Database query performance (watch slow query log for fee table scans)


## T&C Update (Separate PR)
See PLATFORM_FEE_T&C_AMENDMENTS.md for sample clauses to add to T&Cs.

---

Questions? Contact backend lead.
