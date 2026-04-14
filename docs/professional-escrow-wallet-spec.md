# Professional Escrow Wallet Spec

## Goal

Introduce a **Professional Escrow Wallet** so the platform can distinguish between:

1. **Client-funded escrow** — money received and held at project level
2. **Professional escrow** — money approved/earmarked for a professional but still restricted
3. **Professional available balance** — money the professional can transfer out
4. **Paid out** — money already transferred to the professional
5. **Unfunded remainder** — contract value not yet funded by the client

This replaces the current simplified financial view with a clearer staged cashflow model.

---

## Problem Statement

The current financial UX shows project value, in escrow, and paid. That is not enough for staged projects because it does not answer:

- How much money is already funded by the client?
- How much of that funded money is earmarked for the professional?
- How much is approved but still locked pending evidence/completion?
- How much is immediately transferable?
- How much has already been withdrawn?

For professionals, the most important balance is not total project escrow. It is:

- **Held for me**
- **Available now**
- **Already paid out**

---

## Product Principles

1. **One project can have multiple financial states at once**
   - funded by client
   - allocated to professional
   - available to professional
   - already paid out

2. **Milestone state and money state are related but not identical**
   A milestone can be funded, approved, partially evidenced, available, or paid out.

3. **The UI should separate project money flow from milestone progress**
   - Top rail: money state
   - Lower rail/list: milestone status and milestone-level balances

4. **Use ledger events, not only status flags**
   Derived balances should come from typed transactions / ledger entries.

---

## Recommended Financial Model

### Core Buckets

For each project and each assigned professional, derive these balances:

- `contractValue`
- `clientEscrowHeld`
- `professionalEscrowAllocated`
- `professionalAvailable`
- `professionalPaidOut`
- `remainingToFund`

### Definitions

#### `contractValue`
Approved quote / plan total for the project-professional relationship.

#### `clientEscrowHeld`
Money already funded by the client and currently held by the project, but not yet paid out.

Formula intent:

`clientEscrowHeld = fundedByClient - paidOut`

#### `professionalEscrowAllocated`
Money that is approved and reserved for the professional but is still restricted.
Examples:
- approved deposit, pending receipt verification
- stage amount approved, pending delivery/completion rule
- retention-held amount

#### `professionalAvailable`
Money the professional can transfer out immediately.

#### `professionalPaidOut`
Money already transferred to the professional's external account.

#### `remainingToFund`
Money not yet deposited by the client.

Formula intent:

`remainingToFund = max(contractValue - clientFundedTotal, 0)`

---

## Milestone-Level Model

Each payment milestone should expose:

- `plannedAmount`
- `fundedAmount`
- `allocatedAmount`
- `availableAmount`
- `paidOutAmount`
- `status`
- `releaseCondition`

### Suggested milestone statuses

- `planned`
- `awaiting_client_funding`
- `funded`
- `requested`
- `approved_locked`
- `available`
- `partially_paid_out`
- `paid_out`
- `disputed`
- `cancelled`

### Suggested release conditions

- `on_client_funding`
- `on_receipt_verification`
- `on_stage_approval`
- `on_completion_approval`
- `on_retention_release_date`
- `manual_admin_release`

---

## Ledger / Event Model

Use typed ledger entries to derive balances. Do not rely on one field per state.

### Recommended ledger event types

#### Funding / escrow
- `client_escrow_funded`
- `client_escrow_reconciled`
- `funding_shortfall_recorded`

#### Professional allocation
- `professional_allocation_created`
- `professional_allocation_adjusted`
- `professional_allocation_reversed`

#### Evidence / approval
- `evidence_submitted`
- `evidence_verified`
- `evidence_rejected`
- `stage_approved`
- `stage_rejected`

#### Availability
- `balance_unlocked`
- `balance_locked`
- `retention_created`
- `retention_released`

