# PM Tender Concierge & Quick Actions — Implementation Plan

Status: confirmed, ready to build (in phases).

## Overview

The PM is the operational point of contact for clients and, during tender, the
sole counterparty for professionals. This plan covers (A) giving the PM a
first-class chat identity, (B) surfacing PM messages in the existing
notification aggregation, (C) a PM project-detail screen with images and five
"quick action" buttons, and (D) a "tender Q&A concierge" that routes all
professional questions through the PM until award.

## Confirmed decisions

- **PM chat identity:** `senderType: 'pm'`, with `senderUserId` = PM's user id
  (PM is a `User` with role `project_manager`).
- **PM↔client chat:** reuse the per-project `ProjectChatThread`
  (`chatType: 'project-general'`) — one thread per project, not per message.
- **Chat aggregation:** reuse the existing `UpdatesModal` / `GET /updates/summary`
  (WhatsApp-style thread list with unread counts and sender name). No new
  aggregation surface.
- **Images:** stored in `ProjectPhoto` (project-level, shared with pros once
  released).
- **Redefine scope:** manual button (PM controls when AI re-runs).
- **Arrange call:** lightweight PM↔client request with a **date/time picker**
  (no assist-request case, no SLA).
- **Arrange survey:** reuse `persistProjectExtraRequest('survey')` +
  `signalAdminFeedForProjectExtras` / `BookMimoSurveyModal`.
- **Concierge window:** tender (release) → **award**. After award the awarded
  pro and the PM both use the shared project chat (general operations).
- **Client visibility during tender:** fully hidden from pro questions (no
  rollup).
- **Concierge is a separate phase** (builds on A/B with no rework).

---

## Phase A — PM identity in chat

Foundation. `ProjectChatMessage.senderType` is a plain `String`
(`'client' | 'professional' | 'foh'`), so adding `'pm'` needs **no migration**.

- `chat.service.addProjectMessage` — accept `'pm'`; map `actorType`/`actorName`
  in the activity log.
- `projects.service.notifyClientPmProgress` — post with `senderType: 'pm'` and
  `senderUserId = pmUserId` (currently `'foh'`).
- `updates.service.ts` `senderName` resolution — add `'pm' → PM's name`
  (fetched from `User`).
- `project-chat.tsx` (client) — render `'pm'` messages with a name + "PM" badge.

## Phase B — PM messages in the existing aggregation

- Confirm PM messages count as unread for the client (they already do — the
  summary filters `senderType != 'client'`).
- Result: a PM message appears in the client's existing updates list as
  `project-general` with the PM's name and an unread badge, deep-linking into
  that project's thread.

## Phase C — PM project detail: images + five quick actions

1. **Show images** — render `findOne`'s already-returned `photos` (gallery +
   "no images yet" empty state).
2. **Ask for more info** — PM posts a question to the project thread as `'pm'`.
3. **Arrange call** — a templated PM→client call request with a date/time
   picker (proposed slot), posted to the project thread + client notification.
4. **Add images** — new `POST /projects/:id/photos` (only `DELETE`/`PUT` exist),
   reusing the storage-upload util + `ChatImageUploader` → `ProjectPhoto`. Pros
   see them automatically once released (release gate already blocks earlier
   visibility).
5. **Arrange survey** — `persistProjectExtraRequest(projectId, 'survey', …)` +
   `signalAdminFeedForProjectExtras` (or open `BookMimoSurveyModal`).
6. **Redefine scope** (button) — `generateProjectScope(projectId, actor, {
   additionalContext: <Q&A transcript> })`; already versions the scope.

## Phase D — Tender Q&A Concierge

Window: release → award. The PM is the sole tender counterparty for pros.

1. **Schema** (`Message` model): add `senderType 'pm'`, `senderPmId`,
   `readByPmAt` (today only `senderClientId`/`senderProfessionalId`,
   `readByClientAt`/`readByProfessionalAt`).
2. **Routing:** `POST /professional/projects/:projectProfessionalId/messages`
   targets the PM (not the client) during tender. Pro UI copy → "Ask the PM".
3. **PM unified inbox:** add a PM branch to `updates.service.ts` (mirror the
   client branch) aggregating per-pro `project-professional` threads + the
   client `project-general` thread. Reuse the `UpdatesModal` pattern on the PM
   page — click a row → open that thread + reply window.
4. **Client shielding:** suppress per-pro groups from the client's updates
   during tender; client sees only `project-general` (PM↔client).
5. **Privacy:** per-pro threads stay scoped to `projectProfessionalId` (that
   pro + PM only).
6. **On award:** pro gains `ProjectChatThread` access (already exists
   post-award); PM retains access; project chat becomes the shared operations
   tool; concierge routing ends.

---

## Order of work

A → B → C (quick wins) → D (concierge). D reuses A's `'pm'` identity and B's
aggregation/UpdatesModal pattern, so there is no double handling.

## Open items (minor, for build)

1. `onLeave` as a `User` boolean vs a date range (from PM_ROLE_DESIGN.md).
2. Exact queue tag label/severity for on-leave pending actions.
