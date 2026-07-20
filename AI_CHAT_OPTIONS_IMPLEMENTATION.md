# AI Chat Answer Options — Full Implementation Record

**Date**: July 20, 2026  
**Scope**: Wizard AI chat only (home page search-flow intentionally excluded)  
**Status**: Frontend deployed (Vercel) | API changes pending Render redeploy

---

## Overview

Added tappable answer buttons to the wizard AI chat so users can reply with one tap instead of typing. The AI generates domain-specific options (e.g., "Mixer tap", "Pillar taps") in its JSON response. The frontend renders these as coral buttons. Also tightened the AI prompt for single-question turns, one-sentence replies, and clean wrap-up behavior.

---

## Files Changed

| File | What |
|------|------|
| `apps/web/src/lib/ai-options.ts` | **New** — shared utility: `generateAiOptions()`, `extractAiOptions()` |
| `apps/web/src/components/search-flow.tsx` | Imported shared utility; aiOptions rendering removed (wizard-only) |
| `apps/web/src/app/create-project/wizard/page.tsx` | Answer button rendering, options threading from draft, styling, stepsRef fix |
| `apps/web/src/lib/draft-storage.ts` | Added `aiOptions` field to `CreateProjectDraftValue` type |
| `apps/web/src/lib/create-project-handoff.ts` | Added `aiOptions` to `CreateProjectDraftHandoff` and `ProjectDescriptionHandoff` |
| `apps/api/src/ai/ai.service.ts` | AI prompt: rules 3, 4, 11–13, 19 updated; rule numbering fixed |

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  AI (DeepSeek)│────▶│  API (NestJS)│────▶│ Frontend     │
│  JSON response│     │  passes thru │     │ extractAiOptions()
│  with options │     │  parsedOutput│     │ → answerOptions
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                    ┌────────────┴────────────┐
                                    │ WizardChatMessage       │
                                    │ { text, options }       │
                                    └────────────┬────────────┘
                                                 │
                                    ┌────────────┴────────────┐
                                    │ Coral buttons +         │
                                    │ "Or something else?"    │
                                    └─────────────────────────┘
