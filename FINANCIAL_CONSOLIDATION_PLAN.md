# Consolidation Plan: PaymentRequest → FinancialTransaction

## Current State Analysis

### PaymentRequest Table (Legacy)
```
- id, projectProfessionalId
- requestType (fixed|percentage)
- requestAmount, requestPercentage
- status (pending|approved|rejected)
- approvedAmount, rejectionReason, notes
- createdAt, updatedAt
- projectProfessional relation
```

**Issues:**
- Separate from FinancialTransaction; no unified view
- No link to which professional made the request (only via projectProfessional)
- No tracking of who approved/rejected or when
- Harder to filter and query across all actionable items

### FinancialTransaction Table (Current)
```
- id, projectId, projectProfessionalId
- type (escrow_deposit_request, advance_payment_request, etc)
- description, amount, status
- requestedBy, requestedByRole
- approvedBy (exists, unused for advance_payment_request)
- approvedAt (exists, unused for advance_payment_request)
- notes, createdAt, updatedAt
```

**Current Limitations:**
- No `professionalId` - can't directly filter by professional
- No `actionBy`, `actionByRole` - don't track who performed approval/rejection
- No `actionComplete` - unclear if action is pending or completed
- No `actionAt` - don't track when action was taken
- Inconsistent use of `approvedBy`/`approvedAt` (only some transactions)

---

## Proposed Consolidated Schema

### Enhanced FinancialTransaction Model

```prisma
model FinancialTransaction {
  id                    String       @id @default(cuid())
  projectId             String
  projectProfessionalId String?
  professionalId        String?      // Direct link for filtering by professional
  
  // Transaction details
  type                  String       // 'escrow_deposit_request', 'advance_payment_request', 'escrow_deposit', etc
  description           String
  amount                Decimal      @db.Decimal(12, 2)
  
  // Request phase
  requestedBy           String
  requestedByRole       String       // 'client', 'professional', 'platform'
  requestedAt           DateTime     @default(now())
  
  // Action phase (approval, rejection, completion)
  actionBy              String?      // Who took the action (approved/rejected/completed)
  actionByRole          String?      // 'client', 'admin', 'professional'
  actionAt              DateTime?    // When action was taken
  actionComplete        Boolean      @default(false)  // Has the action been completed?
  
  // Status tracking
  status                String       // 'pending', 'awaiting_confirmation', 'confirmed', 'completed', 'rejected', 'paid', 'info'
  notes                 String?
  
  // Audit
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  
  // Relations
  project               Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  professional          Professional? @relation(fields: [professionalId], references: [id], onDelete: SetNull)
  projectProfessional   ProjectProfessional? @relation(fields: [projectProfessionalId], references: [id], onDelete: SetNull)
  
  @@index([projectId])
  @@index([professionalId])
  @@index([status])
  @@index([actionComplete])
  @@index([requestedByRole])
}
```

**New Fields Explained:**
- `professionalId` - direct FK for querying by professional (easier filtering)
- `actionBy` - who performed the approval/rejection (clientId, adminId, etc)
- `actionByRole` - role of person who took action (client, admin, professional)
- `actionAt` - timestamp when action occurred
- `actionComplete` - boolean flag: has this transaction been actioned? (pending → approved → completed)

---

## Mapping PaymentRequest → FinancialTransaction

### Example: Advance Payment Request

**OLD (PaymentRequest + FinancialTransaction):**
```
PaymentRequest: {
  projectProfessionalId, 
  requestType: 'fixed',
  requestAmount: 5000,
  status: 'pending'
}

FinancialTransaction: {
  type: 'advance_payment_request',
  amount: 5000,
  status: 'pending',
  requestedBy: professionalId,
  requestedByRole: 'professional'
}
```

**NEW (Unified FinancialTransaction):**
```
FinancialTransaction: {
  projectId,
  projectProfessionalId,
  professionalId,  // NEW: direct link
  type: 'advance_payment_request',
  amount: 5000,
  
  requestedBy: professionalId,
  requestedByRole: 'professional',
  requestedAt: <timestamp>,
  
  actionBy: null,  // Not yet approved/rejected
  actionByRole: null,
  actionAt: null,
  actionComplete: false,
  
  status: 'pending',
  notes: 'Additional request metadata stored here as JSON or text'
}
```

**When CLIENT APPROVES:**
```
Update FinancialTransaction:
  status: 'confirmed',
  actionBy: clientId,
  actionByRole: 'client',
  actionAt: <now>,
  actionComplete: true
```