#### Withdrawal / payout
- `withdrawal_requested`
- `withdrawal_cancelled`
- `withdrawal_processing`
- `withdrawal_completed`
- `withdrawal_failed`

### Minimal derived rules

- `professionalEscrowAllocated` = sum(allocations created) - sum(unlocked) - sum(reversed)
- `professionalAvailable` = sum(balance unlocked) - sum(withdrawal completed/processing if you want to reserve immediately)
- `professionalPaidOut` = sum(withdrawal completed)

---

## State Machine

### Stage payment lifecycle

1. milestone planned
2. client funds escrow
3. professional requests milestone payment
4. client/admin approves request
5. funds become either:
   - `professionalEscrowAllocated` if still locked, or
   - `professionalAvailable` if immediately releasable
6. professional withdraws
7. amount becomes `professionalPaidOut`

### Deposit example

1. client deposits full or partial funding
2. professional requests 20% deposit
3. approval creates `professional_allocation_created`
4. funds move into `professionalEscrowAllocated`
5. receipt/invoice uploaded
6. receipt verified => `balance_unlocked`
7. professional withdraws => `withdrawal_completed`

### Final payment example

1. completion approved by both parties
2. final milestone allocated
3. final milestone unlocked
4. professional withdraws

---

## Scale Rules

### Scale 1
Typical pattern: 2 milestones
- deposit/start
- completion

Suggested default:
- client funds 100% upfront
- deposit can be allocated early
- balance unlocks on completion approval

### Scale 2
Typical pattern: 3 milestones
- deposit
- materials / on-site delivery
- completion

Suggested default:
- first 1-2 milestones funded first, depending on payment policy
- deposit may unlock on approval or receipt verification
- delivery milestone unlocks on evidence verification
- completion unlocks on mutual approval

### Scale 3
Multi-stage / larger project

Suggested default:
- staged funding windows
- optional retention
- more admin override support
- clearer dispute / holdback flows

---

## UI / UX Proposal

## 1. Replace current summary cards with wallet cards

### For professional
Show 4 headline cards:

- **Contract Value**
- **In Escrow For You**
- **Available To Transfer**
- **Paid Out**

Optional small subtext:
- `Awaiting client funding: HK$X`
- `Next unlock: Completion stage`

### For client/admin
Show 5 headline cards:

- **Approved Quote**
- **Client Escrow Held**
- **Allocated To Professional**
- **Available To Professional**
- **Paid Out**

---

## 2. Main stacked cashflow bar

Represent 100% of `contractValue` as a single horizontal stacked bar:

- green-700: `professionalPaidOut`
- green-400: `professionalAvailable`
- amber-400: `professionalEscrowAllocated`
- blue-400: `clientEscrowHeld` not yet allocated
- slate-600: `remainingToFund`

### Bar behavior
- values proportional to contract value
- hover tooltip shows amount + percent
- clicking a segment filters the milestone list / ledger below

### Accessibility
- each segment gets visible label in legend
- never rely on color only
- include text summary beneath bar

Example text summary:

- Paid out: HK$20,000
- Available now: HK$10,000
- Held for you: HK$15,000
- Held in project escrow: HK$35,000
- Unfunded: HK$20,000

---

## 3. Milestone rail below the bar

Each milestone row/card should show:

- title
- % / amount
- funded badge
- request status badge
- evidence badge
- wallet outcome badge

Example badges:
- Funded
- Awaiting approval
- Receipt pending
- Available now
- Paid out
- Held in retention

### Recommended layout

- left: milestone title + sequence
- middle: amount + due / target date
- right: mini segmented status bar or badges
- expandable detail row with transactions/evidence

---

## 4. Professional Wallet panel

Add a dedicated panel for professionals:

### Professional Escrow Wallet
- Held for you
- Available to transfer
- In payout processing
- Paid out total
- Recent wallet activity

Actions:
- `Transfer available funds`
- `View payout history`
- `View evidence linked to releases`

This can initially be a read-only ledger if payouts are not yet automated.

