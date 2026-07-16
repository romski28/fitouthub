# Project Creation Flow — July 2026 Refactor

## Overview

Simplified the project creation wizard from a 7-step flow with a separate review page into a **2–3 step adaptive wizard** that creates projects directly, bypassing the `/create-project` review page entirely.

---

## Flow Diagram

```
┌──────────────┐
│  Home Page   │  AI Chat (search-flow.tsx)
│  AI Search   │  → generates title, summary, trades, safety
└──────┬───────┘
       │ "Create project" → sessionStorage + handoff
       ▼
┌──────────────────────────────────────────────┐
│  Wizard: /create-project/wizard              │
│                                              │
│  Step 1: followups (AI chat)                │
│    └─ Paperclip + textarea + coral mic      │
│    └─ Safety notes accumulate each turn      │
│    └─ Risk level tracks highest severity     │
│                                              │
│  ┌─ Has images? ──────────────────────────┐ │
│  │ YES (2 steps)         NO (3 steps)      │ │
│  │ followups             followups          │ │
│  │   ↓                     ↓               │ │
│  │ projectDetails        images             │ │
│  │                         ↓               │ │
│  │   ┌── pricing panel ──┐ projectDetails  │ │
│  │   │ [Get prices     ] │   ┌── pricing ─┐ │ │
│  │   │  from everyone  ] │   │ [Get prices│ │ │
│  │   │ [I'll choose    ] │   │  from all ]│ │ │
│  │   │ [who sends      ] │   │ [I'll      │ │ │
│  │   └──────────────────┘   │  choose]   │ │ │
│  │                          └────────────┘ │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  Pricing disabled until location selected     │
│  Date is optional                             │
└──────────────────────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│ Get prices from  │    │ I'll choose who      │
│ everyone         │    │ sends prices         │
│                  │    │                      │
│ → /create-project│    │ → /professionals     │
│   /submitting    │    │   ?source=create-    │
│                  │    │    project            │
└────────┬─────────┘    └──────────┬───────────┘
         │                         │
         │              ┌──────────┴───────────┐
         │              │ Professional cards   │
         │              │ with checkboxes      │
         │              │ [Get prices from     │
         │              │  selected]           │
         │              └──────────┬───────────┘
         │                         │
         └──────────┬──────────────┘
                    ▼
┌──────────────────────────────────┐
│  /create-project/submitting      │
│                                  │
│  ┌─ Safety Modal ──────────────┐ │
│  │ ⟳ Spinner                   │ │
│  │ "Requesting quotes..."       │ │
│  │                              │ │
│  │ 🛡️ Safety notes (3 shown)   │ │
│  │ ⚠️ Risk notes (3 shown)     │ │
│  │    (fade gradient)           │ │
│  │                              │ │
│  │ [Read more] → expands full   │ │
│  │    list, spinner hides       │ │
│  │    [OK, take me to my        │ │
│  │     project]                 │ │
│  │                              │ │
│  │ (auto-redirect 10s if no     │ │
│  │  click)                      │ │
│  └──────────────────────────────┘ │
│                                  │
│  API: upload → create project    │
│  → open-tender (if no selected   │
│  pros)                           │
│                                  │
│  Selected pros path:             │
│  - professionalIds in payload    │
│  - onlySelectedProsCanBid=true   │
│  - no open-tender call           │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────┐
│  /projects/:id   │
│  (Project Page)  │
└──────────────────┘
```

---

## Key Files Changed

