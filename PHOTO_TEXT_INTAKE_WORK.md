# Photo/Text Split Intake — Work Summary

**Date:** June 25, 2026  
**Status:** Reverted (kept for future revisit)  
**Rollback Tag:** `pre-photo-text-split`

## What was built

A two-path intake system on the homepage replacing the single text prompt:

| Path | Flow |
|---|---|
| 📸 Photos | Drop photo → AI auto-analyzes via Qwen vision → responds with photo-specific observations |
| 📝 Words | Type description → text pre-fills in SearchFlow → user submits |

### Components created

| File | Purpose |
|---|---|
| `components/flip-choice.tsx` | Animated two-card selection UI (photos vs words), flips to reveal input |
| `components/photo-drop-zone.tsx` | Drag-and-drop photo upload zone with previews, Mimo colour scheme |
| `hooks/use-voice-input.ts` | Web Speech API wrapper with language support (粵/简/EN) |
| `components/voice-input-button.tsx` | Reusable mic button for voice-to-text |
| `hooks/use-text-to-speech.ts` | SpeechSynthesis wrapper with female voice preference |
| `components/listen-button.tsx` | Reusable speaker button for text-to-speech |

### Backend Qwen fixes (KEPT)

| File | Change |
|---|---|
| `ai.service.ts` | Added explicit Qwen vision logging ("Qwen vision request started/completed") |
| `ai.service.ts` | Sanitized `confidence` field to handle omni model output format |
| `ai.service.ts` | Injected `imageSummary` into `conversationalText` to replace DeepSeek generic text |

### Why reverted

1. Qwen `qwen-vl-plus-latest` returned 403 (not in free tier)
2. `qwen-omni-turbo` worked but required contract fixes (confidence field)
3. The conversational text wasn't being updated with vision results (fixed)
4. DeepSeek's generic text was appended after Qwen's analysis (fixed)
5. Photo-specific responses still being ironed out — needs more tuning

### What was kept

- All backend Qwen fixes in `ai.service.ts` (logging, sanitization, text injection)
- Voice input/Listen components (still used elsewhere)
- `search-flow.tsx` props (`initialPrompt`, `initialImages`, `sourceMode`) — harmless
- `photo-drop-zone.tsx` and `flip-choice.tsx` files on disk (unused)

### Qwen Kill Switch (KEPT)

| Env Var | Where | Effect |
|---|---|---|
| `QWEN_VISION_ENABLED=false` | Render | Strips `imageUrls` from AI input; Qwen never called; images saved & linked only |
| `NEXT_PUBLIC_QWEN_VISION_ENABLED=false` | Vercel | Skips vision quota fetch; removes upload limits; disables quota error messages |

When re-enabling Qwen vision, set both to `true` (or remove them — they default to enabled).

### To revisit

1. Test Qwen vision with `qwen-omni-turbo` thoroughly — ensure consistent photo-specific responses
2. Consider re-enabling FlipChoice when vision is reliable
3. Add "Mimo is analyzing your photo" loading state in the FlipChoice transition
4. Consider multi-photo support in the chat (different rooms/angles)
