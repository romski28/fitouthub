# Site Access & Location Details Implementation Guide

## Overview

This implementation adds a **two-stage location data collection system** with professional consent at each stage:

### Stage 1: Professional Site Access (Quoting Phase)
- Professionals request minimal site details (address, unit, floor, access, contact)
- Client explicitly approves/denies each request
- Data reused for subsequent professionals (no re-entry by client)
- Optional: Professional can schedule site visit

### Stage 2: Full Location Details (Post-Escrow)
- Triggered when escrow is confirmed in Supabase
- Client must provide comprehensive property and site information
- Cannot proceed with project until submitted
- Pre-filled from Stage 1 data if available

---

## Database Migration Steps

### Step 1: Apply SQL Migration to Supabase

1. Go to Supabase Dashboard → Your Project
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy the contents of: `apps/api/prisma/migrations/add_site_access_and_location_details.sql`
5. Execute the query

**Expected output:** All tables created with indexes, no errors

### Step 2: Update Prisma Client

```bash
cd apps/api
npx prisma generate
```

This regenerates the Prisma client with the new models.

### Step 3: Verify Schema Locally (Optional but Recommended)

If you have a local PostgreSQL setup:

```bash
npx prisma db push
```

Otherwise, the SQL migration is sufficient.

---

## Data Model Overview

### SiteAccessRequest
Tracks professional requests for site access and client approvals.

**Statuses:**
- `pending` - Awaiting client response
- `approved_no_visit` - Client approved; no site visit required
- `approved_visit_scheduled` - Client approved + visit scheduled for a date
- `visited` - Professional confirmed site visit
- `denied` - Client denied access
- `cancelled` - Request was cancelled

**Key Fields:**
- `projectId` - Which project
- `projectProfessionalId` - Relationship to the professional's quote
- `status` - Current workflow state
- `visitScheduledFor` - Date if site visit was approved
- `visitedAt` - When professional marked as visited
- `quoteIsRemote` - Flag: Does professional have site access info?

### SiteAccessData
Minimal location info captured when first access request is made by any professional.

**Stored Once Per Project:**
- `addressFull` - Full address string
- `unitNumber` - Apartment/unit number
- `floorLevel` - Floor number
- `accessDetails` - How to access (intercom, gate, etc.)
- `onSiteContactName` - Who to contact at site
- `onSiteContactPhone` - Contact phone

### ProjectLocationDetails
Comprehensive property details captured post-escrow (mandatory for project start).

**Extended Information:**
- Everything from SiteAccessData, plus:
- `propertyType` - Residential/Commercial/Industrial
- `propertySize` - "500 sqm" or similar
- `propertyAge` - When built or age range
- `existingConditions` - Current state description
- `specialRequirements` - Access restrictions, permits needed, etc.
- `photoUrls` - Array of site photos
- `gpsCoordinates` - JSON with lat/lng
- `status` - pending | submitted | reviewed | approved

### Project Updates
New fields track location data collection status:

```
siteAccessDataCollected      BOOLEAN  - Has minimal data been submitted?
siteAccessDataCollectedAt    TIMESTAMP - When?
locationDetailsStatus        STRING   - pending | submitted | approved
locationDetailsRequiredAt    TIMESTAMP - When escrow confirmed
locationDetailsProvidedAt    TIMESTAMP - When client submitted full details
```

### ProjectProfessional Updates
Quote-related updates:

```
visitApprovedButNotDone     BOOLEAN  - Visit was approved but not done
siteVisitedAt               TIMESTAMP - When professional confirmed visit
visitNotes                  TEXT     - Professional's visit notes
```

### PaymentRequest Updates
Transparency flag for quote sourcing:

```
isRemoteQuote               BOOLEAN  - Did professional quote without site access?
```

---

## Backend Implementation (TODO)

### API Endpoints Needed

#### 1. Request Site Access
```
POST /api/projects/{projectId}/site-access/request
Body: { professionalId: string }
Response: SiteAccessRequest object
```

#### 2. Submit Site Access Data
```
POST /api/projects/{projectId}/site-access-data
Body: {
  addressFull: string,
  unitNumber?: string,
  floorLevel?: string,
  accessDetails?: string,
  onSiteContactName?: string,
  onSiteContactPhone?: string
}
Response: SiteAccessData object
```

