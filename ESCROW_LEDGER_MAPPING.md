# Escrow Ledger Transaction Mapping

## Overview
This document ensures every FinancialTransaction that affects escrow is matched with an EscrowLedger entry.

---

## Transaction Type Mapping

### 1. `quotation_accepted`
**Status**: `info` (informational, no action)  
**Escrow Impact**: ❌ **NO ledger entry** (informational only)  
**Where Created**:
- `apps/api/src/client/client.controller.ts:201` (client accepts quote)
- `apps/api/src/professional/professional.controller.ts:415` (professional accepts project)
- `apps/api/src/projects/projects.service.ts:1236` (admin awards quote)

**What Happens**:
- Creates quotation_accepted transaction (status='info', actionComplete=true)
- Sets Project.approvedBudget = quoteAmount
- Sets Project.approvedBudgetTxId = quoteTx.id (links transaction)
- Sets Project.awardedProjectProfessionalId = projectProfessionalId
- Sets Project.escrowRequired = quoteAmount

**Analysis**: ✅ Correct - This is pure information. No money moves. No ledger entry needed.

---

### 2. `escrow_deposit_request`
**Status**: `pending` (awaits client confirmation)  
**Escrow Impact**: ❌ **NO ledger entry** (not yet confirmed)  
**Where Created**:
- `apps/api/src/client/client.controller.ts:229` (after quote acceptance)
- `apps/api/src/professional/professional.controller.ts:445` (after quote acceptance)
- `apps/api/src/projects/projects.service.ts:1264` (after award)

**What Happens**:
- Creates escrow_deposit_request transaction
- Status = 'pending'
- requestedBy = 'foh', requestedByRole = 'platform'
- actionBy = clientId, actionByRole = 'client'
- Waiting for client to confirm they've paid

**Analysis**: ✅ Correct - This is a pending request. Money hasn't been confirmed yet. No ledger entry until confirmEscrowDeposit.

---

### 3. `escrow_deposit` / `escrow_deposit_confirmation`
**Status**: `pending` (awaiting admin confirmation)  
**Escrow Impact**: ❌ **Ledger entry created when CONFIRMED** (not on creation)  
**Where Updated**:
- `apps/api/src/financial/financial.service.ts:249` (confirmEscrowDeposit)

**What Happens When Confirmed**:
1. FinancialTransaction updated: status='confirmed', actionComplete=true
2. **EscrowLedger entry CREATED** (this is correct):
   - direction = 'credit'
   - amount = tx.amount
   - projectId, projectProfessionalId, transactionId
3. Project.escrowHeld += amount
4. Project.escrowHeldUpdatedAt = now()

**Analysis**: ✅ Correct - Ledger entry created atomically when confirmed. Single source of truth: Project.escrowHeld and EscrowLedger balance match.

---

### 4. `advance_payment_request`
**Status**: `pending` (awaits client approval)  
**Escrow Impact**: ❌ **NO ledger entry** (not escrow, different flow)  
**Where Created**:
- `apps/api/src/professional/professional.controller.ts:691` (professional requests advance)

**What Happens**:
- Creates advance_payment_request transaction
- Status = 'pending'
- requestedBy = professionalId, requestedByRole = 'professional'
- actionBy = clientId, actionByRole = 'client'
- Client must approve, then client confirms payment, then admin releases

**Analysis**: ✅ Correct - This is NOT an escrow transaction. It's a separate advance payment flow. No ledger entry needed unless/until released (see #5).

---

### 5. `release_payment` / `advance_payment_request` (with status='confirmed')
**Status**: `confirmed` (payment released)  
**Escrow Impact**: ✅ **YES - Ledger entry created** (debit)  
**Where Updated**:
- `apps/api/src/financial/financial.service.ts:335` (releasePayment)

**What Happens**:
1. FinancialTransaction updated: status='confirmed', actionComplete=true
2. **EscrowLedger entry CREATED** (this is correct):
   - direction = 'debit'
   - amount = tx.amount
   - projectId, projectProfessionalId, transactionId
3. Project.escrowHeld -= amount (with floor at 0)
4. Project.escrowHeldUpdatedAt = now()

**Analysis**: ✅ Correct - Ledger entry created atomically when released. Balances escrow down by released amount.

---

## Other Transaction Types (Created but Not in Current Flow)

### `advance_payment_approval` / `advance_payment_rejection`
**Status**: `info` or `confirmed`  
**Escrow Impact**: ❌ **NO ledger entry**  
**Analysis**: These are approval/rejection notifications. Money doesn't move yet. No ledger entry needed.

---

## Escrow Ledger Summary

**Ledger entries are created ONLY when**:
1. `escrow_deposit` / `escrow_deposit_confirmation` is **confirmed** → **CREDIT** entry
2. `release_payment` (or advance_payment_request with confirmed status) is **released** → **DEBIT** entry

