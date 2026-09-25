# TODO / Follow-ups

General backlog of deferred items. Latest first.

## Survey management tool (Day 2) (2026-09-25)

Back-office survey administration so BoH staff can run the feedback programme
without code changes:

- **View survey content** — list all surveys (feedback, post-project/NPS, etc.)
  and inspect their questions/options/tags.
- **Run schedule** — configure when a survey is shown (e.g. post-milestone,
  post-project, or a quarterly cadence) and the sampling/eligibility rate.
- **Edit surveys** — change questions, tag options, labels, and copy in place.
- **Create new surveys** — author a new survey from scratch (name, sections,
  questions, tag sets, scheduling).

This formalises what is currently hardcoded (`PostProjectSurveyModal`,
`UxFeedbackModal` questions/tags, `NEXT_PUBLIC_UX_FEEDBACK_RATE`) into a
data-driven survey model.

## Wallet consolidation + payout state (2026-09-22)

Decided (see report). Consolidate the pro-side wallets to a single-axis flow:

```
Client Wallet (escrow, incl. "allocated" money still held)
   →  Professional Wallet (single: professionalAvailable)
   →  Paid Out (professionalPaidOut)
```

- **Drop the "payout-pending" state now.** The PM's "Make transfer to pro"
  action is single-step → instant `Paid Out` (already implemented via
  `pmPayoutProfessional`). Remove `professionalInPayoutProcessing` from the
  wallet summary/UI; it's always 0 for new transfers.
- **Retire `transferProfessionalWalletBalance` / `confirmProfessionalWalletTransfer`**
  once the pro-request path is fully replaced by `pmPayoutProfessional`.
- **Reintroduce a pending state only for real Stripe payouts (later).** It must
  be Stripe-driven (transfer initiated → pending → webhook → paid out), never a
  second manual confirm.

## Milestone approval next-step not advancing (2026-09-22)

Smoke-tested: client "Approve milestone" next-step doesn't advance; pro side
stays on "Awaiting milestone approval". Root causes identified (see report):

- **`APPROVE_MILESTONE` routes to `GeneralActionModal` (`modalType: 'payment'`)**
  whose "Approve" button is `navigate_tab` — it navigates, never approves.
  The real sign-off approval is a *separate* flow in the progress-report modal
  (`REVIEW_PROGRESS` → `SignOffCard` "Approve" → `/progress-reports/:id/sign-off`).
  Two entry points for one action = the modal confusion the user flagged.
- **`approveSignOff` only completes `APPROVE_MILESTONE`, not `REVIEW_PROGRESS`.**
  Both are `isPrimary` client steps in `MILESTONE_PENDING`; the synthetic
  `REVIEW_PROGRESS` step lingers after approval.
- **COMPLETED record stamped with wrong stage.** `recordNextStepAction` runs
  *before* the stage transition, so the COMPLETED row is written with
  `projectStage = MILESTONE_PENDING`, then the project moves to
  `COMPLETE`/`WORK_IN_PROGRESS`; `getNextSteps` filters `completedActions` by the
  new stage and never matches it.
- **Silent stage-transition failures.** `createReport` → `MILESTONE_PENDING` and
  `approveSignOff` → next-stage transitions are wrapped in swallowing try/catch.

Fix plan (deferred): (1) unify `APPROVE_MILESTONE` to open the progress-report /
sign-off modal directly (or make the generic modal's "Approve" call the sign-off
endpoint + `completeNextStep`); (2) record BOTH `APPROVE_MILESTONE` and
`REVIEW_PROGRESS` as COMPLETED, stamped against the correct (post-transition)
stage; (3) ensure client re-fetch/invalidation after approval; (4) surface stage
transition errors instead of swallowing them.

## Retention & closeout — "for later" (2026-09-20)

These were explicitly deferred while building the 10%/3-month retention + close
procedure. Kept here so they aren't lost.

- **Automate the PM "release from Stripe" step.** Today the PM releases via a
  manual action; the drawable wallet is ledger-only and the real payout runs
  through the existing `professional-wallet/transfer` → confirm flow (the
  confirm step now accepts the assigned PM as well as admin). Later: wire a
  real Stripe payout/transfer behind the same release entry point.

- **"Special circumstances" PM authorization.** The normal Class 1 release is
  client-authoritative (no PM). On the unhappy path (dispute, failed payout,
  unusual amount, etc.) we need a PM-authorized override that bypasses the
  client step — carrying a required reason field, an audit-log entry, and a
  flag so it can't be mistaken for a normal release. Not yet wired.

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
  with the new 10% opt-in model. Note: Class 2/3 projects may have **compulsory**
  retention factors (TBC), but are **certainly not excluded** from the retention
  policy — they must be brought under it, not skipped.

- **Multi-milestone (Class 2/3) → defects lifecycle.** The per-milestone loop
  (`WORK_IN_PROGRESS ↔ MILESTONE_PENDING` via `createReport`/`approveSignOff`)
  is wired, but there is **no "last milestone" detection** and **no transition
  into** `NEAR_COMPLETION`/`FINAL_INSPECTION` (stages are seeded but unreachable).
  Need: detect "all milestones completed", then route
  `NEAR_COMPLETION → FINAL_INSPECTION → COMPLETE → (warranty_period if retention)`.

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
