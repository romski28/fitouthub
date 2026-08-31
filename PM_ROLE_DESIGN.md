# PM Role & Workspace — Design (draft)

Status: proposal, to be reviewed/augmented before any code.

## 1. Goal

Introduce a **Project Manager (PM)** role: the operational point of contact for
clients at Mimo, owning projects start-to-finish across all sizes. PM work
always begins at **"The Queue"** — the list of newly registered projects.

This is a **back-office operational role**, deliberately distinct from system
admin.

## 2. Confirmed decisions

- **New `project_manager` role** (displayed as "PM"; not reusing `admin` or `mimo_boh`).
- **Same login/SSO** for now. FoH/BoH split deferred.
- **New code for the PM workspace.** The existing admin "Unified Messaging Feed"
  is a *reference* for the queue data and claim/assign patterns, but the PM UI
  is built separately.
- **The Queue** = ALL projects once the client completes tender selection
  (regardless of open-tender vs invite-only).
- **One account = one role.**
- **Manual claim** (no round-robin auto-assign).
- **PM sees full project-related chat** (all pro↔client threads + the project
  chat) when drilled into a project.
- **Exclusive ownership** (one PM per project); absence coverage via a temporary
  share/handoff (mechanism TBD — see open questions).

## 3. Role model

Today the role lives in two places:

- `User.role` — `String @default("client")` (schema).
- JWT `tokenRole` — enumerated in the API (e.g. `admin | client | professional |
  surveyor | mimo_boh` in `projects.controller.ts`), and in the web
  `useRoleGuard` `Role` type.

Plan:

- Add `project_manager` as a valid `User.role` value.
- Add `project_manager` to the token role union (API) and to `useRoleGuard`'s `Role` type.
- Keep a single `role` string for now (one user = one back-office role). If a
  system admin also needs PM access, revisit as a `roles String[]` later — not
  in scope.

## 4. Workspace split

Two role-gated back-office surfaces under one app:

| Surface | Route | Role | Contents |
| --- | --- | --- | --- |
| PM workspace | `/pm` | `pm` | The Queue, My Projects, project detail + client comms |
| System admin | `/admin` | `admin` | dashboard, data-control, analytics, users/permissions, billing, config |

What **moves out of `/admin`** toward PM over time: project operational work,
client comms, queue triage. What **stays in `/admin`**: data control, analytics,
user/permission management, billing, platform config.

## 5. The Queue (PM landing) + quotation-release gate

- **Definition:** a project enters the queue when the client has **completed
  tender selection** (open-tender or invite-only) and it is not yet assigned a
  PM. All tender types are surfaced.
- **Universal hold-by-default.** Completing tender selection *only* surfaces the
  project in the queue — it does **not** make it quotable. Every project is held
  until the assigned PM verifies and **releases it for quotation**.
- **PM as quotation-release gatekeeper.** After claiming, the PM reviews the
  project for completeness, complexity, and additional requirements, connects
  with the client to fill any gaps, then releases it for quotation. Only
  released projects are quotable by professionals.
- Landing view: list of queued projects, sorted by age/urgency, with a
  **Claim** action (manual).
- Each queue item shows a **job type badge** — a fixed-size, lozenge/pill-shaped
  badge. Starts with "New Project"; further types (release-awaiting, on-leave
  action, escalation, …) get their own badges.
- Mirrors the existing `AdminMessageAssignment` / `AdminAction` claim pattern
  (reference only — new code).

State: `releasedForQuotationAt` (with `releasedByPmId`) on `Project` marks a
project as released for quotation; `null` means "held, awaiting PM review".

**Absence / on-leave handling:** a PM marked `onLeave` has their pending actions
surfaced in The Queue with a special tag, so coverage is automated rather than
requiring manual reassignment of every active project.

## 6. Data model (minimal)

- Add `pmId String?` to `Project` + `User?` relation (nullable assigned PM).
- Add `releasedForQuotationAt DateTime?` to `Project` — when the PM released the
  project for quotation (distinguishes "awaiting PM review" from "released").
- Add `releasedByPmId String?` to `Project` + relation — records *which* PM
  released it (the owner, or a temp PM covering absence).
- Add `onLeave Boolean @default(false)` to `User` — the PM "on leave" flag.
- Optionally a `claimedAt` timestamp for queue ordering.

## 7. Permissions (least privilege)

- `pm`: read/write project scope (queue, project detail, full project-related
  chat — all pro↔client threads and the project chat), claim/release projects.
  **No** data-control, user management, billing, or platform config.
- `admin`: existing system powers; may optionally view but not be required to
  operate the queue.
- API guards: extend existing `tokenRole === 'admin'` checks to also admit `pm`
  for project-scoped routes, and add PM-only endpoints (queue list, claim).

## 8. Routing & nav

- New `/pm` route tree with its own layout/nav (or a shared back-office shell
  with role-gated nav items).
- `useRoleGuard(['pm'], { fallback: '/admin' })` on PM routes;
  `useRoleGuard(['admin'], ...)` on admin routes.
- **Admin people manager** (`/admin/users`) gains the ability to create PM
  accounts (set `User.role = 'pm'`), alongside existing roles.

## 9. Phased rollout

0. **Phase 0** — Admin people manager creates PM accounts; `pm` role in schema
   + token + `useRoleGuard`.
1. **Phase 1** — `/pm` scaffold; The Queue (projects put out to tender) +
   manual claim; `pmId` on Project.
2. **Phase 2** — Quotation-release gate (PM review → release for quotation);
   PM project detail (own projects) + full project chat.
3. **Phase 3** — workload views (my projects, due tasks), PM analytics,
   absence/temp-share handoff.
4. **Phase 4 (later)** — FoH/BoH split.

## 10. Resolved + remaining questions

Resolved:
- Newly registered = project put out to tender (PM is the quotation-release gate).
- One account = one role.
- Manual claim.
- PM sees full project-related chat (all pro↔client + project chat).
- Exclusive ownership (one PM per project); `onLeave` flag with automated queue
  surfacing (special tag) for coverage.
- Release state = `releasedForQuotationAt` + `releasedByPmId` (covers temp PM).
- People manager: single-user PM creation (no bulk invite).

Remaining (minor, for build phase):
1. `onLeave` as a simple `User` boolean vs a date range (start/end)?
2. Exact queue tag label/severity for on-leave pending actions.