**Ledger entries are NOT created for**:
- Informational transactions (quotation_accepted, approvals, rejections)
- Pending requests (escrow_deposit_request, advance_payment_request until confirmed)

---

## Project.escrowHeld Truth

**Single Source of Truth**: `Project.escrowHeld`
- Set to 0 when escrow_deposit_request is created
- Incremented when escrow_deposit is confirmed
- Decremented when payment is released
- Recalculated from EscrowLedger on backfill

**Ledger Purpose**: Audit trail of all escrow movements with running balance.

**Verification**: `SUM(CASE WHEN direction='credit' THEN amount ELSE -amount END) FROM EscrowLedger WHERE projectId=X` should equal `Project.escrowHeld`

---

## Zero-to-Hero Test Flow

### Step 1: Create Project (No Escrow)
- Project created with status='active'
- escrowHeld = 0, escrowRequired = NULL
- No FinancialTransaction created
- No EscrowLedger entries

### Step 2: Client Accepts Quotation
- ✅ `quotation_accepted` transaction created (status='info')
- ✅ Project.approvedBudget = quoteAmount
- ✅ Project.approvedBudgetTxId = quoteTx.id
- ✅ Project.awardedProjectProfessionalId set
- ✅ Project.escrowRequired = quoteAmount
- ✅ `escrow_deposit_request` transaction created (status='pending')
- **Check**: No EscrowLedger entries yet ✓

### Step 3: Client Confirms Deposit Paid
- Client marks `escrow_deposit_request` as complete (UI interaction)
- Backend creates/updates `escrow_deposit_confirmation` (or changes type)
- **Pending admin confirmation**

### Step 4: Admin Confirms Deposit Received
- **confirmEscrowDeposit()** called
- ✅ `escrow_deposit` transaction status → 'confirmed'
- ✅ **EscrowLedger CREDIT entry created** (amount = approved budget)
- ✅ Project.escrowHeld += amount
- ✅ Project.escrowHeldUpdatedAt = now()
- **Verify**: EscrowLedger balance = Project.escrowHeld ✓

### Step 5: Professional Requests Advance Payment (Optional)
- ✅ `advance_payment_request` transaction created (status='pending')
- **Check**: No EscrowLedger entries yet ✓

### Step 6: Client Approves & Confirms Advance Payment
- ✅ `advance_payment_approval` transaction created (status='info')
- Client marks advance as confirmed

### Step 7: Admin Releases Payment to Professional
- **releasePayment()** called
- ✅ `release_payment` transaction status → 'confirmed'
- ✅ **EscrowLedger DEBIT entry created** (amount = advance amount)
- ✅ Project.escrowHeld -= amount
- ✅ Project.escrowHeldUpdatedAt = now()
- **Verify**: EscrowLedger balance = Project.escrowHeld ✓

### Step 8: Final Balance Check
- Run statement query
- EscrowLedger shows: 1 credit, 1 debit
- Running balance: approved_budget → (approved_budget - advance) → 0
- Project.escrowHeld = final balance
- All matches ✓

---

## Code Verification Checklist

- [ ] confirmEscrowDeposit writes EscrowLedger with direction='credit' ✓
- [ ] confirmEscrowDeposit updates Project.escrowHeld += amount ✓
- [ ] releasePayment writes EscrowLedger with direction='debit' ✓
- [ ] releasePayment updates Project.escrowHeld -= amount ✓
- [ ] quotation_accepted does NOT create ledger entry ✓
- [ ] escrow_deposit_request does NOT create ledger entry ✓
- [ ] backfill SQL inserts from confirmed escrow_deposit/escrow_deposit_confirmation ✓
- [ ] backfill SQL inserts from confirmed release_payment/advance_payment_request ✓
- [ ] backfill SQL recalculates Project.escrowHeld from ledger SUM ✓
- [ ] Frontend statement modal shows running balance with credit/debit ✓
- [ ] Project financials card displays Project.escrowHeld ✓

---

## Known Limitations / Observations

1. **No ledger on escrow_deposit_request creation**: Transaction is created but money hasn't been confirmed. Ledger only on admin confirm. ✓ Correct pattern

2. **advance_payment_request is NOT an escrow flow**: It's a separate path where professional requests cash advance. Ledger entry only created when admin releases (releasePayment). Could be improved with explicit type for advance vs escrow flows, but current logic works.

3. **Backfill SQL must run once**: After schema migration, run BACKFILL_ESCROW_LEDGER.sql to populate ledger from historical confirmed transactions.

4. **Transaction.transactionId FK**: EscrowLedger.transactionId links each ledger entry to the triggering FinancialTransaction for full audit trail.

5. **Running balance calculation**: Frontend statement modal calculates running balance by summing credits/debits in order. Must match Project.escrowHeld (which is the accumulated result).

