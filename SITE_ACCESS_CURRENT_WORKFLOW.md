# Current Site Access Workflow Documentation

**Last Updated:** March 1, 2026  
**Status:** Implementation in progress - workflow review needed

---

## Overview

The site access workflow manages how clients approve/deny site access requests from professionals and how location data is collected in two stages:
- **Stage 1 (Bidding):** Minimal location data during quoting phase
- **Stage 2 (Award):** Full location details post-escrow/award

---

## BIDDING STAGE WORKFLOW

### Actor: Professional (Tradesman/Contractor)

#### Action 1: Request Site Access
**Where:** Professional project detail page → Site Access Status accordion  
**Trigger:** Professional clicks "Request Site Access" button  
**Conditions:**
- Professional has been invited to project (status: pending, accepted, quoted, or awarded)
- No existing pending or approved request for this professional
- Professional hasn't had access denied

**What Happens:**
1. Frontend calls `POST /projects/{projectId}/site-access/request`
2. Backend creates `SiteAccessRequest` record:
   - `status = 'pending'`
   - `requestedAt = now()`
   - Links professional to project via `projectProfessionalId`
3. Client receives notification
4. Professional sees: "⏳ Awaiting client approval. You can submit a quote without site access."

**Note:** Professionals CAN submit quotes without site access approval. Those quotes are marked as "remote."

---

### Actor: Client

#### Action 1: Review Site Access Request(s)
**Where:** Client project detail page → Site Access tab → "Site Access Requests" accordion  
**What They See:**
- Card per professional requesting access
- Professional name
- Request date
- Current status badge (pending, approved, denied)
- Status-specific UI:
  - **If Pending:** Form for approving/denying + location fields

**Flow for Pending Request:**

#### Action 2a: Decision - DENY
**Form Shows:**
1. **Deny Decision** (dropdown; select "Deny")
2. **Reason for Denial** (optional textarea)
3. **Submit** button

**When Submitted:**
- API: `PUT /projects/{projectId}/site-access-requests/{requestId}/respond`
- Backend updates `SiteAccessRequest`:
  - `status = 'denied'`
  - `reasonDenied = [client input]`
  - `respondedAt = now()`
  - `clientApprovedBy = [client userId]`
- Professional sees: "❌ Site access denied: [reason]"
- Professional CAN still submit quotes (marked as remote)

---

#### Action 2b: Decision - APPROVE (No Visit Required)
**Form Shows:**
1. **Decision Dropdown:** Select "Approve (no site visit)" → NOT shown in current UI?
   - ⚠️ **ISSUE:** The "no visit" option exists in backend but unclear if properly displayed in client UI
2. **Basic Location Information Section:**
   - Full Address * (required)
   - Unit Number (optional)
   - Floor Level (optional)
   - Postal Code / District (optional)
3. **Submit** button

**Stage Badge:** "Required now" (emerald - bidding stage requirement)

**When Submitted:**
- API: `PUT /projects/{projectId}/site-access-requests/{requestId}/respond`
  - Body includes: `status = 'approved_no_visit'`, location fields
- Backend:
  1. Creates/updates `SiteAccessData` (stored once per project, reused for all professionals)
  2. Updates `SiteAccessRequest`:
     - `status = 'approved_no_visit'`
     - `respondedAt = now()`
  3. Creates chat message: "Client approved site access (no visit required)."
- Professional sees: "✓ Site access approved (no visit required)"
- Professional sees location data: Address, unit/floor, access details, contact info

---

#### Action 2c: Decision - APPROVE (With Site Visit)
**Form Shows:**
1. **Decision Dropdown:** Select "Approve (with site visit)"
2. **Visit Date** input (required)
3. **Visit Time** input (required)
4. **Basic Location Information Section:**
   - Full Address * (required)
   - Unit Number (optional)
   - Floor Level (optional)
   - Postal Code / District (optional)
5. **Submit** button

**Stage Badge:** "Required now" (emerald - bidding stage requirement)

**When Submitted:**
- API: `PUT /projects/{projectId}/site-access-requests/{requestId}/respond`
  - Body: `status = 'approved_visit_scheduled'`, visitScheduledFor, visitScheduledAt, location fields
- Backend:
  1. **Timezone Conversion:** Converts local time to UTC using project timezone (default: "Asia/Hong_Kong")
     - Takes date + time → converts as local HK time → stores as UTC
     - Example: 1pm → 05:00 UTC
  2. Creates/updates `SiteAccessData`
  3. Updates `SiteAccessRequest`:
     - `status = 'approved_visit_scheduled'`
     - `visitScheduledFor = [ISO date]`
     - `visitScheduledAt = [ISO UTC datetime]`
     - `respondedAt = now()`
  4. Creates `SiteAccessVisit` record:
     - `status = 'proposed'`
     - `proposedByRole = 'client'`
     - `proposedAt = visitScheduledAt`
