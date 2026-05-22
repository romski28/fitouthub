# Admin Command Centre Spec

Status: Draft
Owner: Platform Admin / Back Office
Date: 2026-05-21

## Purpose
Replace the current mix of old and new admin panels with one operational command centre for Mimo.

The homepage should answer three questions immediately:
- What needs attention now?
- What is risky or blocked?
- What can the admin do next?

This page is for triage, not for long-form investigation.

## Problem Statement
The current admin area has become a patchwork of panels and controls.
Some are outdated, some duplicate newer workflows, and some no longer match the platform structure after recent changes.

We need one place to:
- monitor the whole platform
- drill into a specific user, professional, project, payment, or support case
- approve or reject actions where human review is required
- surface certification uploads and other verification signals
- support operations without hunting across disconnected screens

## Design Principles
1. Rank work by urgency, not by module.
2. Show only actionable items at the top.
3. Keep raw history separate from active work.
4. Use one normalized event model for all admin-visible signals.
5. Make every card link to a real workflow and an entity detail view.
6. Prefer drill-down over duplicating controls across multiple pages.

## Information Architecture
### 1. Command Centre Home
The home page should contain:
- live counters
- action required queue
- platform health summary
- people verification lane
- money and approvals lane
- recent activity feed

### 2. Entity Detail Pages
Each important entity should have a detail page with context and actions:
- user
- professional
- project
- certification
- payment
- support request
- site access request
- conversation/thread

### 3. Workflow Review Pages
These should exist only for complex review flows:
- professional verification review
- certification verification review
- payment approval / refund review
- support escalation review
- manual intervention / exception handling

### 4. Audit and History Views
Use for read-only traceability:
- event history
- admin actions history
- workflow transitions
- status changes

## Homepage Layout
### Top Strip
Show compact counters for:
- pending professional verifications
- pending certification verifications
- payment approvals needed
- support escalations
- site access requests
- blocked workflows
- failed integrations or jobs

### Action Required Queue
This is the primary work list.
Sort by:
- severity
- age
- SLA risk
- dependency blocking

Each item should include:
- title
- domain
- status
- created time
- priority
- quick actions
- link to detail page

### Platform Health
Show system-level issues such as:
- failed API calls
- failed webhooks
- sync problems
- job failures
- payment processor issues
- messaging or notification delivery issues

### People Lane
Show operational review items related to people:
- professional account verification
- BRC submission
- certification uploads
- identity or document review
- support requests from users or professionals

### Money Lane
Show finance-related items:
- escrow release requests
- manual payment approvals
- refunds
- fee exceptions
- payment reconciliation issues

### Recent Activity Feed
A normalized stream of recent events.
This is not the main work queue.
It is for awareness and traceability.

## Unified Event Model
Every admin-visible signal should be represented by a single normalized event shape.

Suggested fields:
- id
- type
- domain
- severity
- actorType
- actorId
- targetType
- targetId
- title
- summary
- status
- actionRequired
- assignedTo
- source
- createdAt
- updatedAt
- resolvedAt
- metadata

### Example Domains
- support
- professional-verification
- certification-verification
- payment
- project
- site-access
- messaging
- system

### Severity Levels
- info
- low
- medium
- high
- critical

## Required Signals
The frontend and backend should emit structured signals for:
- professional verification submitted
- certification uploaded
- certification ready for review
- certification approved
- certification rejected
- BRC submitted
- BRC approved or rejected
- payment approval requested
- escrow release requested
- refund requested
- support request opened
- support request escalated
- site access requested
- site access approved or rejected
- message flagged for admin attention
- job or integration failure

## Signal Routing Rules
Each signal should project into one or more surfaces:
- admin home queue
- entity detail timeline
- notification centre
- audit log
- messaging / support center

Rules:
- if action is required, it must appear in the action queue
- if no action is required, it belongs in activity or audit only
- if a signal affects money or verification, it must be traceable on the entity detail page