```

### Option resolution order

1. `parsedOutput.options` from AI JSON (domain-specific: tap types, pipe materials, etc.)
2. `payload.options` (top-level, rarely present)
3. `generateAiOptions(fallbackText)` — regex-based fallback (yes/no, X or Y, what/which/how, default)

---

## Shared Utility: `lib/ai-options.ts`

### `generateAiOptions(text)`

Regex-based option generation. Check order:

1. **Comma-separated list** (≥3 items): splits on `,` with optional trailing `or`
2. **"X or Y" pattern**: two options + "Something else"
3. **What/which/how questions**: "Tell me more" / "Not sure yet"
4. **Yes/No questions**: only when auxiliary (`would you|do you|are you|…`) appears at `^` start
5. **Default**: "Tell me more" / "That covers it"

Key decision: what/which/how checked **before** yes/no to prevent false matches (e.g., "What type of tap **are you** looking to install?" no longer triggers yes/no).

### `extractAiOptions(parsedOutput, payloadOptions, fallbackText)`

1. Tries `parsedOutput.options` (AI-generated) first
2. Falls back to `payloadOptions`
3. Falls back to `generateAiOptions(fallbackText)`
4. **Sanitization**: filters out "Other", "Something else", "Tell me more", "That's all", "None of the above" (UI provides "Or something else?")
5. Truncates labels >40 chars (full sentences don't fit on buttons)
6. Caps at 4 options max

---

## Wizard Button Rendering

### Conditions

Buttons show when ALL of:
- `message.role === 'assistant'`
- `message.options` exists with `length > 0`
- `!chatBusy` (AI not currently processing)

### Styling

- **Option buttons**: `rounded-lg bg-[#FF7F50] text-white` (solid coral), darker hover/active states
- **Free-text button**: `rounded-lg border border-[#FF7F50]/40 text-[#FF7F50] bg-white` (outlined), label: "Or something else?"
- No debug borders or console logs

### Message coverage

| Message type | Has options? |
|-------------|-------------|
| Seed starter text (msg 0) | No |
| Seed first question (msg 1) | Yes — from home page draft `aiOptions` |
| Main conversational text | No — summary, question options on follow-up |
| Follow-up with prefix | Yes — `answerOptions` from AI |
| Follow-up direct question | Yes — `answerOptions` from AI |
| Fallback question | Yes — `answerOptions` from AI |
| Completion ("Thanks, done") | No |

---

## Options Threading: Home Page → Wizard

The wizard's first question is seeded from the home page AI response. Options now flow through:

1. Home page AI responds → `extractAiOptions()` → `setAiOptions(opts)`
2. User clicks "Start project" → `persistAiWizardHandoffForAuth()` stores `aiOptions` in draft
3. Draft saved via `writeCreateProjectDraftSafely()` and `setCreateProjectDraftHandoff()`
4. Wizard reads `seedDraft.aiOptions ?? seedDescription.aiOptions`
5. Seed first question gets `options: seedOptions`

Types updated: `ProjectDescriptionData`, `CreateProjectDraft`, `CreateProjectDraftValue`, `CreateProjectDraftHandoff`, `ProjectDescriptionHandoff`.

---

## AI Prompt Changes (pending Render redeploy)

### Rule 3 — Conversational text
```
BEFORE: warm, friendly narrative (3-5 sentences)
AFTER:  exactly ONE warm, friendly sentence. No filler, no flattery,
        no repeating what they just said. Get in, validate, get out.
```

### Rule 4 — Answer options
```
CHANGES:
- Removed "Tell me more" / "That's all" fallback (UI provides
  "Or something else?")
- Every options array must include "Not sure" as last option
  (except urgency questions)
- Added pipe/plumbing condition template
```

### Rule 11 — Single question
```
BEFORE: Ask only ONE best next question
AFTER:  Ask EXACTLY ONE question per turn. Do NOT combine two
        questions into one sentence. Forbidden example:
        "What's the condition and are they copper?"
        Never use "and" or "or" to join separate questions.
```

### Rule 12 — Fresh options per turn (NEW)
```
OPTIONS MUST MATCH THE CURRENT QUESTION. Generate FRESH options for
THIS turn's nextQuestions[0] — do NOT carry over or echo options
from previous turns. If the question changes, options MUST change.
This is NOT negotiable.
```

### Rule 13 — No generic options (NEW)
```
Do NOT include "Other", "Something else", or "Or something else"
in the options array — the UI already provides a free-text reply
button. Your options should only be the specific answers to your
question.
```

### Rule 19 — Wrap-up (NEW)
```
When overallConfidence ≥ 0.75, the conversation is wrapping up:
- conversationalText must be a brief closing statement ONLY
- Do NOT include nextQuestions or followUpQuestions (empty arrays)
- Do NOT include an options array
- The system auto-advances; any question will be ignored
```

### Rule renumbering
Old rules 12 (duplicate), 12, 13, 14, 15 → now 14, 15, 16, 17, 18.

---

## Bugs Fixed

### 1. Regex false positive on yes/no
"What type of tap are you looking to install?" matched `/\b(are you)\b/` in the yes/no rule. Fixed by checking what/which/how first and anchoring yes/no auxiliaries to `^`.

### 2. Seed/follow-up messages had no options
`generateAiOptions()` was called directly instead of using AI-generated `answerOptions`. Fixed by reusing the `extractAiOptions` result.

### 3. Summary message carried irrelevant options
The main conversational text (often a summary) had options meant for the follow-up question. Fixed by removing options from the main message.

### 4. Fallback question path had no options
`getNextBestMissingBriefQuestion` path created messages without `options` property. Fixed.

### 5. `answerOptions` could theoretically be null/empty
Added hardcoded safety fallback: `[{ label: 'Tell me more', … }, { label: 'That covers it', … }]`.

### 6. Stale options between turns
AI was carrying over options from previous turns. Fixed with prompt rule 12 (fresh options) + frontend sanitization filter.

### 7. Compound questions
AI asked two questions in one sentence. Fixed with strengthened rule 11.

### 8. "Tell me more" / "Something else" duplicates
AI included these in options array; frontend already provides "Or something else?". Fixed with prompt rule 13 + frontend filter.

### 9. Question asked then auto-advance
AI asked a question in conversationalText but confidence was high enough to trigger wrap-up → "we are done" appeared immediately after a question. Fixed with rule 19.

### 10. Stale closure skipping images step
`setTimeout` auto-advance captured old `steps` array before `summaryConfirmationShown` flipped. Fixed with `stepsRef`.

### 11. Completion text
Changed from "Send with no text to move on" to "Just click Next to move on."

---

## What Was NOT Changed

- **Home page search-flow**: Answer buttons intentionally removed (wizard-only feature). The `extractAiOptions` call still runs internally for draft handoff.
- **`generateAiOptions` import in wizard**: Removed — wizard now uses `extractAiOptions` exclusively.
- **API response structure**: `parsedOutput.options` passes through `normalizeParsedOutput` via `...result` spread — no schema changes needed.

---

## Deployment Status

| Component | Deployed? | Notes |
|-----------|-----------|-------|
| Frontend (Vercel) | ✅ | All wizard UI, styling, threading, and stepsRef fix deployed |
| API (Render) | ❌ | AI prompt rules 3, 4, 11–13, 19 pending redeploy |

---

## Testing Checklist

After Render redeploy:
- [ ] First wizard question shows domain-specific options from home page AI
- [ ] Each turn asks exactly one question with matching answer buttons
- [ ] No "Tell me more" or "Something else" in AI-generated options
- [ ] conversationalText is one sentence max
- [ ] High-confidence wrap-up: closing statement, no dangling question, no options
- [ ] Images step appears when no files attached
- [ ] "Or something else?" button focuses text input
- [ ] No yellow debug borders or console spam
