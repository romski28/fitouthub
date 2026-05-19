# Activity Logging And Project Activity Rollup

## Overview
The platform now has two related layers of activity tracking:

1. `ActivityLog`
   - durable audit/event rows for user, professional, admin, and system actions
   - used by the admin activity log screen

2. Project activity rollups on `Project`
   - `lastActivityAt`
   - `lastClientActivityAt`
   - `lastProfessionalActivityAt`
   - `lastAdminActivityAt`
   - `lastSystemActivityAt`
   - used for cheap sorting, filtering, and recency display without scanning log history

The important semantic split is:

- `Project.updatedAt` means the project row itself changed
- `Project.lastActivityAt` means meaningful project activity happened somewhere in the wider project surface

## Current Architecture

### Shared helper
Primary entrypoint:

- `apps/api/src/activity-log.service.ts`

Key behavior:

- writes an `ActivityLog` row
- infers `projectId` from explicit input or metadata when possible
- enriches metadata with `projectId` and `projectTitle`
- nudges project rollup fields when a project is in scope
- supports `tx` so activity logging can stay inside existing transactions
- supports `bumpProjectActivity: false` for special cases like purge-after-delete

Global wiring:

- `apps/api/src/activity-log.module.ts`
- `apps/api/src/app.module.ts`

### Project schema
Project rollup fields live in:

- `apps/api/prisma/schema.prisma`

Migration:

- `apps/api/prisma/migrations/20260519_add_project_activity_rollups/migration.sql`

## Implemented Coverage

### Existing account/platform audit coverage
Still supported:

- registration
- login / login failed
- password changes
- existing non-project audit events

### Project-aware logging now wired

#### Core project workflow

- `apps/api/src/projects/projects.service.ts`
- `apps/api/src/professional/professional.controller.ts`
- `apps/api/src/client/client.controller.ts`
- `apps/api/src/chat/chat.service.ts`

Examples:

- quote submitted
- project invitation accepted / rejected
- project chat messages
- notification audit
- award reversal
- purge audit with preserved project context

#### Financial workflow

- `apps/api/src/financial/financial.service.ts`

Financial audit events now route through the shared helper. If metadata carries a project ID, the project rollup is nudged.

#### Progress reports

- `apps/api/src/progress-reports/progress-reports.service.ts`

Examples:

- progress report created
- progress report sign-off requested
- sign-off approved / rejected

#### AI project scope workflow

- `apps/api/src/ai/ai.service.ts`

Examples:

- AI safety acknowledged
- project scope generated
- scope entry created / updated / deleted
- scope reviewed / published / revised / reordered

#### Milestones

- `apps/api/src/milestones/milestones.service.ts`

Examples:

- client declined milestone access
- client agreed / questioned completion
- generic milestone create / update / replace / reset logged as `system` by design

Decision taken in this session:

- generic milestone create/update/reset flows are easy to reason about and do not currently carry reliable actor identity everywhere
- they are intentionally logged as `system` instead of guessing a client/professional/admin actor

#### Support / assist

- `apps/api/src/support-requests/support-requests.service.ts`
- `apps/api/src/assist/assist-requests.service.ts`

Examples:

- project-linked callback requests
- project assist request created
- assist messages created

## Admin Surfaces Updated

### Admin activity log

- `apps/api/src/activity-log.controller.ts`
- `apps/web/src/app/admin/activity-log/page.tsx`

Current behavior:

- activity log API enriches rows with project ID and project title when available
- admin activity page shows project context and current project `lastActivityAt`

### Admin projects page

- `apps/web/src/app/admin/projects/page.tsx`

Current behavior:

- cards sort by `lastActivityAt` first
- card display prefers `lastActivityAt`, then `updatedAt`, then `createdAt`

## Special Cases

### Project purge
This was explicitly handled.

`project_purged` still writes an activity event with project ID and title, but uses:

- `bumpProjectActivity: false`

Reason:

- after purge, the project row is gone, so attempting to update project rollup fields would be incorrect

## Remaining Gaps

The foundation is in place and the major high-signal project paths are covered. Remaining work is mostly long-tail cleanup.

Likely next targets:

1. Assist/support lifecycle state changes
   - reopen
   - close
   - closure pending
   - resolution transitions

2. Any project-linked write path that still mutates records without calling the shared helper

3. Optional test coverage around the new behavior

## Deployment / Validation Notes

### Commands used during implementation
```powershell
pnpm --filter api exec prisma generate
pnpm --filter api build
npx tsc --noEmit --skipLibCheck -p apps/web/tsconfig.json
```

### Before deploying

1. Apply the new migration for project activity rollups.
2. Regenerate Prisma client.
3. Build API.
4. Verify the admin projects page sorts by recent activity.
5. Verify the admin activity log shows project ID/title on project-scoped events.

## How To Avoid Forgetting New Activity Events

This is the main process decision going forward.

### Rule
If a new helper, service method, or controller action can change meaningful project state, it must call `ActivityLogService.record(...)` before the work is considered complete.

### Meaningful project state includes

- quote state
- award state
- project chat / assist / support movement
- milestone state
- financial state
- AI project-scope state
- progress-report state
- direct project edits

### It does not automatically include

- read markers
- silent notification fanout
- token generation
- background housekeeping
- internal cleanup with no user-visible project movement

### Recommended definition of done for future project work
For any new project-related helper or endpoint, the PR/checklist should answer all three:

1. Does this action affect a project or a project-linked record?
2. If yes, should it bump `lastActivityAt`?
3. If yes, where is the `ActivityLogService.record(...)` call?

### Lightweight enforcement options

#### Option 1: PR checklist
Add a standing item to the team PR checklist:

- If this changes project state, confirm `ActivityLogService.record(...)` was added or intentionally omitted.

This is the cheapest and most realistic immediate safeguard.

#### Option 2: Grep sweep before release
Before shipping a feature batch, run a repo sweep for new project-linked writes and verify they call the helper.

Examples:
```powershell
rg -n "create\(|update\(|upsert\(|updateMany\(" apps/api/src
rg -n "projectId|projectProfessionalId|projectMilestone|progressReport|supportRequest|assistRequest" apps/api/src
rg -n "ActivityLogService\.record\(" apps/api/src
```

#### Option 3: Code review rule
Any reviewer seeing a new project-affecting helper should ask:

- what is the activity event?
- what actor type is it?
- should it bump project recency?

#### Option 4: Targeted tests
For high-value flows, tests should assert either:

- an `ActivityLog` row is written
- or the relevant `lastActivityAt` field changes

This is best for critical flows, not every tiny helper.

## Recommended Future Pattern

When adding a new project-affecting action, prefer this shape:

```ts
await this.activityLogService.record({
  actorType: 'client',
  actorName: 'Client',
  action: 'some_project_action',
  resource: 'SomeProjectLinkedResource',
  resourceId: resource.id,
  projectId,
  projectTitle,
  details: 'Short human-readable summary',
  metadata: {
    ...usefulStructuredContext,
  },
  status: 'info',
  userId: clientUserId,
  tx,
});
```

Use `bumpProjectActivity: false` only when the event should be audited but must not touch the project row, such as after a permanent purge.

## Pickup Checklist For Next Session

1. Sweep remaining assist/support state transitions.
2. Decide whether any additional financial or milestone subflows still need explicit events.
3. Add a small backend test set for:
   - one project chat or quote action
   - one progress report action
   - one purge/special-case action
4. Consider adding an explicit project-activity checklist item to the team PR template or workflow notes.