#### 3. Approve/Deny Site Access
```
PUT /api/site-access-requests/{requestId}/respond
Body: {
  status: 'approved_no_visit' | 'approved_visit_scheduled' | 'denied',
  visitScheduledFor?: DATE,
  reasonDenied?: string
}
Response: Updated SiteAccessRequest
```

#### 4. Confirm Site Visit
```
PUT /api/site-access-requests/{requestId}/confirm-visit
Body: {
  visitNotes?: string
}
Response: Updated SiteAccessRequest
```

#### 5. Submit Full Location Details
```
POST /api/projects/{projectId}/location-details
Body: {
  addressFull: string,
  postalCode?: string,
  gpsCoordinates?: { lat: number, lng: number },
  propertyType?: string,
  propertySize?: string,
  propertyAge?: string,
  accessDetails?: string,
  existingConditions?: string,
  specialRequirements?: string[],
  photoUrls?: string[],
  onSiteContactName?: string,
  onSiteContactPhone?: string,
  accessHoursDescription?: string,
  desiredStartDate?: DATE
}
Response: ProjectLocationDetails object
```

#### 6. Query Site Access Status
```
GET /api/projects/{projectId}/site-access/status?professionalId={id}
Response: {
  has_access: boolean,
  access_type: 'approved_request' | 'awarded_professional' | 'none',
  requires_visit: boolean,
  visited: boolean,
  visit_scheduled_for: DATE | null,
  reason_if_denied: string | null
}
```

---

## Frontend Implementation (TODO)

### Components Needed

#### 1. SiteAccessRequestButton (Quoting Phase)
Shown on professional project card when quoting.

**States:**
- Default: Show "📍 Request Site Access" button
- Pending: "⏳ Awaiting client response..."
- Approved (no visit): Show approved data + Edit option
- Approved (visit scheduled): Show date + "I've visited" button
- Visited: Show visited confirmation + notes field
- Denied: Show denial reason + alternate instructions

#### 2. SiteAccessApprovalModal (Client View)
Modal shown when professional requests access.

**Shows:**
- Professional name/business
- Request timestamp
- Option to approve without visit requirement
- Option to approve with visit scheduling
- Option to deny with reason

#### 3. LocationDetailsForm (Post-Escrow)
Full form shown when escrow confirmed and location details required.

**Pre-fills from:**
- SiteAccessData if available (address, unit, floor, contact)
- Project.notes if available

**Additional fields:**
- Property type (dropdown)
- Property size (text)
- Property age (text)
- Existing conditions (textarea)
- Special requirements (multi-select/free text)
- Photos (upload component)
- GPS coordinates (map picker)

#### 4. RemoteQuoteIndicator (Quote Review)
Shown in quote list/detail views.

**Shows:**
- "Remote Quote" badge if no site access approved
- Professional can still submit valid quotes for simple jobs

---

## Workflow Diagrams

### Stage 1: Professional Site Access

```
Professional
    ↓
[Request Site Access Button]
    ↓
Creates SiteAccessRequest (status: pending)
    ↓
✉️ Client Notification (Medium-High Urgency)
    ↓
Client Response Options:
    ├─→ Deny
    │   ├─→ SiteAccessRequest.status = denied
    │   └─→ Professional can still quote (remote)
    │
    ├─→ Approve (No Visit)
    │   ├─→ SiteAccessRequest.status = approved_no_visit
    │   ├─→ Submit SiteAccessData (minimal)
    │   └─→ Professional can quote (informed)
    │
    └─→ Approve + Schedule Visit
        ├─→ SiteAccessRequest.status = approved_visit_scheduled
        ├─→ SiteAccessRequest.visitScheduledFor = date
        ├─→ Submit SiteAccessData (minimal)
        └─→ Professional can:
            ├─→ Visit site → confirm with "✓ I've visited"
            └─→ Quote without visit (remote quote warning)
```

### Stage 2: Full Location Details (Post-Escrow)

```
Escrow Confirmed
    ↓
Project.escrowHeld >= Project.escrowRequired
    ↓
Set Project.locationDetailsRequiredAt = now()
    ↓
✉️ Client Notification (High Urgency, 14-day expiry)
    ↓
[Complete Location Details Button/Modal]
    ↓
Client Submits ProjectLocationDetails
    ↓
Set Project.locationDetailsProvidedAt = now()
Set Project.locationDetailsStatus = 'submitted'
    ↓
✉️ Admin/FOH Review Notification
    ↓
Admin Reviews:
    ├─→ Approve
    │   ├─→ ProjectLocationDetails.status = approved
    │   └─→ Allow project to progress
    │
    └─→ Request Changes
        └─→ ProjectLocationDetails.status = pending
            (Client can re-submit)
```

