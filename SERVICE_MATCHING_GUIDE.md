# Intent Matching & Service Routing Guide

## Overview

The Fitout Hub uses intelligent intent matching to understand what users are looking for and route them to the right page. The system supports three types of matching:

1. **Service-to-Profession Matching** (Primary) - Maps specific services/problems to professions
2. **Profession Keyword Matching** (Secondary) - Matches profession names directly
3. **Location Extraction** (Optional) - Identifies service areas

---

## How It Works

### User Query Flow

```
User Input: "I have a leaking pipe"
    ↓
Intent Matcher checks:
    1. Is it a JOIN intent? → No
    2. Is it a PROJECT MANAGEMENT intent? → No
    3. Is it a FIND PROFESSIONAL intent? → Yes
       ↓
       Service Matcher: "leaking pipe" → "plumber" ✓
    4. Extract location? → Not found
    ↓
Result: Route to /professionals with profession="plumber" at 95% confidence
```

---

## Architecture

### 1. Service Matcher (`service-matcher.ts`)

Maps specific services/problems to professions.

**File Structure:**
```
SERVICE_TO_PROFESSION = {
  "service keyword": "profession_type",
  "another service": "profession_type",
}
```

**Example Mappings:**
```typescript
// Plumbing
'leaky pipe': 'plumber',
'blocked drain': 'plumber',
'toilet repair': 'plumber',

// Electrical
'electrical work': 'electrician',
'wiring': 'electrician',
'power outage': 'electrician',

// Painting
'paint wall': 'painter',
'interior paint': 'painter',
```

**Key Functions:**

```typescript
// Match a service description to a profession
matchServiceToProfession("I have a leaking pipe") 
→ "plumber"

// Get all services for a profession
getServicesForProfession("plumber")
→ ["leaky pipe", "leaking pipe", "burst pipe", ...]

// Get all professions
getAllProfessions()
→ ["plumber", "electrician", "painter", ...]
```

---

### 2. Intent Matcher (`intent-matcher.ts`)

Determines user action and routes them appropriately.

**Intent Types:**

| Intent | Trigger Keywords | Route | Example |
|--------|-----------------|-------|---------|
| `join` | register, join, post services | `/join` | "I want to join" |
| `manage-projects` | manage, track, my projects | `/projects` | "View my projects" |
| `find-professional` | need, find, fix, repair, hire | `/professionals` | "I need a plumber" |
| `unknown` | No match | `/` | Random text |

**Priority Order:**
1. Check JOIN intent first (highest priority)
2. Check PROJECT MANAGEMENT intent
3. Check FIND PROFESSIONAL intent (uses Service Matcher)
4. Fallback to unknown

---

## Adding New Services

### Step 1: Open `service-matcher.ts`

Navigate to the `SERVICE_TO_PROFESSION` map.

### Step 2: Add Your Service Keywords

```typescript
export const SERVICE_TO_PROFESSION: Record<string, string> = {
  // ... existing services ...

  // NEW: Roofing services
  'roof repair': 'roofer',
  'roof leak': 'roofer',
  'roof replacement': 'roofer',
  'shingle': 'roofer',
  'guttering': 'roofer',

  // NEW: Landscaping
  'garden design': 'landscaper',
  'patio': 'landscaper',
  'hedge trim': 'landscaper',
};
```

### Step 3: Commit & Test

```bash
git add .
git commit -m "Add roofing and landscaping services"
git push
```

Test on the live site:
- "I have a roof leak" → Should suggest "roofer"
- "Design my garden" → Should suggest "landscaper"

---

## Adding New Professions

### Step 1: Update Profession List

In `intent-matcher.ts`, add to `PROFESSIONS`:

```typescript
const PROFESSIONS = [
  // ... existing ...
  'roofer',
  'landscaper',
  'surveyor',
  'insurance inspector',
];
```

### Step 2: Add Services for That Profession

In `service-matcher.ts`:

```typescript
SERVICE_TO_PROFESSION: {
  // New profession services
  'roof repair': 'roofer',
  'roof inspection': 'surveyor',
  'garden design': 'landscaper',
}
```

### Step 3: Update Search Suggestions (Optional)

In `search-box.tsx`, add to `SUGGESTIONS`:

```typescript
const SUGGESTIONS = [
  'Find a plumber',
  'Find an electrician',
  'Find a roofer',        // NEW
  'Design my garden',     // NEW
  'Join as professional',
];
```

---

## Confidence Scoring

The matcher returns a confidence level (0-1):

| Confidence | Meaning | Example |
|-----------|---------|---------|
| 0.95+ | Very confident | Service keyword matched exactly |
| 0.9 | Confident | Profession name matched, location found |
| 0.8 | Moderate | Profession found, no location |
| 0.5 | Low | Generic find/search without profession |
| 0 | No match | Unknown query |

**Use Case:** Modal shows "Is this what you meant?" for confidence < 0.9.

---

## Examples

### Example 1: Service-Based Query
```
Input: "I need to fix a leaking pipe in Kowloon"

Service Match: "leaking pipe" → "plumber" ✓
Profession: plumber
Location: Kowloon
Confidence: 0.95 (matched service + location)
Display: "Find plumbers in Kowloon"
Route: /professionals
```

### Example 2: Profession-Based Query
```
Input: "Find me an electrician"

Service Match: No service keywords found
Profession Match: "electrician" ✓
Confidence: 0.9
Display: "Find electricians"
Route: /professionals
```

### Example 3: Low Confidence Query
```
Input: "I need help"

Service Match: No specific service
Profession Match: No profession keyword
Confidence: 0.5 (generic "need")
Display: "Find professionals"
Route: /professionals (fallback)
```

---

## Best Practices

1. **Keep service keywords concise** - One or two words when possible
2. **Use lowercase** - All lookups are case-insensitive, but store as lowercase
3. **Cover common variations** - Include plural and singular forms
4. **Test your additions** - Try the query in the search box
5. **Document ambiguous services** - If a service could match multiple professions, add comments

---

## Testing Checklist

When adding new services/professions:

- [ ] Service keyword is in `SERVICE_TO_PROFESSION` map
- [ ] Profession exists in `PROFESSIONS` array
- [ ] Search for the service in the live search box
- [ ] Confirm correct profession is suggested
- [ ] Verify modal displays correct text
- [ ] Check navigation to `/professionals` works
- [ ] Commit to git with descriptive message

---

## Questions?

Refer to:
- `apps/web/src/lib/service-matcher.ts` - Service mappings
- `apps/web/src/lib/intent-matcher.ts` - Intent logic
- `apps/web/src/components/search-box.tsx` - UI suggestions