**When CLIENT REJECTS:**
```
Update FinancialTransaction:
  status: 'rejected',
  actionBy: clientId,
  actionByRole: 'client',
  actionAt: <now>,
  actionComplete: true,
  notes: 'Declined by client' + reason
```

---

## Implementation Phases

### Phase 1: Schema Update
1. Add new fields to FinancialTransaction Prisma model
2. Create migration to add columns
3. Populate `professionalId` from `projectProfessional.professionalId` for existing records
4. Set `actionComplete = true` for already-resolved transactions (status in confirmed/completed/rejected/paid)

### Phase 2: Backend Logic Updates
1. **Creation:** When creating any transaction, populate:
   - `professionalId` from request context or projectProfessional
   - `requestedBy`, `requestedByRole`
   - Leave `actionBy`, `actionByRole`, `actionAt` null initially
   - Set `actionComplete = false` for pending items

2. **Approval:** When approving (advance payment, etc):
   - Update `status`, `actionBy`, `actionByRole`, `actionAt`, `actionComplete = true`
   - Create chat message about approval

3. **Rejection:** When rejecting:
   - Update `status = 'rejected'`, `actionBy`, `actionByRole`, `actionAt`, `actionComplete = true`
   - Store reason in `notes`
   - Create chat message about rejection

### Phase 3: Frontend Updates
1. Remove PaymentRequest references
2. Filter FinancialTransaction by `actionComplete = false AND status = 'pending'` for action items
3. Show `actionBy` + `actionByRole` in transaction history
4. Display action buttons based on role + status + actionComplete

### Phase 4: PaymentRequest Deprecation
1. After confirming all data migrated and working:
   - Drop PaymentRequest table (or archive it)
   - Remove PaymentRequest from Prisma schema
   - Update professional controller to only create FinancialTransaction

---

## Filtering & Querying Strategy

### For Client: "Actions Pending My Approval"
```
WHERE status = 'pending' 
  AND actionComplete = false 
  AND requestedByRole = 'professional'
  AND type = 'advance_payment_request'
```

### For Professional: "My Request Status"
```
WHERE professionalId = <id>
  AND requestedByRole = 'professional'
  ORDER BY createdAt DESC
```

### For Admin: "All Pending Financial Actions"
```
WHERE actionComplete = false 
  AND status = 'pending'
  ORDER BY createdAt DESC
```

### For Project View: "All Transactions (History)"
```
WHERE projectId = <id>
  ORDER BY createdAt DESC
```

---

## Future: Unified Todo/Inbox View

Once consolidation is complete, we can build a unified action items dashboard:

### Data Sources
- **FinancialTransaction** where `actionComplete = false` (pending approvals, confirmations)
- **Message** where `readBy<Role>At = null` (unread messages)
- **ProjectProfessional** where `status` needs attention

### Example Unified View for Client
```
┌─ PENDING ACTIONS (actionComplete = false)
│  ├─ Advance Payment Request (professional name) - $X - Created Y days ago
│  ├─ Escrow Deposit Request - $X - Created Y days ago
│  └─ Payment Release Needed - $X - Created Y days ago
│
├─ UNREAD MESSAGES - Count
│  └─ 3 unread messages from [Professional]
│
└─ PROJECT STATUS
   ├─ Awaiting Project Acceptance - [List]
   └─ In Progress - [List]
```

---

## Summary Table: Field Mapping

| Scenario | type | status | requestedBy | requestedByRole | actionBy | actionByRole | actionComplete | When Updated |
|----------|------|--------|-------------|-----------------|----------|--------------|----------------|--------------|
| Prof requests advance | `advance_payment_request` | `pending` | profId | `professional` | null | null | false | at creation |
| Client approves advance | `advance_payment_request` | `confirmed` | profId | `professional` | clientId | `client` | true | on approve |
| Client rejects advance | `advance_payment_request` | `rejected` | profId | `professional` | clientId | `client` | true | on reject |
| FOH requests escrow | `escrow_deposit_request` | `pending` | `foh` | `platform` | null | null | false | at creation |
| Client confirms escrow | `escrow_deposit_request` | `paid` | `foh` | `platform` | clientId | `client` | true | on confirm |
| Info transaction | `quotation_accepted` | `info` | clientId | `client` | clientId | `client` | true | at creation |

---

## Next Steps

1. **Approve this plan** - confirm changes align with vision
2. **Implement Phase 1** - schema + migration
3. **Implement Phase 2** - update all transaction creation/update points
4. **Test** - ensure all flows work (advance payment, escrow, etc)
5. **Implement Phase 3** - frontend consolidation
6. **Archive/Drop PaymentRequest** - cleanup
7. **Plan Phase 4** - unified todo/inbox view design