| File | Purpose |
|---|---|
| `apps/web/src/app/create-project/wizard/page.tsx` | Adaptive 2–3 step wizard, pricing panel, file upload |
| `apps/web/src/app/create-project/submitting/page.tsx` | Intermediate API + safety modal page |
| `apps/web/src/app/create-project/page.tsx` | Safety modal with truncation + auto-redirect |
| `apps/web/src/components/search-flow.tsx` | Hidden image upload (`false &&` guards) |
| `apps/web/src/components/search-box.tsx` | Coral voice button (#FF7F50) |
| `apps/web/src/components/professionals-list.tsx` | "Get prices from selected", safety handoff, 5 badge limit |
| `apps/api/src/ai/ai.service.ts` | `logConversationTurn()` — per-turn logging |
| `apps/api/src/ai/ai.controller.ts` | Admin endpoints for conversation logs |
| `apps/api/src/projects/projects.service.ts` | Backfill `projectId` on conversation logs |
| `apps/api/prisma/schema.prisma` | `AiConversationLog` model |
| `MANUAL_SQL_ADD_AI_CONVERSATION_LOG.sql` | DB table + indexes |

---

## Adaptive Wizard Logic

```ts
const hasImagesFromChat = chatAttachedFiles.length > 0 || projectFiles.length > 0;

const steps = useMemo(() => {
  if (summaryConfirmationShown && hasImagesFromChat) {
    return [{ kind: 'followups' }, { kind: 'projectDetails' }];   // 2 steps
  }
  if (summaryConfirmationShown && !hasImagesFromChat) {
    return [{ kind: 'followups' }, { kind: 'images' }, { kind: 'projectDetails' }]; // 3 steps
  }
  return [{ kind: 'followups' }, { kind: 'projectDetails' }, { kind: 'images' }]; // default
}, [summaryConfirmationShown, hasImagesFromChat]);
```

- Images step shows "Next" when not final, "Submit project" when final
- Both buttons trigger no-files warning if nothing attached
- Progress bar auto-adapts to `steps.length`

---

## Safety Data Pipeline

```
Wizard AI turn → extract safetyAssessment
  → accumulate (Set dedup) into aiSafetyNotes / aiRiskNotes
  → riskLevel tracks highest severity (critical > high > medium > low)
  → handoff (module-level) + sessionStorage
  → submitting page reads + displays modal
```

- Modal truncates to first 3 of each, fade gradient for overflow
- "Read more" expands full list, cancels auto-redirect
- "OK" disabled until API completes
- 10s auto-redirect if no interaction
- No delay when no safety data

---

## AI Conversation Logging

Every wizard turn is logged to `ai_conversation_logs`:
- `sessionId` groups turns
- `prompt` (user input) + `userResponse` (AI reply)
- `structuredJson` (full AI output)
- `safetyJson` (safety assessment)
- Backfilled with `projectId` when project is created

Admin: `/admin/analytics/conversation-logs`

---

## Pricing Panel

In wizard's final step (projectDetails):
- **Get prices from everyone** → `/create-project/submitting` (open tender)
- **I'll choose who sends prices** → `/professionals?source=create-project`
- Both disabled until location selected (`!location.primary && !location.secondary`)
- Amber hint: "Select a location above to continue."

---

## Submitting Page Logic

```ts
const hasSelectedPros = selectedProfessionals.length > 0;

payload = {
  ...projectData,
  onlySelectedProfessionalsCanBid: hasSelectedPros,
  ...(hasSelectedPros ? {
    professionalIds: selectedPros.map(p => p.id),
    professionalTradeScopes: ...
  } : {})
};

// Open tender only if no specific professionals were selected
if (!hasSelectedPros) {
  await fetch(`/projects/${id}/open-tender`, ...);
}
```

---

## Data Handoff Chain

| Step | Storage |
|---|---|
| Wizard → submitAndOpenTender / submitAndChoosePros | `writeCreateProjectDraftSafely()` + `setCreateProjectDraftHandoff()` |
| Professionals list → handleInviteSelected | `getCreateProjectDraftHandoff()` + sessionStorage |
| Submitting page | `getCreateProjectDraftHandoff()` + sessionStorage |

Safety fields (`safetyNotes`, `riskNotes`, `riskLevel`) carried through all steps.

---

## UI Consistency

- Voice button: coral (#FF7F50) on both home page and wizard chat
- Image upload: hidden on home page (`false &&` guards, code preserved)
- Trade badges: show first 5, "Show more" for overflow
- File type: any (*/*), deferred upload (File[] → upload on submit)
- Thumbnails: URL.createObjectURL for images, extension badges for non-images

---

## Commits Range

July 15–16, 2026 — ~15 commits covering:

- Wizard simplification (7→3 steps)
- Adaptive step count based on images
- Safety data accumulation + modal
- AI conversation logging (DB + API + admin)
- Direct submit from wizard (short-circuit)
- Selected pros path via intermediate page
- Coral voice button + hidden image upload
- Build fixes, type fixes