5. Creates chat message: "Client approved site access with proposed visit on [date time]"
- Professional sees: "✓ Visit approved for [date time]"

---

### Blocker Validation (Bidding Stage)

**Before submitting, client must have:**
- "Required now" fields completed:
  - Full Address
  - Unit Number
  - Floor Level
- Decision selected

**If missing, form shows:**
- "Blocker panel" listing missing fields
- Toast error: "Bidding stage requires basic location details: [field names]"

---

### After Bidding Approval: Professional Response

#### If "No Visit" Approved:
Professional sees in Site Access accordion:
```
Status: approved_no_visit
[Location data box showing address, unit/floor, access, contact]
```
Professional can now submit quote(s).

---

#### If "Visit Scheduled" Approved:
Professional sees:
1. **Site Access Status:** "Visit approved for [date time]"
2. **Site Visits section** appears
3. Professional can:
   - Accept the proposed visit (button on card)
   - Decline the proposed visit (button on card)
   - After accepting: See notes field to add visit notes
   - Still submit quotes without completing visit (remote quote warning)

**Professional's Visit Acceptance Flow:**
- Click "Accept" on visit card
- Backend: `PUT /projects/{projectId}/site-access-visits/{visitId}/respond`
  - Updates `SiteAccessVisit.status = 'accepted'`
  - Updates `ProjectProfessional.visitApprovedButNotDone = true`
  - Client sees: "✓ Professional accepted visit"

---

## AWARD STAGE WORKFLOW

### Trigger for Award Stage Transition
When project is **awarded** to a professional:
- `Project.status = 'awarded'`  
- AND/OR `ProjectProfessional.status = 'awarded'`
- UI stage detection: `projectIsAwarded` boolean passed to Site Access tab

---

### What Changes in Award Stage for Pending Requests

**IMPORTANT: If a site access request was never responded to during bidding:**

When project is awarded, that same pending request appears in Site Access tab with:

#### Stage Indicator Changes:
- **"Required now" badges change to ROSE (Required at award)**
- Banner changes: "Awarded stage: all four sections are required before submission"

#### Additional Required Sections Now Appear:
1. **Property Details Section:**
   - Property Type (dropdown: residential, commercial, industrial, retail, office, other) → now REQUIRED
   - Property Size (sq ft) → now REQUIRED
   - Property Age (years) → now REQUIRED
   - Existing Conditions (textarea) → now REQUIRED

2. **Access and Control Section:**
   - Access Details (textarea) → now REQUIRED
   - Access Hours (text field) → now REQUIRED
   - On-site Contact Name → now REQUIRED
   - On-site Contact Phone → now REQUIRED
   - Desired Start Date (date field) → now REQUIRED
   - (Additional fields for photos, GPS, special requirements)

#### All Required Fields at Award:
From bidding stage:
- Full Address
- Unit Number
- Floor Level
- Postal Code / District (moved from optional to required)

NEW at award stage:
- Property Type
- Property Size
- Property Age
- Existing Conditions
- Access Details
- Access Hours
- On-site Contact Name
- On-site Contact Phone
- Desired Start Date

#### Blocker Validation (Award Stage)
If any required field missing:
- Blocker panel lists ALL missing fields
- Toast error: "Awarded stage requires full form completion: [field names]"
- Submit blocked until all completed

---

### Scenario: Professional Has No Site Access Yet (At Award)

If professional's site access request is still `pending` when project is awarded:

**Client Options:**
1. Deny (not recommended at this stage - better to approve with conditions)
2. Approve without visit + provide full location details
3. Approve with visit + provide full location details

**Location Details Required:** All bidding + award fields  
**Result:** Comprehensive location & property data captured before professional proceeds

---

### Scenario: Professional Had Access Approved During Bidding (Award Stage)

If request status is already `approved_no_visit` or `approved_visit_scheduled`:

**What's Displayed:**
- "Decision: approved_no_visit" or similar
- Responded date shown
- Location data displayed
- Edit button/re-submit option? ⚠️ **NEED TO VERIFY**

**Question:** Can client modify their bidding-stage approval after award? Currently unclear.

---

## SITE VISIT WORKFLOW (Overlaps Bidding & Award)

### Prerequisites
Professional or client must have triggered site visit creation:

**Client-Initiated:**
- During approval with visit scheduled
- Creates `SiteAccessVisit` with `proposedByRole = 'client'`

**Professional-Initiated:**
- Professional requests visit date/time
- Must have site access already approved
- Creates `SiteAccessVisit` with `proposedByRole = 'professional'`

### Visit Status States
```
proposed → [professional accepts/declines] → accepted/declined
accepted → [professional marks complete] → completed
declined → [end]
```

### Professional's Visit Request Flow

