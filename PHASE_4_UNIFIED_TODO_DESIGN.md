# Phase 4: Unified Todo/Inbox View

## Design Overview

Replace scattered notification badges with a centralized **"You have updates"** button leading to a comprehensive todo/inbox modal.

---

## Data Sources

### 1. Financial Transactions (Outstanding Actions)
```
FinancialTransaction
WHERE actionComplete = false AND status IN ('pending', 'awaiting_confirmation')
GROUP BY type:
  - advance_payment_request (awaiting client approval)
  - escrow_deposit_request (awaiting client confirmation)
  - escrow_deposit_confirmation (awaiting admin verification)
  - advance_payment_request rejected by client (info only)
```

**Count:** For client: pending advance_payment_request + escrow_deposit_request
For professional: their own advance_payment_request that are awaiting action

### 2. Chat Messages (New/Unread)
```
Message
WHERE (senderType = 'professional' AND readByClientAt IS NULL) 
   OR (senderType = 'client' AND readByProfessionalAt IS NULL)
   OR (senderType = 'admin' AND readByClientAt IS NULL AND readByProfessionalAt IS NULL)
```

**Count:** Count by projectProfessionalId for professionals, by projectId for clients

### 3. Project Professional Status Changes (Future)
```
ProjectProfessional
WHERE status IN ('quoted', 'accepted', 'awarded', 'declined')
AND updatedAt > lastViewedAt
```

**For Phase 4:** Optional - plan for future

---

## UI Structure

### Button Location & Design

**Home Page & Project Pages:**
```
┌─────────────────────────────────────────────┐
│  🔔 You have 5 updates                      │ ← Big friendly button
│     (2 payments awaiting approval,          │    Top center/right
│      3 unread messages)                     │
└─────────────────────────────────────────────┘
```

**Navbar:** (Optional secondary indicator)
- Small badge count only if updates exist
- Clicking navbar icon also opens modal
- Remove old client name & projects notification badges

### Modal Layout

```
┌─────────────────────────────────────────────────────────┐
│ 📋 Your Updates & Actions                        [Close] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ⚡ OUTSTANDING FINANCIAL ACTIONS (2)                   │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Payment Request - Project A                       │ │
│ │ Professional requested $5,000 (50% deposit)      │ │
│ │ Status: Awaiting your approval                   │ │
│ │ [Approve] [Decline]                             │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Escrow Deposit - Project B                       │ │
│ │ FOH is requesting deposit confirmation           │ │
│ │ Status: Pending confirmation of $10,000         │ │
│ │ [Confirm Deposit Made]                          │ │
│ └───────────────────────────────────────────────────┘ │
│                                                         │
│ 💬 NEW MESSAGES (3)                                    │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Project A - John Doe                              │ │
│ │ "Can we discuss the timeline..."               │ │
│ │ [View Conversation]                             │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Project C - Jane Smith                            │ │
│ │ "Quote looks good, let's get started"          │ │
│ │ [View Conversation]                             │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Project B - Admin                                 │ │
│ │ "Your quote has been awarded!"                  │ │
│ │ [View Project]                                  │ │
│ └───────────────────────────────────────────────────┘ │
│                                                         │
│ ✅ Mark all as read    🔄 Refresh                     │
└─────────────────────────────────────────────────────────┘
```

---

## API Requirements

### New Endpoint: GET /updates/summary
```typescript
{
  financialActions: [
    {
      id: string,
      projectId: string,
      projectName: string,
      type: 'advance_payment_request' | 'escrow_deposit_request' | 'escrow_deposit_confirmation',
      amount: number,
      description: string,
      status: string,
      actionRequired: boolean,
      createdAt: DateTime,
      requestedBy?: string,
      requestedByRole?: string,
    }
  ],
  unreadMessages: [
    {
      id: string,
      projectId: string,
      projectProfessionalId?: string,
      projectName: string,
      senderName: string,
      senderType: 'client' | 'professional' | 'admin',
      lastMessage: string,
      messageCount: number,
      lastMessageAt: DateTime,
    }
  ],
  counts: {
    financialActionCount: number,
    messageCount: number,
    totalCount: number,
  }
}
```

**Guard:** CombinedAuthGuard (works for client, professional, admin)
**Filter:** By authenticated user's role and ID

---

## Implementation Plan

### Phase 4a: Backend API
1. Create `updates.service.ts` with methods:
   - `getFinancialActions(userId, role)`
   - `getUnreadMessages(userId, role)`
   - `getUpdatesSummary(userId, role)`

2. Create `updates.controller.ts` with endpoint:
   - `GET /updates/summary`

