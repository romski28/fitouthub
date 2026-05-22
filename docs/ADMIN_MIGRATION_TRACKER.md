# Admin Migration Tracker

Status: Active
Owner: Platform Admin
Last updated: 2026-05-22

## How to use
- Update one row per route as migration progresses.
- Set Phase according to ADMIN_COMMAND_CENTER_SPEC.md.
- Do not mark a route Completed until parity checks pass.

## Status legend
- Not started
- In progress
- Blocked
- Completed

## Route tracker

| Route | Decision | Phase | Status | Destination | Parity checks | Removal or redirect done | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /admin/foh-inbox | Retire | Phase 2 | Not started | /admin/messaging | Not started | No | Legacy duplicate queue |
| /admin/foh-inbox/[id] | Replace | Phase 2 | Not started | Canonical thread path in /admin/messaging | Not started | No | Keep temporary redirect until parity |
| /admin/messaging | Fold | Phase 2 | Not started | Command centre communications workflow | Not started | No | Keep route but reframe under /admin ownership |
| /admin/support | Fold | Phase 2 | Not started | Command centre support workflow | Not started | No | Ensure escalation routing appears in queue |
| /admin/reports | Fold | Phase 3 | Not started | Command centre moderation section | Not started | No | Preserve moderation actions and audit |
| /admin/announcements | Fold | Phase 3 | Not started | Command centre data control section | Not started | No | Preserve publish and archive workflows |
| /admin/next-steps | Fold | Phase 3 | Not started | Command centre data control section | Not started | No | Preserve content version traceability |
| /admin/policies | Fold | Phase 3 | Not started | Command centre data control section | Not started | No | Preserve policy publish and rollback capability |
| /admin/trades | Fold | Phase 3 | Not started | Command centre data control section | Not started | No | Preserve mapping and translation updates |
| /admin/projects/[id]/tokens | Replace | Phase 4 | Not started | /admin/projects/[id] tab or panel | Not started | No | Decommission only after all token actions verified |
| /admin/projects/[id]/professionals | Replace | Phase 4 | Not started | /admin/projects/[id] tab or panel | Not started | No | Decommission only after invite and quote flows verified |

## Keep surfaces optimization tracker

| Route | Phase | Status | Integration task | Notes |
| --- | --- | --- | --- | --- |
| /admin/projects | Phase 5 | Not started | Add queue deep-links and consistent status model | |
| /admin/projects/[id] | Phase 5 | Not started | Add merged tabs for tokens and professionals | |
| /admin/professionals | Phase 5 | Not started | Ensure verification cards are queue-driven | |
| /admin/users | Phase 5 | Not started | Add queue deep-links for user-related incidents | |
| /admin/assist | Phase 5 | Not started | Align unread and assignment states with queue | |
| /admin/questionnaires | Phase 5 | Not started | Align moderation and review signals | |
| /admin/activity-log | Phase 5 | Not started | Link each queue item to audit entries | |
| /admin/analytics | Phase 5 | Not started | Add command-centre health deep-links | |
| /admin/analytics/purge-audit | Phase 5 | Not started | Keep compliance access path stable | |
| /admin/changelog | Phase 5 | Not started | Link release incidents to queue and health lane | |
| /admin/profile | Phase 5 | Not started | No major integration expected | |

## Signal gap tracker

| Domain | Required signals | Current state | Gap | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| Messaging and support | message flagged, support opened, support escalated, assignment changed | Partial | assignment changed normalization | API | Not started |
| Verification | certification uploaded, verification ready, verified, rejected, BRC submitted | Strong | verify rejected reason taxonomy | API | Not started |
| Payments | approval requested, escrow release requested, refund requested, payment exception raised | Unknown | full event coverage audit needed | API | Not started |
| Project ops | token generated or revoked, professional invited or responded, site access decision | Partial | token and invite events normalization | API | Not started |
| Configuration and moderation | policy updated, content updated, moderation completed, mapping changed | Partial | normalize announcements and next-steps edits | API | Not started |