**Where:** Professional project detail → Site Access tab → Site Visits section  
**Shows:** (Only visible if `siteAccessStatus.hasAccess = true`)

**Form:**
- Date input (required)
- Time input (required)
- Notes (optional): "Access details, parking, timing, etc."
- Request button

**When Submitted:**
- API: `POST /projects/{projectId}/site-visits`
  - Body: `{ scheduledAt: [ISO datetime], notes?: string }`
- Backend:
  1. Validates professional has site access (approved_no_visit or approved_visit_scheduled or visited)
  2. Creates `SiteAccessVisit`:
     - `status = 'proposed'`
     - `proposedByRole = 'professional'`
     - `proposedAt = [UTC datetime from input]`
     - `notes = [professional notes]`
  3. Chat message: "Professional proposed site visit for [date time]"

### Client's Visit Response Flow

**Where:** Client project detail → Site Access tab → Site Visit Proposals section  
**Shows:** Card per proposed visit

**Card Shows:**
- Professional name
- Proposed date/time
- Notes from proposer
- Status badge
- Action buttons (if pending)

**If Professional-Proposed & Pending:**
Client can:
- Accept (button)
- Decline (button)
- Add response notes (textarea)

**When Client Clicks Accept/Decline:**
- API: `PUT /projects/{projectId}/site-access-visits/{visitId}/respond`
  - Body: `{ status: 'accepted' | 'declined', responseNotes?: string }`
- Backend:
  1. Updates `SiteAccessVisit.status`
  2. Updates `SiteAccessVisit.respondedAt = now()`
  3. Updates `SiteAccessVisit.responseNotes`
  4. If accepted: `ProjectProfessional.visitApprovedButNotDone = true`
  5. Chat message: "[Professional name] marked visit as [accepted/declined]"

### Professional Completes Visit

**Where:** Professional project detail → Site Access tab → Site Visits section  
**Shows (if visit accepted):** "Complete Site Visit" section

**Form:**
- Notes textarea (optional): "Add any notes from the site visit"
- "Complete Visit" button

**When Submitted:**
- API: `PUT /projects/{projectId}/site-access-visits/{visitId}/complete`
  - Body: `{ visitDetails?: string }`
- Backend:
  1. Updates `SiteAccessVisit.status = 'completed'`
  2. Updates `SiteAccessVisit.completedAt = now()`
  3. Updates `ProjectProfessional.visitApprovedButNotDone = false`
  4. Chat message: "Professional confirmed site visit"

---

## DATA MODEL

### SiteAccessRequest
```
id                  UUID
projectId           UUID (FK → Project)
projectProfessionalId UUID (FK → ProjectProfessional)
professionalId      UUID (FK → Professional)
status              ENUM: pending | approved_no_visit | approved_visit_scheduled | visited | denied | cancelled
requestedAt         TIMESTAMP
respondedAt         TIMESTAMP (nullable)
visitScheduledFor   DATE (nullable) - stored in UTC but represents a date
visitScheduledAt    DATETIME (nullable) - UTC time when professional should visit
visitedAt           DATETIME (nullable)
reasonDenied        TEXT
clientApprovedBy    TEXT (FK → User)
quoteCreatedAfterAccess BOOLEAN
quoteIsRemote       BOOLEAN
```

### SiteAccessData
```
id                  UUID
projectId           UUID (unique - one per project)
addressFull         TEXT
unitNumber          TEXT
floorLevel          TEXT
accessDetails       TEXT
onSiteContactName   TEXT
onSiteContactPhone  TEXT
submittedAt         TIMESTAMP
submittedBy         UUID (FK → User)
lastUpdatedAt       TIMESTAMP
lastUpdatedBy       UUID (FK → User)
```

### ProjectLocationDetails
```
id                  UUID
projectId           UUID (unique)
timezone            STRING (default: "Asia/Hong_Kong")
addressFull         TEXT
postalCode          TEXT
gpsCoordinates      JSON
unitNumber          TEXT
floorLevel          TEXT
propertyType        TEXT
propertySize        TEXT
propertyAge         TEXT
accessDetails       TEXT
existingConditions  TEXT
specialRequirements JSON
onSiteContactName   TEXT
onSiteContactPhone  TEXT
accessHoursDescription TEXT
desiredStartDate    DATE
photoUrls           TEXT[]
status              ENUM: pending | submitted | reviewed | approved
submittedAt         TIMESTAMP
submittedBy         UUID
reviewedAt          TIMESTAMP
reviewedBy          UUID
```

### SiteAccessVisit
```
id                  UUID
projectId           UUID
projectProfessionalId UUID
professionalId      UUID
status              ENUM: proposed | accepted | declined | cancelled | completed
proposedAt          TIMESTAMP
proposedByRole      "professional" | "client"
notes               TEXT
respondedAt         TIMESTAMP
respondedBy         UUID
responseNotes       TEXT
completedAt         TIMESTAMP
```

