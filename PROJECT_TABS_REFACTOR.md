# Client Project Detail Page - Tab Structure Refactor

## Overview
Converting the long scrolling project detail page into a tabbed interface with accordions for better mobile UX.

## Tab Structure

```
┌────────────────────────────────────────────────────────────┐
│ Project: Bathroom Renovation | Status: Awarded            │  ← Fixed header (stays visible)
├─────────────────────────────────────────────────────────────┤
│ 📋 Overview │ 📍 Site Access │ 👥 Professionals │ 💬 Chat │  ← Tab bar
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ [Tab Content - scrolls independently]                       │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

---

## Tab 1: Overview

**Component:** `projects/[id]/tabs/overview-tab.tsx`

### Accordions within this tab:

1. **Project Details** (default: open)
   - Project name, region, description
   - Status badge
   - Created/Updated dates
   - Budget & timeline info

2. **Schedule & Contact** (default: closed)
   - Start/End dates (editable)
   - Contractor contact info (editable)
   - Edit buttons

3. **Progress** (default: closed)
   - ProjectProgressBar component
   - Financial summary card (ProjectFinancialsCard)
   - Escrow/payment status

---

## Tab 2: Site Access

**Component:** `projects/[id]/tabs/site-access-tab.tsx`

### Accordions within this tab:

1. **Site Access Requests** (default: open)
   - List of professionals requesting access
   - Status: Pending, Approved, Denied
   - Approve/Deny buttons
   - Address form (shared across requests)

2. **Site Visit Proposals** (default: open if exists)
   - Professional-proposed visit dates
   - Client accept/decline interface
   - Response notes field
   - Proposed by role indicator

3. **Location Details** (default: closed)
   - Address, postal code, unit, floor
   - Property type, size, age
   - Access details, contact info
   - Submit/Edit button

4. **Site Access Data** (default: closed)
   - Readonly view of submitted data from professionals
   - Last updated info

---

## Tab 3: Professionals

**Component:** `projects/[id]/tabs/professionals-tab.tsx`

### Accordions within this tab:

1. **Bidding Board** (default: open)
   - All professionals with quotes pending
   - Quote amount, date, status badges
   - Refresh/Accept/Reject buttons per professional
   - Auto-collapse when all processed

2. **Awarded Professional** (default: open if project is awarded, else closed)
   - Professional details, contact
   - Quote amount approved
   - Invoice status
   - Pay invoice button (if applicable)
   - Project progress for this professional

3. **Declined Professionals** (default: closed if exists)
   - List of professionals who were rejected
   - Reason if provided
   - Quote amount
   - Readonly view

---

## Tab 4: Chat

**Component:** `projects/[id]/tabs/chat-tab.tsx`

### Accordions within this tab:

1. **Team Chat** (default: open if awarded)
   - Project chat with all awarded professionals
   - Unified message thread
   - ProjectChat component

2. **Fitout Hub Assistance** (default: closed)
   - Private chat with Fitout Hub
   - Request help section
   - AssistMessages display

3. **Individual Professional Chat** (default: closed)
   - Select professional from dropdown
   - Private 1-on-1 chat
   - Message sending with attachments (ChatImageUploader)
   - Phone icon, lock icon indicators

---

## Tab 5: Media

**Component:** `projects/[id]/tabs/media-tab.tsx`

### Content:
- ProjectImagesCard component
- Photo gallery
- Add notes to photos
- Upload new images

---

## Implementation Strategy

### Phase 1: Create Components (this file)
- ✅ `/components/project-tabs.tsx` - Tab navigation + Accordion components
- Status: DONE

### Phase 2: Extract Tab Content (next task)
- Create `/app/projects/[id]/tabs/` directory
- Create tab components for each section, one at a time
- Move existing JSX into respective tabs

### Phase 3: Refactor Main Page
- Replace sections with tab routing
- Remove direct components, use tab imports
- Clean up state (move to tabs if needed)

### Phase 4: Polish
- Add animations/transitions
- Mobile responsiveness tweaks
- Test scroll behavior

---

## State Management

### In Main Page (`page.tsx`):
```typescript
const [activeTab, setActiveTab] = useState('overview');
const [expandedAccordions, setExpandedAccordions] = useState({
  'site-access-requests': true,
  'site-visit-proposals': false,
  'location-details': false,
  'bidding': true,
  'awarded-details': false,
  // ... etc
});

const toggleAccordion = (id: string) => {
  setExpandedAccordions((prev) => ({
    ...prev,
    [id]: !prev[id],
  }));
};
```

### Shared State to Tabs:
- `project` - project details
- `siteAccessRequests` - site access
- `siteVisits` - site visits
- `messages` - messaging
- All handlers (`handleRespondToSiteAccessRequest`, etc.)
- Access token & project ID

---

## Mobile Optimization

### Tab Bar Behavior:
- Horizontal scroll on mobile (not wrap)
- Icons + text labels
- Sticky positioning
- Collapse toggle for extra small screens (optional)

### Accordion Behavior:
- 100% width on mobile
- Padding/margins adjusted
- Touch-friendly buttons (44px min height)
- No nested accordions

---

## Quick Reference: Sections to Migrate

### Currently in main page JSX:
1. ✅ Header/breadcrumb (stays outside tabs)
2. ✅ Project info card (overview-tab)
3. ✅ Project progress bar (overview-tab → Progress accordion)
4. ✅ Project financials card (overview-tab → Progress accordion)
5. → Site access requests (site-access-tab)
6. → Site visit proposals (site-access-tab)
7. → Location details (site-access-tab)
8. → Bidding board (professionals-tab)
9. → Awarded professional section (professionals-tab)
10. → Project chat (chat-tab)
11. → Fitout Hub assistance (chat-tab)
12. → Private professional chat (chat-tab)
13. → Media/images (media-tab)
14. ✅ Modals (stay in main, triggered by tabs)

---

## Example Tab Accordion Usage

```tsx
<AccordionItem
  id="site-access-requests"
  title="Site Access Requests"
  badge={siteAccessRequests.length.toString()}
  isOpen={expandedAccordions['site-access-requests']}
  onToggle={toggleAccordion}
>
  {/* Site access request content here */}
</AccordionItem>
```

---

## Next Steps

1. **Confirm structure** - Do you like this tab/accordion organization?
2. **Start with Tab 1** - Create `overview-tab.tsx` component
3. **Progressively add tabs** - One tab at a time
4. **Refactor main page** - Update to use new tab system
5. **Test and polish** - Responsive design, mobile UX

Would you like to start with creating the Overview tab component first?