## Current Signals Already Useful
The certification upload flow is a good example of the right pattern.
The platform already surfaces the “ready for verification” signal in the admin home message center.
That should be treated as a model for other workflows.

## What To Keep
These appear to have current operational value:
- certification verification flow
- support messaging centre
- payment approval workflows
- professional review workflows
- site access and project status controls

## What To Review For Retirement Or Folding In
These should be audited and either retired, folded into the command centre, or rewritten to use the shared workflow model:
- duplicate verification panels
- legacy controls that no longer match platform data structures
- single-purpose pages that do not write back to the workflow state
- panels that duplicate data shown elsewhere without adding action

## Admin User Journey
1. Open admin home.
2. Review the top action queue.
3. Open the most urgent item.
4. Use the detail page to inspect context.
5. Approve, reject, request more info, assign, snooze, or mark resolved.
6. Return to the queue.

## Recommended Actions Available On Every Work Item
- approve
- reject
- request more info
- assign
- snooze
- open entity
- mark resolved

## Implementation Notes
### Frontend
- Build one normalized admin work-item card component.
- Use the same event rendering model across message centre, verification views, and alert surfaces.
- Avoid hardcoding module-specific logic into the homepage.

### Backend
- Emit structured workflow events from all major admin-relevant actions.
- Persist events in a central admin event table or event projection.
- Keep workflow state authoritative in the backend.

### Data Flow
- user action or system event
- backend writes normalized event
- frontend projects event into relevant views
- admin acts on item
- backend updates workflow state and emits follow-up event

## Minimum Viable Homepage
If the command centre must be delivered in stages, the minimum useful version is:
- top counters
- action required queue
- recent activity feed
- professional verification lane
- certification lane
- support lane

## Definition Of Done
The homepage is ready when:
- every critical admin workflow is visible in one place
- action-required items are clearly ranked
- certification uploads and verification requests appear reliably
- old panels no longer need to be used for core operations
- each card links to a real detail or review action
- admin work can be traced from signal to resolution

## Admin Screen Inventory

| Path | Purpose | Recommendation | Rationale |
| --- | --- | --- | --- |
| /admin | Admin command centre dashboard | keep | This is already the central ops hub and should become the primary triage page. |
| /admin/users | User CRUD and admin creation | keep | Direct user management is still a real back-office need. |
| /admin/trades | Trade taxonomy, translations, and service mappings | fold into command centre | This is data-control tooling and belongs inside the central admin cluster. |
| /admin/support | Support request triage queue | fold into command centre | Valuable workflow, but it overlaps with the dashboard and messaging surfaces. |
| /admin/reports | Professional report moderation queue | fold into command centre | Useful moderation work, but it should live inside the central workflow board. |
| /admin/messaging | Unified comms console for assist, chat, and conversations | fold into command centre | This is the right functionality, but it belongs under one ops console rather than as a separate top-level surface. |
| /admin/questionnaires | Questionnaire lifecycle management | keep | Distinct product module with real admin workflow. |
| /admin/foh-inbox | Legacy inbox list over the chat admin inbox | retire | Thin duplicate of the newer messaging console. |
| /admin/foh-inbox/[id] | Legacy thread detail and reply view | replace | Should deep-link into the unified messaging thread view instead. |
| /admin/projects | Project list with archive/delete and drilldowns | keep | Core operational surface for project administration. |
| /admin/projects/[id] | Project detail, safety, finance, AI scope, updates | keep | Highest-value operational screen in the admin area. |
| /admin/projects/[id]/tokens | Project email token list | replace | Auxiliary drilldown that belongs inside the parent project view. |
| /admin/projects/[id]/professionals | Invited professionals, responses, and quotes | replace | Another project drilldown that should be absorbed into the parent view. |
| /admin/changelog | Internal release notes and hook-health feed | keep | Lightweight operational visibility into changes and automation health. |
| /admin/assist | Assist request console | keep | Real working queue for FOH help requests. |
| /admin/announcements | Home card rail publishing/editing | fold into command centre | Content/config tooling that fits better under centralized admin controls. |
| /admin/activity-log | Platform audit trail | keep | Compliance and debugging surface that should remain easy to reach. |
| /admin/next-steps | DB-backed modal content editor for next-step actions | fold into command centre | Global configuration/editing, not a standalone destination. |
| /admin/analytics | AI observability and consultation funnel metrics | keep | Active monitoring surface with operational value. |
| /admin/analytics/purge-audit | Hard-delete purge audit log | keep | Compliance-grade audit trail for destructive actions. |
| /admin/policies | Policy version management | fold into command centre | Important config/legal tooling, better centralized than standalone. |
| /admin/professionals | Professional directory, certifications, BRC checks, backfill | keep | Serious back-office workbench with unique workflows. |
| /admin/profile | Admin profile settings | keep | Low-risk utility screen for the logged-in admin. |

