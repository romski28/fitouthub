# Physical vs Fiscal Completion — Two-Axis Plan

## Goal

Separate "is the work done" (physical) from "is the money settled" (fiscal) so
the project lifecycle is unambiguous and each axis advances independently.
Today these are conflated — fiscal events (payment release) mutate the physical
`Project.currentStage`, which is why "complete" means different things on
different code paths.

## Model

Two axes:

1. **Physical** — `Project.currentStage` (existing `ProjectStage` enum). Tracks
   work progress only.
2. **Fiscal** — new denormalised `Project.fiscalStatus`. Tracks money only.

`CLOSED` = physical complete **and** fiscally settled. Reviews/photos are a
parallel, non-blocking obligation (tracked in `ProjectReview` / `ProjectCloseout`,
with reminders and a "flag if not rated" signal).

## Data model changes

Add to `Project` (idempotent SQL):

```sql
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "fiscalStatus" TEXT NOT NULL DEFAULT 'pending';
```

`fiscalStatus` values: `pending | funded | payment_released | retention_held | settled`.

No other schema changes — review requirement semantics already match (rating
required, comments optional, photos optional).

## Fiscal axis (`fiscalStatus`)

Denormalised; updated atomically alongside the corresponding ledger write.

| From | To | Trigger |
|---|---|---|
| `pending` | `funded` | `confirmEscrowDeposit` |
| `funded` | `payment_released` | `releaseClass1Payment` (no retention — full release) |
| `funded` | `retention_held` | `releaseClass1Payment` (retention — 90% released / 10% held) |
| `payment_released` | `settled` | platform-fee settled (non-retention) |
| `retention_held` | `settled` | `releaseRetention` (10% released + fee settled) |

`settled` = **fiscally complete** — all money moved. Reviews are **not** required
to reach `settled`.

## Physical axis (`currentStage`)

| Transition | Trigger | Notes |
|---|---|---|
| → `MILESTONE_PENDING` | pro requests sign-off (`createReport`) | unchanged |
| `MILESTONE_PENDING` → `COMPLETE` | client approves final milestone (`approveSignOff`) | single-milestone (Class 1) — **was `WORK_IN_PROGRESS`** |
| `MILESTONE_PENDING` → `WORK_IN_PROGRESS` | client approves milestone (`approveSignOff`) | multi-milestone only (return to active work) |
| `COMPLETE` → `CLOSED` | fiscal settled (non-retention: payment + fee) | `releaseClass1Payment` |
| `COMPLETE` → `warranty_period` | payment released with retention held | `releaseClass1Payment` (retention only) |
| `warranty_period` → `CLOSED` | retention released + fee settled | `releaseRetention` |

`warranty_period` exists **only** when retention is on (unchanged).

## Endpoint changes

1. **`approveSignOff`** (progress-reports.service) — detect single vs multi
   milestone; single → `COMPLETE`, multi → `WORK_IN_PROGRESS` (instead of the
   current unconditional `WORK_IN_PROGRESS`).

2. **`releaseClass1Payment`** (financial.service) — set `fiscalStatus`:
   - non-retention → settle platform fee + `fiscalStatus = settled` + `currentStage = CLOSED`.
   - retention → `fiscalStatus = retention_held` + `currentStage = warranty_period`.

3. **`releaseRetention`** (financial.service) — settle platform fee +
   `fiscalStatus = settled` + `currentStage = CLOSED`.

4. **`settlePlatformFee`** — unchanged internally, but now invoked from the
   fiscal path (2 and 3), not from `finalizeCloseout`.

5. **`finalizeCloseout`** (reviews, financial.service) — decouple from fiscal:
   recompute `Professional.rating` / `completedProjectsCount` and mark
   `ProjectCloseout.status = 'closed'` (reviews complete) only. Do **not** settle
   the fee or transition `currentStage` to `CLOSED` (that's the fiscal path now).

6. **`submitCloseoutReview`** — no change to requirement logic (rating required,
   comment/photos optional). Adjust UI copy so photos are presented as
   "recommended", not required.

## Review requirements (side note)

- **Rating** — required (both client and pro).
- **Comments** — desired (optional).
- **Photos** — recommended, not required ("recommended for closeout").

Reviews do **not** block fiscal settlement or `CLOSED`. Retain the existing
"flag if not rated" signal for retention projects (in `releaseRetention`).

## Migration & backfill

1. Run the `fiscalStatus` column SQL above.
2. Backfill `fiscalStatus` from the existing `FinancialTransaction` /
   `EscrowLedger` history (derive current fiscal state for in-flight projects).

## Feature flag / rollback

- Gated by the existing `ENABLE_RETENTION_AND_CLOSEOUT` (default on).
- `fiscalStatus` is additive; existing reads are unaffected until each endpoint
  is updated. Revert by dropping the column.

## Phased implementation order (each phase independently buildable)

1. Schema + `fiscalStatus` + backfill.
2. `approveSignOff` → `COMPLETE` for single-milestone.
3. `releaseClass1Payment` → `fiscalStatus` + `CLOSED` / `warranty_period`.
4. `releaseRetention` → `settled` + `CLOSED`.
5. Decouple `finalizeCloseout` (reviews) from fiscal settlement.
6. UI copy — photos "recommended"; rating "required".