3. Test queries to ensure:
   - Financial transactions filtered correctly by actionComplete=false
   - Messages filtered by unread status
   - Counts accurate

### Phase 4b: Frontend - Updates Modal Component
1. Create `updates-modal.tsx` component
   - Display financial actions with action buttons
   - Display unread messages with links
   - Show total count badge
   - Implement mark as read functionality

2. Create `updates-button.tsx` component
   - Show count badge
   - Open modal on click
   - Big friendly UI as specified

3. Add to pages:
   - Home page: Center top
   - Project list page: Top right
   - Professional projects page: Top right

### Phase 4c: Cleanup Old Badges
1. Remove notification badges from:
   - Client name in sidebar/navbar
   - "My Projects" text/button
   - Replace with unified button

2. Remove badge calculation logic from:
   - Project listing components
   - Client profile components

---

## Role-Specific Todo Content

### For Client
**Financial Actions:**
- Advance payment requests (awaiting approval)
- Escrow deposit requests (awaiting confirmation)
- Payment release confirmations (info)

**Messages:**
- Unread from professionals
- Unread from admins (support, notifications)

### For Professional
**Financial Actions:**
- Their own advance payment requests (awaiting client decision)
- Projects awaiting them to take action (future)

**Messages:**
- Unread from clients
- Unread from admins

### For Admin
**Financial Actions:**
- Escrow confirmations awaiting verification
- All pending financial items (monitoring)

**Messages:**
- Unread from anyone

---

## Count Badge Calculation

### Simple Rule
```
Total Updates Count = 
  (Financial Actions with actionComplete=false) + 
  (Unread Messages)
```

**Show badge if count > 0**
- Client: Show badge on "You have X updates" button
- Professional: Show badge on projects with pending items
- Admin: Show badge for any pending items

---

## SQL Queries Reference

### Financial Actions (Client)
```sql
SELECT 
  id, projectId, projectProfessionalId, type, amount, 
  description, status, createdAt, requestedBy, requestedByRole
FROM "FinancialTransaction"
WHERE projectId IN (
  SELECT id FROM "Project" WHERE clientId = $1 OR userId = $1
)
AND actionComplete = false
AND status IN ('pending', 'awaiting_confirmation')
AND type IN ('advance_payment_request', 'escrow_deposit_request', 'escrow_deposit_confirmation')
ORDER BY createdAt DESC;
```

### Unread Messages (Client)
```sql
SELECT DISTINCT
  m."projectProfessionalId",
  m."projectId",
  p."projectName",
  prof."fullName" || prof."businessName" as senderName,
  m."senderType",
  COUNT(*) as messageCount,
  MAX(m."createdAt") as lastMessageAt
FROM "Message" m
JOIN "Project" p ON m."projectId" = p."id"
LEFT JOIN "Professional" prof ON m."senderProfessionalId" = prof."id"
WHERE p.clientId = $1 AND m."readByClientAt" IS NULL
GROUP BY m."projectProfessionalId", m."projectId", p."projectName", senderName, m."senderType"
ORDER BY MAX(m."createdAt") DESC;
```

---

## Future Enhancements

### Phase 4+ Ideas
- [ ] Project Professional status alerts (new quote, accepted, awarded)
- [ ] Payment release notifications
- [ ] Project completion alerts
- [ ] Admin dashboard with all pending items
- [ ] Desktop notifications / email digest
- [ ] Real-time updates via WebSocket
- [ ] Filtering by project or type
- [ ] Snooze/dismiss notifications

---

## Implementation Checklist

- [ ] Design finalized with user
- [ ] Backend: Create updates.service.ts
- [ ] Backend: Create updates.controller.ts with GET /updates/summary
- [ ] Backend: Test financial action queries
- [ ] Backend: Test unread message queries
- [ ] Frontend: Create updates-modal.tsx component
- [ ] Frontend: Create updates-button.tsx component
- [ ] Frontend: Add button to home page
- [ ] Frontend: Add button to projects page
- [ ] Frontend: Wire up modal open/close
- [ ] Frontend: Implement action buttons in modal
- [ ] Frontend: Remove old notification badges
- [ ] Frontend: Test all roles (client, professional, admin)
- [ ] Testing: Manual testing of all flows
- [ ] Deploy and monitor

---

## Questions for User

1. ✅ Modal location: Modal or page view? (Currently modal)
2. ✅ Auto-refresh: Should modal auto-refresh every X seconds?
3. ✅ Mark as read: Auto-mark when viewing, or manual button?
4. ✅ Action buttons in modal: Execute directly, or link to detail page?
5. Mobile: Full modal on mobile, or drawer/bottom sheet?
6. Persistence: Remember last closed state?