---

## TIMEZONE HANDLING

**As of March 1, 2026 (Recent Implementation):**

- `ProjectLocationDetails.timezone` field added (default: "Asia/Hong_Kong")
- When client submits visit date + time:
  1. Input treated as local time in project's timezone
  2. `convertLocalToUTC()` function converts to UTC
  3. Shows as: date input "2024-03-01" + time input "13:00"
  4. Stored in DB as UTC: "2024-03-01T05:00:00Z" (1pm HK = 5am UTC)
- When displayed to users: Shown in browser's local time via `toLocaleString()`

**Future Enhancement:** Support country selector to set different timezones per project.

---

## KNOWN ISSUES / AREAS FOR REVIEW

### 1. **Unclear: "Approve (No Visit)" Option**
- Backend supports `status = 'approved_no_visit'`
- Form shows dropdown with three options:
  - "Approve (no site visit)"
  - "Approve (with site visit)"
  - "Deny"
- ⚠️ Is the "no visit" option distinguishable from just submitting without visit scheduled date?
- **Action Needed:** Clarify whether this is intentional or should be simplified

### 2. **Award Stage + Pending Request**
- If request still pending at award time, all sections become required
- ⚠️ UX Question: Should pending requests be auto-promoted/expired?
- Current behavior: Client must manually re-approve with full details
- **Action Needed:** Confirm desired flow

### 3. **Edit After Approval**
- ⚠️ Once request is responded to (approved/denied), can client modify?
- Current UI doesn't show edit button on approved requests
- **Action Needed:** Decide if modifications allowed post-approval

### 4. **Visit Scheduling + Visit Proposals**
- Client can approve visit in `SiteAccessRequest` (creates visit automatically)
- Professional can request separate visit independently
- ⚠️ Can lead to multiple visit proposals for same professional-project pair
- **Action Needed:** Clarify if this is intended or should be deduplicated

### 5. **Remote Quotes**
- UI suggests professionals can quote without site access
- ⚠️ Quotes marked as remote but enforcement/warning unclear in quote review flow
- **Action Needed:** Verify remote quote flagging in payment/quote stage

### 6. **Location Details Form at Award**
- Full 4-section form appears when project awarded
- ⚠️ But it's embedded in Site Access Request card
- Question: Should this be separate accordion during award stage?
- **Action Needed:** Confirm if form placement/UX is correct

### 7. **Blocker Panel Display**
- Shows missing field names in error message
- ⚠️ Red list of blockers can be long and overwhelming
- Consider: Inline field highlighting instead of/in addition to list?
- **Action Needed:** Review UX of error presentation

---

## NEXT STEPS FOR DISCUSSION

1. **Bidding Stage - Approve/Deny/Approve-NoVisit Clarity**
   - Should there be 2 or 3 approval paths?
   - What's the UX intent of "no visit" vs visit scheduled?

2. **Award Stage - Data Collection Strategy**
   - Is embedded form in Site Access Request the right UX?
   - Should full location details be separate accordion/modal?
   - When should award stage location form appear? (immediately on award, or when responding to pending request?)

3. **Request State Management**
   - Should pending requests auto-expire or require action?
   - Can clients revise previously approved requests?

4. **Multi-Visit Handling**
   - Document whether multiple visits per professional is intended feature or bug

5. **Remote Quote Policy**
   - How should remote quotes be treated differently?
   - Should they trigger warnings during award or payment stages?

---

## Summary Tables

### Bidding Stage - Client View
| Request Status | Form Sections | Required | Actions |
|---|---|---|---|
| pending | Access Response + Basic Location | Yes | Approve (no visit) / Approve (visit) / Deny |
| approved_no_visit | (View only) | N/A | View data received |
| approved_visit_scheduled | (View only) + Visit card | N/A | View data + visit proposal response |
| denied | (View only) | N/A | Contact professional |

### Award Stage - Client View (if Pending Request Exists)
| Request Status | Form Sections | Required | Actions |
|---|---|---|---|
| pending | All 4 sections (Access + Basic + Property + Access) | YES, all | Same as bidding but MORE fields |
| approved_no_visit | (Modify?) | TBD | TBD |
| approved_visit_scheduled | (Modify?) | TBD | TBD |

### Professional View - Site Access Status Progression
| Status | Professional Can | Payment Submission |
|---|---|---|
| none (no request) | View "no request", click Request button | Can submit remote quote |
| pending | Wait for approval | Can submit remote quote |
| denied | See reason, cannot proceed | Remote quotes allowed (negotiation) |
| approved_no_visit | See location data, quote | Normal quote submission |
| approved_visit_scheduled | See location data, proposed visit date, accept/decline visit | Normal quote if visit not required |
| visited | See completion, quote | Normal, with site access verified |