---

## Data/API Proposal

### A. New derived summary endpoint

Add a project-professional wallet summary, for example:

`GET /financial/project/:projectId/professional-wallet/:projectProfessionalId`

Response shape:

```json
{
  "contractValue": 120000,
  "clientEscrowHeld": 70000,
  "professionalEscrowAllocated": 15000,
  "professionalAvailable": 10000,
  "professionalPaidOut": 25000,
  "remainingToFund": 50000,
  "currency": "HKD",
  "nextUnlock": {
    "milestoneId": "...",
    "title": "Completion",
    "amount": 35000,
    "condition": "on_completion_approval"
  }
}
```

### B. Milestone financial breakdown endpoint

`GET /projects/:projectId/payment-plan/balance-breakdown`

Response per milestone:

```json
{
  "milestones": [
    {
      "id": "m1",
      "title": "Deposit",
      "plannedAmount": 24000,
      "fundedAmount": 24000,
      "allocatedAmount": 24000,
      "availableAmount": 12000,
      "paidOutAmount": 12000,
      "status": "partially_paid_out",
      "releaseCondition": "on_receipt_verification"
    }
  ]
}
```

### C. Wallet activity endpoint

`GET /financial/project/:projectId/professional-wallet/:projectProfessionalId/activity`

This returns normalized activity rows for:
- funding
- approvals
- evidence verification
- unlocks
- withdrawals

---

## Integration with Existing Code

Current useful foundations already exist:

- financial summary aggregation in `apps/api/src/financial/financial.service.ts`
- escrow statement ledger in `apps/api/src/financial/financial.service.ts`
- UI financial card in `apps/web/src/components/project-financials-card.tsx`

### Recommended implementation strategy

#### Phase 1 — derived wallet UX
Fastest path.

- keep current transaction table
- add derived wallet summary in service layer
- map existing transaction types to the new buckets
- update financial card UI to show stacked bar + wallet cards + milestone breakdown

This gives immediate value with minimal schema risk.

#### Phase 2 — explicit wallet ledger
- add dedicated wallet ledger/event types
- add withdrawal workflow states
- add milestone allocation/unlock records
- support retention and dispute holds cleanly

#### Phase 3 — operational payout flow
- connected account / payout destination verification
- payout processing states
- webhook reconciliation
- admin controls and exception handling

---

## Mapping Current Transaction Types to Phase 1 Buckets

Existing transaction types appear to include:
- `escrow_deposit`
- `escrow_deposit_confirmation`
- `payment_request`
- `advance_payment_approval`
- `release_payment`

### Initial mapping proposal

- confirmed `escrow_deposit` + confirmed `escrow_deposit_confirmation`
  - contributes to `clientEscrowHeld`

- approved deposit / approved stage request
  - contributes to `professionalEscrowAllocated`
  - unless current business rule says it is immediately releasable

- confirmed `release_payment`
  - contributes to `professionalPaidOut`

- add derived unlocked state
  - contributes to `professionalAvailable`

Phase 1 may need one extra field or event to distinguish:
- allocated-but-locked
- available-to-transfer

That distinction is the critical missing piece.

---

## Business Rules To Decide

These need explicit policy decisions before implementation:

1. **When does money become allocated to the pro?**
   - client approval?
   - admin verification?
   - both?

2. **When does allocated money become available?**
   - receipt verified?
   - milestone approved?
   - admin release?

3. **Does payout happen automatically or only on manual transfer request?**

4. **Do processing withdrawals reduce available balance immediately?**

5. **Can a client claw back allocated funds before unlock?**

6. **How is retention represented?**
   - locked allocation?
   - separate hold bucket?

7. **Can one project have multiple professionals with separate wallet balances?**
   - recommended: yes, always scope by `projectProfessionalId`

---

## SLA Policy (Response Windows)

Use **SLA** wording (not ETA) for action response obligations in the standard agreement.