### Quick Scorecard
- Keep: core operational surfaces that support unique workflows and need direct access.
- Fold into command centre: queues or config tools that should be reachable from the main triage page.
- Replace: drilldowns that should become tabs or panels inside a parent entity page.
- Retire: legacy duplicate surfaces that no longer add value.

### Priority Cleanup Order
1. Retire the legacy FOH inbox routes.
2. Fold messaging, support, reports, announcements, next-steps, and policies into the command centre.
3. Replace project subroutes with tabs or panels on the main project detail page.
4. Keep professionals, projects, users, questionnaires, analytics, activity log, and assist as core surfaces.

## Next Step
Start the migration using the phased plan below.

## Admin Migration Plan

### Outcomes
- One primary triage surface at /admin
- No duplicate operational queues across admin routes
- Every action-required workflow represented by normalized signals
- Legacy and redundant routes removed only after parity checks pass

### Guardrails
1. No big-bang rewrite. Migrate one workflow cluster per phase.
2. Keep old routes available until parity is proven.
3. Introduce route redirects only after 7 days of stable usage for the new destination.
4. Every migrated flow must have: queue card, detail drilldown, action outcome, audit trail.

### Phase 0: Baseline and instrumentation
Goal: make migration measurable before moving routes.

Deliver:
- Baseline usage map for each admin route (visits, actions, completion rate)
- Current signal coverage map by domain (support, verification, payment, project, system)
- Command centre parity checklist template

Exit criteria:
- Baseline metrics captured for all routes in the scorecard
- Signal coverage gaps documented and prioritized

### Phase 1: Command centre shell hardening
Goal: make /admin the stable entry point for all operational work.

Deliver:
- Standardized sections on /admin:
	- Action Required Queue
	- Platform Health
	- People and Verification
	- Money and Approvals
	- Recent Activity
- Shared work-item card model used by all sections
- Stable deep-link patterns from queue cards to destination workflows

Exit criteria:
- Admin can complete at least one end-to-end workflow from /admin without manual route hunting

### Phase 2: Messaging and support consolidation
Routes in scope:
- /admin/messaging (fold)
- /admin/support (fold)
- /admin/foh-inbox (retire)
- /admin/foh-inbox/[id] (replace)

Deliver:
- Single communications workstream launched from /admin queue
- Legacy FOH inbox routes converted to redirects into messaging thread destinations
- Support escalation cards emitted into the same queue model

Signal dependencies:
- support request opened
- support request escalated
- message flagged for admin attention
- assist unread or pending state change

Exit criteria:
- 100 percent of FOH inbox actions possible via /admin and /admin/messaging
- No operational dependency on /admin/foh-inbox routes

### Phase 3: Moderation and config fold-in
Routes in scope:
- /admin/reports (fold)
- /admin/announcements (fold)
- /admin/next-steps (fold)
- /admin/policies (fold)
- /admin/trades (fold)

