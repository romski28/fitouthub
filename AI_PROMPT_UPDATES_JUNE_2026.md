# AI Prompting — Recent Updates Reference

_Last updated: June 8, 2026_

---

## 1. Fact Tracking (MANDATORY)

**Added:** New section in conversational system prompt, before CRITICAL RULES.

**Purpose:** Prevents the AI from contradicting facts the user has explicitly stated.

```
- Build a mental checklist of EXPLICIT FACTS. These are LOCKED and must never be contradicted.
- Examples: "it is a bath" → fixture is a bath, not a shower. "just the kitchen" → kitchen only.
- When the user corrects you, immediately update facts and acknowledge the correction.
- Before generating ANY response, review: "What has the user explicitly stated?"
- "not X" / "just Y" / "only Z" — EXCLUSIONS. Respect them absolutely.
```

**Location:** `apps/api/src/ai/ai.service.ts` → `buildConversationalPrompt()`

---

## 2. Problem Focus (MANDATORY)

**Added:** New section, right before CRITICAL RULES.

**Purpose:** Prevents the AI from drifting from the core problem into asking about unrelated fixture work.

```
- Identify the CORE PROBLEM and NEVER lose sight of it.
- Fixture is often just the LOCATION, not the scope of work.
- EXAMPLE: "bath drain blocked" → core problem is DRAINAGE. Do NOT ask about bath replacement.
- EXAMPLE: "kitchen tap leaking" → core problem is LEAK. Do NOT ask about sink replacement.
- If the user says "no" to a fixture question, immediately return to core problem.
```

**Location:** `apps/api/src/ai/ai.service.ts` → `buildConversationalPrompt()`

---

## 3. Surface-Area Projects (CRITICAL)

**Added:** New section, before CRITICAL RULES.

**Purpose:** Forces the AI to ask for room size immediately for projects where surface area matters.

```
- Painting, decoration, flooring, tiling, wallpaper, plastering → room size MANDATORY.
- Make it your FIRST question. Do not proceed past turn 2 without a rough estimate.
- Accept rough estimates ("small bedroom", "about 3m x 4m", "~150 sq ft").
```

**Location:** `apps/api/src/ai/ai.service.ts` → `buildConversationalPrompt()`

---

## 4. Requirement Tracking + coveredTopics

**Added:** New section + new JSON field.

**Purpose:** AI tracks confirmed scoping requirements and reports them in JSON. Frontend renders a subtle checklist widget.

**JSON field:** `coveredTopics: ["roomSize", "existingCondition", ...]`

**Valid keys:** `roomSize`, `existingCondition`, `materialPreference`, `fixtureType`, `existingWiring`, `pipeAccess`

**Frontend:** `RequirementChecklist` component in `apps/web/src/components/requirement-checklist.tsx`
**Config:** `apps/web/src/lib/requirement-matrix.ts` — editable category→topic mapping

**Location:**
- Prompt: `apps/api/src/ai/ai.service.ts` → `buildConversationalPrompt()`
- Component: `apps/web/src/components/requirement-checklist.tsx`
- Config: `apps/web/src/lib/requirement-matrix.ts`

---

## 5. Assumptions, Risks, SafetyAssessment in Conversational Mode

**Fixed:** Conversational prompt rule 2 was missing `assumptions`, `risks`, `safetyAssessment` from the required JSON keys. Added all three.

**Also added:** Full `safetyAssessment` and `assumptions`/`risks` schema to the OUTPUT FORMAT JSON template.

**Location:** `apps/api/src/ai/ai.service.ts` → `buildConversationalPrompt()`

---

## 6. Thread Context — Authoritative Corrections

**Fixed:** When the user sends a follow-up, the thread context now explicitly tells the AI that the latest user update OVERRIDES any conflicting prior context.

**Before:**
```
EARLIER_EXTRACTED_CONTEXT: ...
```

**After:**
```
EARLIER_EXTRACTED_CONTEXT (may be outdated — latest user update overrides): ...
LATEST_USER_UPDATE (authoritative — overrides any conflicting prior context): ...
```

And added: `"The LATEST_USER_UPDATE is authoritative — if it contradicts any earlier extracted context, the user's latest words ALWAYS win."`

**Location:** `apps/api/src/ai/ai.service.ts` → `buildUnifiedPromptEnvelope()`

---

## 7. Rules 9-10 — Corrections

**Updated:** Old rules 9-10 replaced with stronger correction-handling rules.

```
9) The user's LATEST message is the source of truth. Exclusions ("not X", "just Y", "only Z") are hard constraints.
10) When the user corrects you, acknowledge the correction in conversationalText ("Got it, just the bath."). Never repeat the incorrect assumption.
11) Ask only ONE best next question each turn. Cap nextQuestions/followUpQuestions to max 1 item.
```

**Location:** `apps/api/src/ai/ai.service.ts` → `buildConversationalPrompt()`

---

## 8. Trade Minimization — Concrete Examples

**Added:** Two new examples to prevent fixture confusion.

```
WRONG: "bath drain blocked" → suggest Bath Fitter, ask about bath replacement
RIGHT: "bath drain blocked" → suggest Plumber ONLY, focus on drain questions
```

**Location:** `apps/api/src/ai/ai.service.ts` → `buildConversationalPrompt()`

---

## Quick Reference: All Prompt Sections (in order)

| # | Section | Status |
|---|---------|--------|
| 1 | Role & Objective | Unchanged |
| 2 | Conversational Style | Unchanged |
| 3 | Conversation Management | Unchanged |
| 4 | **Fact Tracking** | NEW |
| 5 | **Problem Focus** | NEW |
| 6 | **Surface-Area Projects** | NEW |
| 7 | **Requirement Tracking** | NEW |
| 8 | CRITICAL RULES (1-14) | Updated (rules 9-10, rule 2) |
| 9 | TRADE MINIMIZATION RULE | Updated (new examples) |
| 10 | ALLOWED_TRADES / LOCATION_TAXONOMY | Unchanged |
| 11 | OUTPUT FORMAT (JSON) | Updated (assumptions, risks, safetyAssessment, coveredTopics) |

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/api/src/ai/ai.service.ts` | All prompt sections, thread context, output format |
| `apps/web/src/components/requirement-checklist.tsx` | NEW — subtle pill-style checklist widget |
| `apps/web/src/lib/requirement-matrix.ts` | NEW — editable category→topic config |
| `apps/web/src/components/search-flow.tsx` | Added `coveredTopics` to types, response parsing, component props |
| `apps/web/src/app/projects/[id]/tabs/overview-tab.tsx` | Fixed `hasAiInsights` check |
