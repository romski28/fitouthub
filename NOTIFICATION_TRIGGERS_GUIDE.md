# Additional Notification Triggers Implementation Guide

## Overview
This document outlines where to add notification triggers for payment/milestone events and deadline reminders.

---

## 1. Payment Received Notification

**Location:** `apps/api/src/financial/financial.service.ts` - `updateTransaction()` method

**When to trigger:**
When a financial transaction status changes to `'confirmed'` or `'completed'`

**Implementation:**
```typescript
// In updateTransaction() method, after TX is confirmed:
if (updatedTx.status === 'confirmed' && updatedTx.type === 'escrow_deposit') {
  // Notify professional that payment was received
  const projectProfessional = await this.prisma.projectProfessional.findUnique({
    where: { id: updatedTx.projectProfessionalId },
    include: { professional: true },
  });

  await this.notificationService.send({
    professionalId: projectProfessional.professional.id,
    phoneNumber: projectProfessional.professional.phone,
    eventType: 'payment_received',
    message: `Payment of $${updatedTx.amount} received for project. Funds are now in escrow.`,
  });
}
```

**Notification Service Injection:**
Add to constructor: `private notificationService: NotificationService`

**Files to modify:**
- `apps/api/src/financial/financial.service.ts` - Add notification imports + calls in updateTransaction()

---

## 2. Milestone Completed Notification

**Location:** `apps/api/src/milestones/milestones.service.ts` - `completeMilestone()` or `updateMilestone()` method

**When to trigger:**
When milestone status changes to `'completed'` or `'released'`

**Implementation Pattern:**
```typescript
// After milestone is marked complete:
const projectProfessional = await this.prisma.projectProfessional.findFirst({
  where: { projectId: milestone.projectId },
  include: { professional: true },
});

// Notify professional
await this.notificationService.send({
  professionalId: projectProfessional.professional.id,
  phoneNumber: projectProfessional.professional.phone,
  eventType: 'milestone_completed',
  message: `Milestone "${milestone.title}" has been completed and payment released.`,
});

// Notify client if needed
if (project.client?.mobile) {
  await this.notificationService.send({
    userId: project.clientId,
    phoneNumber: project.client.mobile,
    eventType: 'milestone_completed',
    message: `Milestone "${milestone.title}" completed by contractor.`,
  });
}
```

**Files to modify:**
- `apps/api/src/milestones/milestones.service.ts` - Add notification imports + calls

---

## 3. Project Deadline Reminder (Cron Job)

**Location:** New file - `apps/api/src/tasks/deadline-reminder.task.ts`

**When to trigger:**
Daily cron job that:
- Finds projects with deadlines in next 2 days
- Sends reminder notification to professional and client

**Implementation Pattern:**

### Create Task Service:
```typescript
// apps/api/src/tasks/deadline-reminder.task.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class DeadlineReminderTask {
  private readonly logger = new Logger(DeadlineReminderTask.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendDeadlineReminders() {
    this.logger.log('[DeadlineReminder] Starting deadline check...');
    
    const today = new Date();
    const twoDaysFromNow = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Find projects with deadlines in next 2 days
    const upcomingProjects = await this.prisma.project.findMany({
      where: {
        endDate: {
          gte: today,
          lte: twoDaysFromNow,
        },
        status: { in: ['awarded', 'in-progress'] },
      },
      include: {
        client: true,
        professionals: {
          where: { status: 'awarded' },
          include: { professional: true },
        },
      },
    });

    for (const project of upcomingProjects) {
      // Notify professional
      if (project.professionals[0]?.professional?.phone) {
        await this.notificationService.send({
          professionalId: project.professionals[0].professional.id,
          phoneNumber: project.professionals[0].professional.phone,
          eventType: 'deadline_reminder',
          message: `Reminder: Project "${project.projectName}" deadline is ${project.endDate?.toLocaleDateString()}. Only 2 days left!`,
        });
      }

      // Notify client
      if (project.client?.mobile) {
        await this.notificationService.send({
          userId: project.clientId,
          phoneNumber: project.client.mobile,
          eventType: 'deadline_reminder',
          message: `Reminder: Your project "${project.projectName}" deadline is ${project.endDate?.toLocaleDateString()}.`,
        });
      }
    }

    this.logger.log(`[DeadlineReminder] Sent reminders for ${upcomingProjects.length} projects`);
  }
}
```

### Register in App Module:
```typescript
// In app.module.ts
import { DeadlineReminderTask } from './tasks/deadline-reminder.task';

@Module({
  imports: [
    ScheduleModule.forRoot(),  // Add if not already there
    // ... other imports
  ],
  providers: [DeadlineReminderTask],
})
export class AppModule {}
```

**Files to create/modify:**
- `apps/api/src/tasks/deadline-reminder.task.ts` (NEW)
- `apps/api/src/app.module.ts` (ADD ScheduleModule import & provider)

---

## 4. Quote Response Notifications (Already Partially Added)

**Where to add:**
- In `awardQuote()` - notify client when they select a professional ✅ (can be added easily)
- In `submitQuote()` - add WhatsApp notification to client alongside email ✅ (can be added easily)

**Quick additions to projects.service.ts:**

### In submitQuote() - after email is sent (line ~1275):
```typescript
// Notify client via WhatsApp about new quote
try {
  const client = await this.prisma.client.findUnique({
    where: { id: projectProfessional.project.clientId },
  });
  
  if (client?.phone) {
    await this.notificationService.send({
      userId: projectProfessional.project.clientId,
      phoneNumber: client.phone,
      eventType: 'quote_submitted',
      message: `New quote received from ${professionalName} for "${projectProfessional.project.projectName}": $${quoteAmount}`,
    });
  }
} catch (error) {
  this.logger.error('Failed to send quote notification:', error);
  // Don't fail the operation if notification fails
}
```

### In awardQuote() - after professional is notified (line ~2530):
```typescript
// Notify client that they've selected a professional
try {
  if (projectProfessional.project.client?.phone) {
    await this.notificationService.send({
      userId: projectProfessional.project.clientId,
      phoneNumber: projectProfessional.project.client.phone,
      eventType: 'professional_selected',
      message: `You've selected ${winnerName} for "${project.projectName}". They've been notified and will contact you soon.`,
    });
  }
} catch (error) {
  this.logger.error('Failed to send selection notification:', error);
}
```

---

## Summary of Work Required

| Task | Complexity | Time Est | Priority |
|------|-----------|----------|----------|
| Payment notifications | Low | 15 min | High |
| Milestone notifications | Low | 15 min | High |
| Deadline reminder cron | Medium | 30 min | Medium |
| Quote response notifications | Low | 10 min | High |

**Total estimated time:** ~70 minutes

---

## Testing Checklist

- [ ] Trigger payment confirmation and verify notification sent
- [ ] Complete milestone and verify notification sent
- [ ] Verify cron job runs at scheduled time
- [ ] Verify professionals receive deadline reminders
- [ ] Verify clients receive deadline reminders
- [ ] Test quote submission notifications
- [ ] Test professional selection notifications

---

## Notes

1. All notifications respect the professional's NotificationPreference settings
2. Channel fallback (WhatsApp → SMS) is handled automatically by NotificationService
3. Add `this.notificationService: NotificationService` via constructor injection where needed
4. Always wrap notifications in try-catch to prevent transaction failures
5. Use existing `eventType` values or create new ones as needed
6. Test with your test mobile number before deploying to production
