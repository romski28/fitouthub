# Option 3 Plan: Dedicated AI Wizard Route

## Goal
Create a first-class route for AI project setup so auth handoff and wizard progression are not coupled to search page state or create-project confirmation state.

## Proposed Route
- Route: `/create-project/wizard`
- Purpose: own the AI brief wizard flow (title, location, emergency, follow-up answers)
- Output: canonical create-project draft written to handoff/session storage, then navigate to `/create-project`

## Why This Is Better Long-Term
- Clear separation of concerns:
  - `search-flow` handles AI prompting only
  - `create-project/wizard` handles guided project framing
  - `create-project` handles final review/submit
- Easier auth resume:
  - guest join/login can always redirect to one stable wizard URL
- Lower regression risk in future changes:
  - no cross-component modal state dependencies

## Data Contract
Use one shared storage payload for wizard handoff:
- key: `createProjectDraft`
- shape:
  - `initialData.projectName`
  - `initialData.notes`
  - `initialData.location`
  - `initialData.projectScale`
  - `initialData.tradesRequired`
  - `initialData.isEmergency`
  - `initialData.aiFrom.assumptions`
  - `aiIntakeId`

Optional secondary payload:
- key: `projectDescription`
- mirrored summary fields for compatibility with existing create-project bootstrap

## Implementation Steps
1. Add new page `apps/web/src/app/create-project/wizard/page.tsx`
- Render `AiProjectBriefModal` as primary UI on page
- On complete, write handoff payloads and route to `/create-project?source=ai-wizard`

2. Add helper utilities
- Shared helper to build draft payload from wizard output
- Reuse existing handoff writer (`writeCreateProjectDraftSafely`) and memory handoff setters

3. Update auth redirects
- For AI guest join/login, set `postLoginRedirect` to `/create-project/wizard?source=ai`
- Remove direct dependency on search page state for wizard launch

4. Update search flow action buttons
- Replace modal-open behavior for anonymous AI users with route push to wizard (or store state + push)

5. Keep backward compatibility
- `create-project` should still accept legacy handoff keys
- If wizard payload missing, fallback to existing create-project behavior

6. Add telemetry (recommended)
- events:
  - `ai_wizard_opened`
  - `ai_wizard_completed`
  - `ai_wizard_abandoned`
  - `ai_wizard_redirect_after_auth`

## QA Matrix
- Guest flow:
  - AI -> Join -> OTP -> Wizard route -> Create project
- Existing user flow:
  - AI -> Login -> Wizard route -> Create project
- Refresh behavior:
  - refresh during wizard keeps state or gracefully restores from storage
- Back button behavior:
  - no loops between auth and wizard
- Non-AI create-project path:
  - unaffected

## Rollout Strategy
- Feature flag suggested: `NEXT_PUBLIC_ENABLE_AI_WIZARD_ROUTE`
- Stage rollout:
  1) internal test only
  2) 10% traffic
  3) 100% and remove old modal launch path

## Risks
- Multiple storage writers can drift if not centralized
- Query-param-only routing without payload persistence can cause empty wizard on refresh
- Existing create-project hydration logic must remain tolerant to partial payloads

## Recommendation
Ship Option 2 now for immediate UX correction, then implement this Option 3 route as a controlled refactor with a feature flag.