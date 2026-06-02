# Professional Calendar + Availability + Reminders Spec

Status: Draft
Date: 2026-06-02
Owner: Web + API

## Goal

Extend the existing surveyor scheduling infrastructure to professionals so they can:

1. Set availability windows for new work
2. See their milestone commitments in a calendar
3. Receive automated reminders via chat (→ mobile alerts) and email

---

## 1. Data Model: Professional Availability

### New table: `professional_availability`

```sql
CREATE TABLE professional_availability (
  id              TEXT PRIMARY KEY,
  "professionalId" TEXT NOT NULL REFERENCES "Professional"(id) ON DELETE CASCADE,
  "dayOfWeek"     INTEGER,           -- 0=Sun..6=Sat, NULL means date-specific
  "date"          DATE,              -- NULL means recurring by dayOfWeek
  "startTime"     TIME,              -- NULL means all day
  "endTime"       TIME,              -- NULL means all day
  "maxProjects"   INTEGER DEFAULT 1, -- how many overlapping jobs they can handle
  "availableForEmergency" BOOLEAN DEFAULT false, -- overrides emergencyCalloutAvailable for this window
  "notes"         TEXT,
  "createdAt"     TIMESTAMPTZ DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT chk_day_or_date CHECK (
    ("dayOfWeek" IS NOT NULL AND "date" IS NULL) OR
    ("dayOfWeek" IS NULL AND "date" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX ux_professional_availability_recurring
  ON professional_availability ("professionalId", "dayOfWeek", "startTime", "endTime")
  WHERE "date" IS NULL;

CREATE UNIQUE INDEX ux_professional_availability_date
  ON professional_availability ("professionalId", "date", "startTime", "endTime")
  WHERE "dayOfWeek" IS NULL;
```

### Design decisions

- **Recurring + date-specific**: Professionals set recurring weekly windows (e.g. Mon–Fri 9–5) and override specific dates (e.g. Dec 25 unavailable).
- **No slots, just windows**: Unlike surveyors who book 30-min slots, professionals work in half-day or full-day blocks. Simpler and matches how trades operate.
- **`maxProjects` cap**: Prevents overbooking. A professional with `maxProjects=2` could work on 2 milestones simultaneously.
- **`availableForEmergency`**: Per-window override so a pro can say "I do emergency on weekdays but not weekends."

### API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/professionals/:id/availability` | List windows for a professional |
| POST | `/professionals/me/availability` | Set own availability (professionals only) |
| PUT | `/professionals/me/availability/:windowId` | Update a window |
| DELETE | `/professionals/me/availability/:windowId` | Remove a window |
| GET | `/professionals/me/availability/conflicts` | Check conflicts with existing milestones |

---

## 2. Data Model: Milestone Reminder Preferences

### Extend `ProjectMilestone` (or use JSON metadata)

Add a `reminderConfig` JSON column to `ProjectMilestone`:

```json
{
  "remindBeforeMinutes": [1440, 60],
  "remindVia": ["chat", "email"],
  "lastRemindedAt": {
    "dayBefore": "2026-06-02T09:00:00+08:00",
    "hourBefore": null
  }
}
```

- `remindBeforeMinutes`: Array of offsets. Default `[1440, 60]` = 1 day + 1 hour before.
- `remindVia`: Which channels to use. Default `["chat", "email"]`.
- `lastRemindedAt`: Idempotency tracker per offset. Prevents duplicate sends if cron runs twice.

---

## 3. Reminder Trigger Logic

### Extend `ReminderService.sendDayBeforeReminders()`

Current behavior: sends reminders for site visits only.

New behavior (add these queries in the same cron run):

```typescript
// 1. Milestones starting tomorrow
const tomorrowMilestones = await this.prisma.projectMilestone.findMany({
  where: {
    status: { in: ['not_started', 'in_progress'] },
    plannedStartDate: {
      gte: tomorrowStart,
      lt: tomorrowEnd,
    },
    projectProfessional: {
      professionalId: { not: null },
    },
  },
  include: {
    project: { select: { id: true, projectName: true } },
    projectProfessional: {
      select: {
        professional: {
          select: { id: true, fullName: true, businessName: true, phone: true, email: true },
        },
      },
    },
  },
});

// 2. Milestones starting in ~1 hour (within a 90-min window to catch cron timing)
const soonMilestones = await this.prisma.projectMilestone.findMany({
  where: {
    status: { in: ['not_started', 'in_progress'] },
    plannedStartDate: {
      gte: oneHourFromNow,
      lt: ninetyMinutesFromNow,
    },
    // same includes...
  },
});
```

### Reminder message format (chat)

Post to the project's professional chat thread:

```typescript
const reminderMessage = buildStructuredChatEventMessage({
  type: 'generic',
  icon: '📅',
  title: `Reminder: ${milestone.title}`,
  summary: [
    `Project: ${milestone.project.projectName}`,
    milestone.plannedStartDate
      ? `Starts: ${formatDate(milestone.plannedStartDate)}`
      : '',
    milestone.siteAccessRequired
      ? 'Site access required — confirm your visit time.'
      : '',
  ].filter(Boolean).join('\n'),
});

await this.chatService.addProjectMessage(
  thread.id,
  'system',
  reminderMessage,
  [],
);
```

### Idempotency

Use the existing `ReminderLog` table with reminder keys scoped per milestone:

```
milestone:{milestoneId}:dayBefore:{date}
milestone:{milestoneId}:hourBefore:{date}
```

Same pattern as current `visit:{visitId}:client:{date}` keys.

---

## 4. Mobile Alert Flow

1. Cron fires reminder → chat message posted to project thread
2. Mobile app listens for new chat messages via existing realtime/notification channel
3. Mobile notification is triggered by the chat message arrival
4. Professional taps notification → opens mobile app → lands on project chat or calendar

No new mobile infrastructure needed if chat notifications already work.

---

## 5. Implementation Phases

### Phase A: Availability model + API (1–2 days)

**Files:**
- Prisma schema: add `professional_availability` model
- Migration: run create
- API: new controller `professional-availability.controller.ts`
- API: new service `professional-availability.service.ts`
- Web: professional settings page with availability grid

**Done when:** Professional can set recurring weekly windows and date-specific overrides.

### Phase B: Milestone reminders (0.5–1 day)

**Files:**
- Prisma schema: add `reminderConfig` JSON to `ProjectMilestone`
- Migration: run alter
- API: extend `ReminderService` with milestone queries
- API: post reminder events to chat threads

**Done when:** Day-before and 1-hour-before reminders fire for scheduled milestones.

### Phase C: Calendar UI polish (1 day)

**Files:**
- `professional/calendar/page.tsx`: add week/day views, conflict indicators, "set availability" button
- Show availability vs booked milestones visually

**Done when:** Professional can view their week with availability and commitments in one view.

---

## 6. Rollback Plan

- Availability table is additive — no existing data affected
- `reminderConfig` column defaults to NULL — existing milestones unchanged
- Reminder cron additions are gated by new reminder keys — won't collide with existing site-visit keys
- Rollback: drop new table, drop new column, revert reminder cron code
