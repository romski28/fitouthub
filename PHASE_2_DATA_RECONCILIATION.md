# Phase 2 — Professional Data Model Reconciliation

## Goal
Eliminate duplicated/denormalized fields on the `Professional` model. Every field should have one canonical source of truth.

## Current State (post-Phase 1)

| Field | Still exists? | Populated? | Read by |
|---|---|---|---|
| `locationPrimary` | Yes | Yes (comma-joined zones) | AI service (8+ readers), professionals-list, search-flow, admin matrix |
| `locationSecondary` | Yes | Single area name only | search-flow, admin matrix |
| `locationTertiary` | Yes | Always null | Nothing |
| `serviceArea` | Yes | Comma-joined area names | Display only (professionals-list, admin card) |
| `servicePrimaries` | Yes | ✅ Now populated (zone labels array) | Admin matrix |
| `serviceSecondaries` | Yes | Always [] | Nothing |
| `regionCoverage` (relation) | Yes | ✅ Canonical source | Nothing directly — only used to derive legacy fields |
| `primaryTrade` | Yes | Single string | professionals-list matching, project matching |
| `tradesOffered` | Yes | String array | professionals-list matching, admin matrix |
| `suppliesOffered` | Yes | String array | Reseller display only |

## Step-by-step Migration

### Step 1: Switch AI service readers to `regionCoverage`

**Risk**: HIGH (core matching pipeline)  
**Files**: `apps/api/src/ai/ai.service.ts` — 8+ read sites

Each `locationPrimary`/`locationSecondary` read in the AI service must be replaced with a JOIN or subquery against `ProfessionalRegionCoverage`. This should be done one read-site at a time, deploying and verifying each independently.

After all AI readers are migrated, `locationPrimary` and `locationSecondary` are dead.

### Step 2: Switch frontend readers to `regionCoverage`

**Risk**: MEDIUM  
**Files**: `apps/web/src/components/professionals-list.tsx`, `search-flow.tsx`, `hk-districts.ts`

Replace `locationPrimary`/`locationSecondary`/`serviceArea` reads with the `regionCoverage` relation (already included in the API response). Use zone/area labels from the relation instead of the denormalized strings.

### Step 3: Drop dead fields

**Risk**: LOW (nothing reads them)  
**Manual SQL**:

```sql
ALTER TABLE "Professional" DROP COLUMN "locationTertiary";
ALTER TABLE "Professional" DROP COLUMN "serviceSecondaries";
```

### Step 4: Merge `primaryTrade` into `tradesOffered`

**Risk**: MEDIUM (contractor matching depends on single trade)

1. Add a DB constraint: if `professionType = 'contractor'`, `tradesOffered[0]` = their primary specialization
2. Backfill: copy all `primaryTrade` values into `tradesOffered` array where missing
3. Update all readers to treat `tradesOffered` as the single source — remove all `primaryTrade` references
4. Drop `primaryTrade` column

```sql
-- Backfill example
UPDATE "Professional"
SET "tradesOffered" = ARRAY["primaryTrade"]
WHERE "primaryTrade" IS NOT NULL
  AND ("tradesOffered" IS NULL OR array_length("tradesOffered", 1) IS NULL OR array_length("tradesOffered", 1) = 0);
```

### Step 5: Drop remaining legacy location fields

**Risk**: LOW (nothing reads them anymore after Steps 1-2)  
**Manual SQL**:

```sql
ALTER TABLE "Professional" DROP COLUMN "locationPrimary";
ALTER TABLE "Professional" DROP COLUMN "locationSecondary";
ALTER TABLE "Professional" DROP COLUMN "serviceArea";
```

### Step 6: Promote `regionCoverage` as canonical source

**Risk**: NONE (already is, just not enforced)

Add a `@unique` constraint or validation to prevent duplicate coverage entries. Ensure the relation is always loaded via Prisma `include` on all professional queries.

## Target End State

```prisma
model Professional {
  // … core fields (id, email, phone, rating, etc.) …
  
  // Single source: trades
  tradesOffered    String[]   @default([])
  suppliesOffered  String[]   @default([])
  
  // Single source: location coverage
  regionCoverage   ProfessionalRegionCoverage[]
  
  // DELETED: primaryTrade, locationPrimary, locationSecondary,
  //          locationTertiary, serviceArea, servicePrimaries, serviceSecondaries
}
```

## Rollback Safety

Each step is independently deployable. If any migration breaks, revert that single step. The legacy fields remain populated throughout (until explicitly dropped in Step 3/5), so readers can fall back at any point.

---

## Step 7: Contractor Primary Location (NEW)

### Problem
Contractors currently select "service delivery regions" (where they work) but we don't collect their **primary location** (where they're based). This matters for:
- Sorting by proximity to the project site
- "Nearby professionals" features
- Response time estimates (a pro in Kowloon can reach Kowloon faster than NT)

### Proposal
Add a single `primaryLocation` field (String?, nullable) to `Professional`. This is separate from service coverage — a contractor might be based in Kowloon but serve all 5 regions.

| Field | What it means | User selects |
|---|---|---|
| `primaryLocation` (NEW) | Where the professional is based | One zone/area from profile |
| `regionCoverage` (existing) | Where they deliver services | Multiple zones/areas from profile |
| `servicePrimaries` (legacy) | Auto-derived from `regionCoverage` | Not user-facing |

### Implementation
1. Add `primaryLocation` to Prisma schema (nullable String)
2. Add a single-select dropdown in the professional profile form
3. Populate from existing `locationSecondary` when it's a single area (best guess for existing pros)
4. Use for proximity sorting in professionals-list

---

## Lessons from Phase 1 (June 2026)

### What broke and why
1. **Trade matrix showed "Islands District" and "New Territories"**: `locationPrimary` was written as a comma-joined display string with legacy transformations. Fix: matrix now uses only `servicePrimaries`.
2. **Admin email appeared as a trade**: `tradesOffered` or `primaryTrade` contained non-trade data for some professional records. Fix: matrix now validates trades against `Tradesman` table.
3. **"HVAC" and "Glazier" suggested for AC queries**: Frontend `service-matcher.ts` mapped keywords to non-canonical trade names. Fix: mapped to canonical trade names, suppressed when AI already returns trades.
4. **servicePrimaries was never populated**: `buildLegacyLocationMirrorFromAreas()` didn't write to it. Fix: now writes `servicePrimaries` on every profile save. Existing pros need the backfill SQL.

### Rules going forward
- **Never read `locationPrimary`/`locationSecondary`/`serviceArea` in new code** — use `servicePrimaries` or the `regionCoverage` relation
- **Never add trades to `allTradeNames` from professional data** — only from the `Tradesman` table
- **Any new professional field needs a canonical source** — denormalization must be auto-derived, never manually editable
