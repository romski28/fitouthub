# Modal CSS Consolidation — Risk Analysis & Decision

**Status:** Deferred (pinned). Documented for future reference.
**Date:** 2026-08-15
**Question:** Should we create a single `modal.css` applied to all modals (including chat), sitting on top of parent styles?

## Decision

**No global `modal.css`.** Instead, standardise on the shared React primitive
(`components/modal-overlay.tsx`) + Tailwind `@theme` design tokens, and keep chat
layering out of scope. See "Recommended path" below.

## Why a global sheet is risky

Tailwind v4 puts utilities in `@layer utilities`. Un-layered plain CSS always wins over
layered CSS regardless of specificity, so a `modal.css` would genuinely override
per-modal utilities — which is the *danger*, not the benefit.

## Findings at time of review

- 55+ overlay/drawer instances across ~48 files, almost all hand-rolled with
  `fixed inset-0 z-50` + inline Tailwind.
- `modal-overlay.tsx` primitive exists but is used by only ~7 files.
- 8 distinct backdrop recipes in production.
- Fragmented z-index: `z-40` (floating chat) → `z-50` → `z-[60]` → `z-[72]/[73]`
  (wizard) → `z-[80]` (media viewers) → `z-[100]` (wallet auth) → `z-[110]`
  (materials claim review) → `z-[9999]` (PWA prompt).
- `globals.css` already has broad overrides, e.g.
  `[class*="text-emerald-"] { color: var(--mimo-coral) !important; }`.
- Rendering is split: `createPortal(document.body)` vs inline (inline modals are
  vulnerable to ancestor `transform`/`filter` trapping `position: fixed`).

## Rule-by-rule regression summary

| Shared-sheet rule | Overlays at risk | Severity |
|---|---|---|
| Force one layout (centered card) | ~7 (drawers, bottom sheets, full-bleed mobile, top-anchored scrollable) | High |
| Force one backdrop | ~35 of 55 | High |
| Force one z-index | ~14 (nested confirmations, viewers, PWA prompt) | High |
| Force one radius/border | ~9 (3D flip cards + drawers) | Medium-High |
| Force transition/animation | ~8 (state-driven visible/invisible modals) | Medium |
| Portal/inline masking | all inline modals | Medium (latent) |
| Chat cascade | 4 chat files + 2 embeds | High |

Net: ~50 of 55 overlays regress under at least one rule; only the already-conforming
centered cards survive cleanly.

### Layout variants that a single layout rule breaks

- Right-side drawer: `updates-modal.tsx`, `professional-details-modal.tsx`, `admin/page.tsx`
- Bottom sheet: `emergency-summary-screen.tsx`, `survey-ops/[projectId]/workspace/page.tsx`
- Full-bleed mobile → centered desktop: `auth-modal.tsx`
- Top-anchored scrollable mobile: `materials-claim-modal.tsx`, `respond-materials-claim-modal.tsx`
- 3D flip cards: `progress-report-modal.tsx`, `review-quotes-modal.tsx`,
  `contract-action-modal.tsx`, `quote-action-modal.tsx`, `start-date-action-modal.tsx`

### Backdrop recipes (8)

`bg-black/60 backdrop-blur-sm`, `bg-[rgba(81,55,32,0.35)]`, `bg-black/40`,
`bg-black/50`, `bg-slate-950/50–60`, `bg-slate-900/20 backdrop-blur`,
light drawer scrim (`bg-slate-100/70`), and high-contrast viewers
(`bg-black/75–90`).

### z-index contract (load-bearing, must not flatten)

| z | Purpose |
|---|---|
| `z-40` | floating chat panel (below modals by design) |
| `z-50` | baseline modals |
| `z-[60]` | confirmations/celebration layered over z-50 |
| `z-[72]/[73]` | wizard layers |
| `z-[80]` | media viewers above their parent modal |
| `z-[100]` | wallet authorisation |
| `z-[110]` | materials claim review (above wallet auth) |
| `z-[9999]` | PWA install prompt (above toasts) |

### Chat-specific risks

- `floating-chat.tsx`: `z-40` panel (not a modal) + `z-50` emergency prompt.
- `project-chat.tsx`: rendered inline inside `progress-report-modal` and tab pages —
  a global modal sheet would cascade into it.
- `chat-image-attachment.tsx` / `chat-image-uploader.tsx`: rely on dark-scheme select
  CSS and `bg-black/90` lightboxes.
- `.next-step-scrollbar` white thumb was authored for dark panels (invisible on beige).

## Recommended path (when resumed)

1. Extend `modal-overlay.tsx` into variants via props:
   centered / drawer / bottom-sheet / full-bleed-mobile / flip-card.
2. Migrate call sites to the primitive (fixes portal, z-index, focus-trap, scroll-lock
   in one place).
3. Define backdrop/panel/radius/max-width/z-index **tokens** in Tailwind `@theme`,
   consumed by the primitive — not a broad un-layered stylesheet.
4. Keep chat out of scope; only unify its *surface* tokens, not positioning/stacking.