### Scale defaults

- **Scale 1**: response within **24 hours**
- **Scale 2**: response within **48 hours**
- **Scale 3**: response within **3 working days**

### SLA categories (same project, different SLA per payment type)

The same project must support different SLA windows for each category:

- `escrow_deposit`
- `upfront_payment`
- `milestone_payment`
- `final_payment`
- `cancellation_payment` *(to be added)*
- `retention_release`

### Override hierarchy

1. **Project-level category override** (highest priority)
2. **Scale-level category default**
3. **Global fallback**

### Finite increments

SLA values should only be editable in fixed increments to keep governance simple.

Recommended increment set:

- Hours mode: `12h`, `24h`, `36h`, `48h`, `72h`, `96h`
- Working-day mode: `1`, `2`, `3`, `4`, `5` working days

### Working-day handling

For scale/category rules configured in working days:

- exclude Saturday/Sunday
- allow future HK holiday-calendar support
- store both:
   - configured SLA value (`3 working days`), and
   - computed breach deadline timestamp (UTC)

### Operational behavior

Each actionable financial item should carry:

- `slaCategory`
- `slaTarget` (`hours` or `working_days`)
- `slaValue`
- `slaStartsAt`
- `slaDueAt`
- `slaStatus` (`on_track`, `at_risk`, `breached`)

This enables project-level SLA dashboards and transaction-level breach alerts.

### API direction

Add endpoints for policy management and evaluation:

- `GET /financial/project/:projectId/sla-policy`
- `PUT /financial/project/:projectId/sla-policy`
- `GET /financial/project/:projectId/sla-status`

### Migration notes

- Preserve current `pending-release-sla` behavior as fallback during rollout.
- Backfill existing financial records with inferred `slaCategory` from transaction type.
- Start with admin-configurable project policy; expose client/professional view as read-only.

---

## Recommended Default Policy

To keep the first version understandable:

- client funding enters project escrow
- approved stage/deposit moves funds to professional escrow
- evidence/completion approval unlocks funds to available balance
- professional manually requests transfer
- transfer completion marks funds as paid out
- retention remains in professional escrow but locked until release date/event

This policy maps well to your examples and is easy to explain in the UI.

---

## Suggested Visual Copy

### Professional-facing labels
- `In Escrow For You`
- `Available To Transfer`
- `Paid Out`
- `Next Unlock`
- `Awaiting Client Funding`

### Client-facing labels
- `Client Escrow Held`
- `Allocated To Professional`
- `Available To Professional`
- `Paid Out`
- `Remaining To Fund`

---

## Risks

1. **Confusion if one bar tries to show both milestone status and wallet state**
   Avoid by separating them.

2. **Backend ambiguity between approved and available**
   Must be modeled explicitly.

3. **Compliance / custody considerations**
   If this becomes a true stored-value wallet, payment-provider and legal constraints matter.

4. **Dispute flows**
   Need a way to freeze allocated or available balances when contested.

---

## MVP Recommendation

Build this first:

1. new derived wallet summary endpoint
2. stacked project cashflow bar
3. milestone financial breakdown rows
4. professional wallet summary card
5. explicit `available` vs `allocated` distinction

Do **not** start with automated payout orchestration unless the payout rails are already mature.

---

## Success Criteria

A professional should be able to answer these in under 10 seconds:

- How much is held for me?
- How much can I transfer today?
- How much have I already been paid?
- What must happen for the next funds to unlock?

A client should be able to answer:

- How much have I funded?
- How much is reserved for the pro?
- How much is already paid out?
- What remains unfunded?

---

## Next Build Step

Implement **Phase 1** in the existing financial flow:

1. add derived wallet summary logic in financial service
2. expose milestone-level balance breakdown
3. redesign `project-financials-card.tsx` to use:
   - stacked cashflow bar
   - wallet cards
   - milestone rail
4. keep payout actions read-only or manual-request based for the first release
