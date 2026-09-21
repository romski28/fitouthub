# TODO / Follow-ups

General backlog of deferred items. Latest first.

## Retention & closeout — "for later" (2026-09-20)

These were explicitly deferred while building the 10%/3-month retention + close
procedure. Kept here so they aren't lost.

- **Automate the PM "release from Stripe" step.** Today the PM releases via a
  manual action; the drawable wallet is ledger-only and the real payout runs
  through the existing `professional-wallet/transfer` → admin-confirm flow.
  Later: wire a real Stripe payout/transfer behind the same release entry point.

- **Pro payout method review.** Most pros won't have a Stripe account — they'll
  want bank deposit or another electronic method. Review payout options later
  (bank transfer, FPS, etc.).

- **Pro/client image "hold".** Allow a party to question/hold a closeout photo
  during the close procedure (`ProjectCloseout.status = 'held'` is reserved for
  this but not wired).

- **PM can add closeout photos.** Optionally let the PM contribute
  completed-project photos at close level (`pmPhotos` field already exists).

- **Automated retention release at 3 months.** Currently the PM clicks
  "Release retention" manually. Add a scheduler/cron to auto-release (and
  notify) when `retentionReleaseAt` elapses.

- **Retention for Class 2/3.** Retention is currently Class 1 (`SCALE_1`) only.
  `SCALE_3` has a separate legacy 5% path that should be reconciled/unified
  with the new 10% opt-in model.

- **Dedicated PM payout queue.** Rather than reusing the wallet-transfer →
  admin-confirm flow, consider a PM-facing payout/release queue.

- **Platform fee bank transfer automation.** `platform_fee_settlement` is
  ledger-only; the actual transfer to the Mimo bank account is manual/not wired.

- **Multi-milestone closeout reminders.** Closeout reminders currently fire for
  single-milestone (Class 1) only; extend to the final milestone of Class 2/3.

- **Gate retention close on reviews (optional).** Retention projects currently
  reach `CLOSED` via `releaseRetention` even without reviews (we flag + remind,
  but don't block). Decide whether to require both reviews before final close.

## Delete-project admin scope (2026-09-21)

The permanent ("hard") delete admin function (`DELETE /projects/:id/permanent`,
`ProjectsService` hard-delete path) needs a review now that the project has
more tables/fields:

- **New tables.** `ProjectReview` and `ProjectCloseout` are cascade-deleted via
  their FK (`onDelete: Cascade`), so they should be removed by the project
  delete — but they are **not** enumerated in the function's `residualCounts`
  safety net nor in the purge-audit `impactCounts`. Add explicit
  `projectReviews` / `projectCloseout` checks so a cascade misconfiguration
  doesn't silently leak rows.
- **Closeout photos.** `ProjectCloseout.clientPhotos/proPhotos/pmPhotos` are
  storage keys but are **not** included in the `fileCandidates` list, so their
  uploaded files would be orphaned in R2 after a purge. Add them to
  `fileCandidates` so `deleteProjectFiles` cleans them up.
- **Retention fields.** `ProjectPaymentPlan.retentionAmount/retentionReleaseAt`
  and the new `FinancialTransaction` types (`retention_hold`, `retention_release`,
  `platform_fee_settlement`) should already be covered by the existing
  `financialTransactions` / `paymentPlans` handling — verify no gaps.

## Retention policy notes (carried over)

- Retention constants: `RETENTION_PERCENT = 10`, `RETENTION_MONTHS = 3`
  (`apps/api/src/common/retention.constants.ts`). Feature flag
  `ENABLE_RETENTION_AND_CLOSEOUT` (default on).
- Constants-driven design so retention can be disabled instantly
  (`RETENTION_PERCENT = 0`).
