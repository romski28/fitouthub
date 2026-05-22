# UI Panel Theme Standard

This document defines the baseline visual hierarchy for parent panels across client pages.

## Source of Truth

The standard is based on the Home hero panel shell and is now centralized in:
- apps/web/src/app/globals.css

Core classes:
- `.mimo-panel`
- `.mimo-panel-padding`
- `.mimo-panel-eyebrow`
- `.mimo-panel-title-xl`
- `.mimo-panel-title-lg`
- `.mimo-panel-body`

## Parent Panel Standard

Use this for top-level sections like page hero, review blocks, recipient summaries, and major CTA containers.

- Background: `rgba(245, 238, 222, 0.9)`
- Border: `1px solid rgba(255, 255, 255, 0.45)`
- Radius: `1.5rem` (`rounded-3xl` equivalent)
- Shadow: soft warm shadow (`0 12px 28px rgba(81, 55, 32, 0.08)`)
- Default padding: `1.5rem`

## Text Hierarchy

Use this simple hierarchy inside parent panels:

1. Eyebrow
- Class: `.mimo-panel-eyebrow`
- Role: context label (Project review, Bidding recipients, etc.)

2. Panel Title (XL)
- Class: `.mimo-panel-title-xl`
- Role: primary page-level heading

3. Panel Title (LG)
- Class: `.mimo-panel-title-lg`
- Role: section title inside parent panels

4. Body
- Class: `.mimo-panel-body`
- Role: supporting paragraph copy

## Rollout Guidance

When updating a page:

1. Replace ad-hoc panel shells with `.mimo-panel`.
2. Add `.mimo-panel-padding` unless panel content already controls spacing.
3. Use the hierarchy classes instead of one-off text-size chains.
4. Keep component-internal micro-panels unchanged unless needed.

## Applied Example

Current create-project page now uses this standard for parent panels:
- Project creation
- Bidding recipients
- Project review

Files updated in this rollout:
- apps/web/src/app/globals.css
- apps/web/src/app/create-project/page.tsx