---

## Querying Examples

### Find All Site Access Requests Pending Client Response

```sql
SELECT 
  sar.id,
  p."projectName",
  prof."businessName",
  sar."requestedAt"
FROM "SiteAccessRequest" sar
JOIN "Project" p ON p.id = sar."projectId"
JOIN "ProjectProfessional" pp ON pp.id = sar."projectProfessionalId"
JOIN "Professional" prof ON prof.id = pp."professionalId"
WHERE sar.status = 'pending'
ORDER BY sar."requestedAt" DESC;
```

### Find Projects Ready for Location Detail Collection

```sql
SELECT 
  p.id,
  p."projectName",
  p."escrowHeld",
  p."escrowRequired",
  CASE 
    WHEN pld.id IS NULL THEN 'pending'
    ELSE pld.status
  END as location_status
FROM "Project" p
LEFT JOIN "ProjectLocationDetails" pld ON pld."projectId" = p.id
WHERE p."escrowHeld" >= p."escrowRequired"
  AND p."locationDetailsStatus" = 'pending'
ORDER BY p."escrowHeldUpdatedAt";
```

### Check if Professional Can Access Site Data

```sql
SELECT
  pp.id as project_professional_id,
  p."projectName",
  prof."businessName",
  CASE 
    WHEN sar.status IN ('approved_no_visit', 'approved_visit_scheduled', 'visited')
      THEN 'has_access'
    WHEN p."awardedProjectProfessionalId" = pp.id
      THEN 'awarded_professional'
    ELSE 'no_access'
  END as access_level,
  sar.status as access_request_status,
  sar."visitedAt" IS NOT NULL as professionally_visited
FROM "ProjectProfessional" pp
JOIN "Project" p ON p.id = pp."projectId"
JOIN "Professional" prof ON prof.id = pp."professionalId"
LEFT JOIN "SiteAccessRequest" sar ON sar."projectProfessionalId" = pp.id
WHERE p.id = '{{projectId}}'
  AND pp."professionalId" = '{{professionalId}}';
```

### Find Remote Quotes (No Site Access)

```sql
SELECT
  pp.id,
  p."projectName",
  prof."businessName",
  pp."quoteAmount",
  pr."isRemoteQuote",
  sar.status as access_status,
  CASE 
    WHEN sar."visitedAt" IS NOT NULL THEN 'visited'
    WHEN sar.status = 'approved_visit_scheduled' THEN 'visit_scheduled_not_done'
    ELSE 'no_visit_approved'
  END as visit_status
FROM "ProjectProfessional" pp
JOIN "Project" p ON p.id = pp."projectId"
JOIN "Professional" prof ON prof.id = pp."professionalId"
JOIN "PaymentRequest" pr ON pr."projectProfessionalId" = pp.id
LEFT JOIN "SiteAccessRequest" sar ON sar."projectProfessionalId" = pp.id
WHERE pr."isRemoteQuote" = true
  AND pp."quotedAt" IS NOT NULL;
```

---

## Testing Checklist

- [ ] SQL migration executes without errors
- [ ] Prisma client generates successfully
- [ ] Can create SiteAccessRequest
- [ ] Can create/update SiteAccessData
- [ ] Can create/update ProjectLocationDetails
- [ ] Access control works (only approved professionals see data)
- [ ] Visit tracking works (timestamp updates correctly)
- [ ] Remote quote flag persists on PaymentRequest
- [ ] Queries return expected results
- [ ] Relationships resolve correctly in Prisma

---

## Next Steps

1. **Apply migration** to Supabase (follow Step 1 above)
2. **Update Prisma client** in your API
3. **Implement backend API endpoints** (rough estimates: 4-6 hours)
4. **Build frontend components** (rough estimates: 8-12 hours)
5. **Integration testing** (rough estimates: 4-6 hours)
6. **Deploy and monitor**

---

## Questions?

Refer to the models, API endpoint specs, and migration SQL in this guide.