Deliver:
- Data control and moderation grouped under command centre side navigation
- Shared approval and edit pattern for config changes
- Audit events emitted for each config mutation

Signal dependencies:
- policy version published
- next-step content updated
- announcement published or archived
- trade mapping changed
- moderation action completed

Exit criteria:
- All folded tools reachable from /admin information architecture
- No standalone top-level route needed for routine operation

### Phase 4: Project route replacement
Routes in scope:
- /admin/projects/[id]/tokens (replace)
- /admin/projects/[id]/professionals (replace)

Deliver:
- Tokens and professionals moved into tabs or panels within /admin/projects/[id]
- Old subroutes left as temporary redirects to anchored tabs

Signal dependencies:
- project token generated or revoked
- professional invited or responded
- quote lifecycle changes tied to project

Exit criteria:
- Project detail is the single source of truth for project-level admin actions

### Phase 5: Keep surfaces optimization
Routes in scope (keep, optimize only):
- /admin/projects
- /admin/projects/[id]
- /admin/professionals
- /admin/users
- /admin/assist
- /admin/questionnaires
- /admin/activity-log
- /admin/analytics
- /admin/analytics/purge-audit
- /admin/changelog
- /admin/profile

Deliver:
- Unified queue entry points from /admin into each keep surface
- Consistent status and severity badges
- Consistent audit trail links back to /admin/activity-log

Exit criteria:
- Keep surfaces have clear responsibility boundaries and no duplicate queue ownership

### Route action matrix

| Route | Action | Target state | Removal condition |
| --- | --- | --- | --- |
| /admin/foh-inbox | retire | Redirect to /admin/messaging | 7 days no unique actions on legacy route |
| /admin/foh-inbox/[id] | replace | Redirect to canonical messaging thread path | Thread actions and replies verified in new path |
| /admin/projects/[id]/tokens | replace | Tab or panel in /admin/projects/[id] | Token operations fully supported in parent page |
| /admin/projects/[id]/professionals | replace | Tab or panel in /admin/projects/[id] | Invite/response/quote actions verified in parent page |
| /admin/messaging | fold | Operates as command centre workflow section | Queue ownership centralized in /admin |
| /admin/support | fold | Operates as command centre workflow section | Escalation and assignment visible in /admin queue |
| /admin/reports | fold | Moderation section under command centre | Moderation actions available from /admin |
| /admin/announcements | fold | Data control section under command centre | Publish/archive events visible in audit |
| /admin/next-steps | fold | Data control section under command centre | Edits routed via centralized config tools |
| /admin/policies | fold | Data control section under command centre | Policy publish workflow integrated with audit and queue |
| /admin/trades | fold | Data control section under command centre | Mapping updates accessible via centralized controls |

### Signal readiness matrix

| Domain | Minimum signals required before migration | Primary consumers |
| --- | --- | --- |
| Messaging and support | message flagged, support opened, support escalated, assignment changed | /admin queue, /admin/messaging, activity log |
| Verification | certification uploaded, verification ready, verified, rejected, BRC submitted | /admin queue, /admin/professionals, activity log |
| Payments | approval requested, escrow release requested, refund requested, payment exception raised | /admin queue, project detail, audit trail |
| Project ops | token generated or revoked, professional invited or responded, site access decision | /admin queue, /admin/projects/[id], activity log |
| Configuration and moderation | policy updated, content updated, moderation completed, mapping changed | /admin data control sections, activity log |

### Suggested delivery cadence
1. Week 1: Phase 0 and Phase 1
2. Week 2: Phase 2
3. Week 3: Phase 3 and Phase 4
4. Week 4: Phase 5 optimization and legacy route cleanup

### Immediate implementation ticket list
1. Create migration tracker document with one row per route in the action matrix.
2. Add parity checklist template for each fold or replace candidate.
3. Implement FOH inbox redirect plan and thread parity tests.
4. Define project detail tab structure for tokens and professionals.
5. Add missing normalized signals for payments and config edits.
