import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { ChatService } from '../chat/chat.service';
import { PlatformFeeService } from '../common/platform-fee.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { resolve } from 'path';
import { promises as fs } from 'fs';
import { createId } from '@paralleldrive/cuid2';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { ProjectStage } from '@prisma/client';
import { NotificationChannel } from '@prisma/client';
import { extractObjectKeyFromValue, buildPublicAssetUrl } from '../storage/media-assets.util';

type NotificationDeliveryStatus = 'sent' | 'failed' | 'skipped';
type NotificationActorType = 'professional' | 'client' | 'reseller' | 'platform' | 'unknown';

interface NotificationAuditRecipient {
  actorType: NotificationActorType;
  actorId: string;
  role: string;
  email: {
    status: NotificationDeliveryStatus;
    error?: string;
  };
  direct: {
    status: NotificationDeliveryStatus;
    preferredChannel?: NotificationChannel | null;
    channel?: NotificationChannel | null;
    reason?: string;
    error?: string;
  };
}

interface NotificationAuditEvent {
  event: string;
  projectId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  recipients: NotificationAuditRecipient[];
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private chatService: ChatService,
    private platformFeeService: PlatformFeeService,
    private notificationService: NotificationService,
  ) {}

  private readonly STATUS_ORDER = [
    'withdrawn',
    'awarded',
    'quoted',
    'accepted',
    'counter_requested',
    'pending',
    'declined',
  ];

  private readonly ARCHIVED_STATUS = 'archived';
  private readonly PROJECT_SELECTABLE_PROFESSION_TYPES = ['contractor', 'company'] as const;

  private createNotificationAudit(
    event: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): NotificationAuditEvent {
    return {
      event,
      projectId,
      timestamp: new Date().toISOString(),
      metadata,
      recipients: [],
    };
  }

  private pushNotificationAuditRecipient(
    audit: NotificationAuditEvent,
    recipient: NotificationAuditRecipient,
  ): void {
    audit.recipients.push(recipient);
  }

  private async finalizeNotificationAudit(audit: NotificationAuditEvent): Promise<void> {
    const summary = {
      recipients: audit.recipients.length,
      email: {
        sent: audit.recipients.filter((r) => r.email.status === 'sent').length,
        failed: audit.recipients.filter((r) => r.email.status === 'failed').length,
        skipped: audit.recipients.filter((r) => r.email.status === 'skipped').length,
      },
      direct: {
        sent: audit.recipients.filter((r) => r.direct.status === 'sent').length,
        failed: audit.recipients.filter((r) => r.direct.status === 'failed').length,
        skipped: audit.recipients.filter((r) => r.direct.status === 'skipped').length,
      },
    };

    console.log('[ProjectsService.notificationAudit]', {
      ...audit,
      summary,
    });

    try {
      await (this.prisma as any).activityLog.create({
        data: {
          actorName: 'System',
          actorType: 'system',
          action: 'notification_audit',
          resource: 'Project',
          resourceId: audit.projectId,
          details: `Notification audit for ${audit.event}`,
          metadata: {
            ...audit,
            summary,
          },
          status: summary.email.failed > 0 || summary.direct.failed > 0 ? 'warning' : 'success',
        },
      });
    } catch (error) {
      console.error('[ProjectsService.notificationAudit] Failed to persist activity log:', {
        event: audit.event,
        projectId: audit.projectId,
        message: (error as any)?.message,
      });
    }
  }

  private async getProjectSelectableProfessionals(
    ids: string[],
    options?: { requireEmergencyCallout?: boolean },
  ) {
    const professionals = await this.prisma.professional.findMany({
      where: {
        id: { in: ids },
        professionType: { in: [...this.PROJECT_SELECTABLE_PROFESSION_TYPES] },
        ...(options?.requireEmergencyCallout
          ? { emergencyCalloutAvailable: true }
          : {}),
      },
      select: { id: true, email: true, phone: true, fullName: true, businessName: true },
    });

    if (professionals.length !== ids.length) {
      throw new BadRequestException(
        options?.requireEmergencyCallout
          ? 'Emergency projects can only select company/contractor professionals with 24/7 emergency callout availability'
          : 'Only company and contractor professionals can be selected for projects',
      );
    }

    return professionals;
  }

  private betterStatus(
    a?: string | null,
    b?: string | null,
  ): string | null | undefined {
    if (!a) return b;
    if (!b) return a;
    const ia = this.STATUS_ORDER.indexOf(a);
    const ib = this.STATUS_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a;
    if (ia === -1) return b;
    if (ib === -1) return a;
    return ia <= ib ? a : b;
  }

  private dedupeProfessionals(list: any[] | undefined | null): any[] {
    if (!Array.isArray(list) || list.length === 0) return [];
    const map = new Map<string, unknown>();
    for (const entry of list) {
      const e = entry;
      const key = (e?.professional?.id ||
        e?.professional?.email ||
        e?.id) as string;
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...e });
      } else {
        const merged: any = { ...(existing as any) };
        merged.status =
          this.betterStatus((existing as any)?.status, e?.status) ??
          e?.status ??
          (existing as any)?.status;
        if (merged.quoteAmount == null && e?.quoteAmount != null) {
          merged.quoteAmount = e.quoteAmount;
        }
        if (!merged.quoteNotes && e?.quoteNotes) {
          merged.quoteNotes = e.quoteNotes;
        }
        if (!merged.quoteEstimatedStartAt && e?.quoteEstimatedStartAt) {
          merged.quoteEstimatedStartAt = e.quoteEstimatedStartAt;
        }
        if (
          merged.quoteEstimatedDurationMinutes == null &&
          e?.quoteEstimatedDurationMinutes != null
        ) {
          merged.quoteEstimatedDurationMinutes = e.quoteEstimatedDurationMinutes;
        }
        if (!merged.quotedAt && e?.quotedAt) {
          merged.quotedAt = e.quotedAt;
        }
        if (!merged.quoteReminderSentAt && e?.quoteReminderSentAt) {
          merged.quoteReminderSentAt = e.quoteReminderSentAt;
        }
        if (!merged.quoteExtendedUntil && e?.quoteExtendedUntil) {
          merged.quoteExtendedUntil = e.quoteExtendedUntil;
        }
        if (!merged.respondedAt && e?.respondedAt) {
          merged.respondedAt = e.respondedAt;
        }
        map.set(key, merged);
      }
    }
    return Array.from(map.values());
  }

  private canon(s?: string | null): string {
    return (s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private formatDateTime(value?: Date | string | null): string {
    if (!value) return 'TBD';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return 'TBD';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private async addProjectChatMessage(
    projectId: string,
    senderType: 'client' | 'professional',
    senderUserId: string | null,
    senderProId: string | null,
    content: string,
  ): Promise<void> {
    const thread = await this.chatService.getOrCreateProjectThread(projectId);
    await this.chatService.addProjectMessage(
      thread.id,
      senderType,
      senderUserId,
      senderProId,
      content,
    );
  }

  private normalizeQuoteSchedule(
    input: {
      quoteEstimatedStartAt?: string | Date | null;
      quoteEstimatedDurationMinutes?: number | string | null;
      quoteEstimatedDurationUnit?: string | null;
    },
    options?: { required?: boolean },
  ) {
    const rawStart = input.quoteEstimatedStartAt;
    const rawDuration = input.quoteEstimatedDurationMinutes;
    const rawUnit = input.quoteEstimatedDurationUnit || 'hours';
    const hasStart =
      rawStart !== undefined &&
      rawStart !== null &&
      String(rawStart).trim().length > 0;
    const hasDuration =
      rawDuration !== undefined &&
      rawDuration !== null &&
      String(rawDuration).trim().length > 0;

    if (!hasStart && !hasDuration) {
      if (options?.required) {
        throw new BadRequestException(
          'Estimated start date and duration are required when submitting a quote',
        );
      }

      return {
        quoteEstimatedStartAt: null,
        quoteEstimatedDurationMinutes: null,
        quoteEstimatedDurationUnit: 'hours',
      };
    }

    if (!hasStart || !hasDuration) {
      throw new BadRequestException(
        'Estimated start date and duration must be provided together',
      );
    }

    const quoteEstimatedStartAt =
      rawStart instanceof Date ? rawStart : new Date(String(rawStart));
    if (Number.isNaN(quoteEstimatedStartAt.getTime())) {
      throw new BadRequestException('Invalid estimated start date');
    }

    const durationValue = Number(rawDuration);
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      throw new BadRequestException(
        'Estimated duration must be greater than zero',
      );
    }

    // Convert duration to minutes based on unit
    let durationMinutes: number;
    if (rawUnit === 'days') {
      if (durationValue > 365) {
        throw new BadRequestException('Duration in days cannot exceed 365 days');
      }
      durationMinutes = Math.round(durationValue * 24 * 60);
    } else {
      if (durationValue > 60 * 24 * 365) {
        throw new BadRequestException('Estimated duration is too large');
      }
      durationMinutes = Math.round(durationValue * 60);
    }

    if (durationMinutes < 30) {
      throw new BadRequestException(
        'Estimated duration must be at least 30 minutes',
      );
    }

    return {
      quoteEstimatedStartAt,
      quoteEstimatedDurationMinutes: durationMinutes,
      quoteEstimatedDurationUnit: ['hours', 'days'].includes(rawUnit) ? rawUnit : 'hours',
    };
  }

  private normalizeProjectScale(value?: string | null): 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | null {
    if (!value) return null;
    const normalized = String(value).trim().toUpperCase();
    if (normalized === 'SCALE_1' || normalized === 'SCALE_2' || normalized === 'SCALE_3') {
      return normalized;
    }
    return null;
  }

  private inferProjectScaleFromContext(input: {
    explicitScale?: string | null;
    quoteEstimatedDurationMinutes?: number | null;
    tradesRequired?: string[] | null;
    isEmergency?: boolean | null;
  }): 'SCALE_1' | 'SCALE_2' | 'SCALE_3' {
    const explicit = this.normalizeProjectScale(input.explicitScale);
    if (explicit) return explicit;

    const duration = Number(input.quoteEstimatedDurationMinutes || 0);
    const trades = Array.isArray(input.tradesRequired)
      ? input.tradesRequired.filter(Boolean).length
      : 0;

    if (duration > 0) {
      if (duration <= 24 * 60 && trades <= 1) return 'SCALE_1';
      if (duration <= 14 * 24 * 60 && trades <= 3) return 'SCALE_2';
      return 'SCALE_3';
    }

    if (input.isEmergency && trades <= 1) return 'SCALE_1';
    if (trades <= 1) return 'SCALE_1';
    if (trades <= 3) return 'SCALE_2';
    return 'SCALE_3';
  }

  private escrowPolicyForScale(scale: 'SCALE_1' | 'SCALE_2' | 'SCALE_3'): 'FULL_UPFRONT' | 'ROLLING_TWO_MILESTONES' {
    return scale === 'SCALE_3' ? 'ROLLING_TWO_MILESTONES' : 'FULL_UPFRONT';
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private buildScaleMilestones(input: {
    scale: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
    totalAmount: number;
    startAt?: Date | null;
    durationMinutes?: number | null;
  }) {
    const { scale, totalAmount } = input;
    const safeTotal = this.roundMoney(Math.max(0, Number(totalAmount) || 0));

    const percentages =
      scale === 'SCALE_1'
        ? [30, 70]
        : scale === 'SCALE_2'
          ? [20, 50, 30]
          : [10, 20, 20, 20, 30];

    const titles =
      scale === 'SCALE_1'
        ? ['Site Preparation', 'Final Handover']
        : scale === 'SCALE_2'
          ? ['Site Preparation', 'Milestone 1', 'Final Handover']
          : [
              'Site Preparation',
              'Milestone 1',
              'Milestone 2',
              'Milestone 3',
              'Final Handover',
            ];

    const types =
      scale === 'SCALE_1'
        ? ['deposit', 'final']
        : scale === 'SCALE_2'
          ? ['deposit', 'progress', 'final']
          : ['deposit', 'progress', 'progress', 'progress', 'final'];

    const count = percentages.length;
    const startAt = input.startAt && !Number.isNaN(input.startAt.getTime()) ? input.startAt : null;
    const safeDurationMinutes = Math.max(0, Number(input.durationMinutes) || 0);

    const baseRows = percentages.map((percent, index) => {
      const amount = this.roundMoney((safeTotal * percent) / 100);
      let plannedDueAt: Date | null = null;

      if (startAt) {
        if (index === 0) {
          plannedDueAt = new Date(startAt);
        } else if (safeDurationMinutes > 0 && count > 1) {
          const offset = Math.round((safeDurationMinutes * index) / (count - 1));
          plannedDueAt = new Date(startAt.getTime() + offset * 60 * 1000);
        }
      }

      return {
        sequence: index + 1,
        title: titles[index],
        type: types[index] as 'deposit' | 'progress' | 'final',
        percentOfTotal: percent,
        amount,
        plannedDueAt,
      };
    });

    const sumBeforeLast = this.roundMoney(
      baseRows.slice(0, -1).reduce((acc, row) => acc + row.amount, 0),
    );
    const lastAmount = this.roundMoney(Math.max(0, safeTotal - sumBeforeLast));
    if (baseRows.length > 0) {
      baseRows[baseRows.length - 1].amount = lastAmount;
    }

    return baseRows;
  }

  private addMonths(source: Date, months: number): Date {
    const date = new Date(source);
    date.setMonth(date.getMonth() + months);
    return date;
  }

  private toValidDate(input?: Date | string | null): Date | null {
    if (!input) return null;
    const value = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }

  private async ensureFinancialProjectMilestoneLinks(tx: any, input: {
    projectId: string;
    projectProfessionalId?: string | null;
    paymentMilestones: Array<{
      id: string;
      sequence: number;
      title: string;
      plannedDueAt?: Date | null;
      projectMilestoneId?: string | null;
    }>;
  }) {
    const existingFinancialRows = await tx.projectMilestone.findMany({
      where: {
        projectId: input.projectId,
        projectProfessionalId: input.projectProfessionalId || null,
        isFinancial: true,
      },
      orderBy: { sequence: 'asc' },
    });
    const financialBySequence = new Map<number, any>(
      existingFinancialRows.map((row: any) => [row.sequence, row]),
    );

    const orderedPaymentMilestones = [...input.paymentMilestones].sort(
      (a, b) => (a.sequence || 0) - (b.sequence || 0),
    );

    let previousPlannedDueAt: Date | null = null;

    for (const paymentMilestone of orderedPaymentMilestones) {
      let linkedProjectMilestone: any = null;
      const sequence = Number(paymentMilestone.sequence) || 0;
      const plannedEndDate = paymentMilestone.plannedDueAt || null;
      const computedPlannedStartDate =
        sequence <= 1 ? plannedEndDate : previousPlannedDueAt;

      if (paymentMilestone.projectMilestoneId) {
        linkedProjectMilestone = await tx.projectMilestone.findFirst({
          where: {
            id: paymentMilestone.projectMilestoneId,
            projectId: input.projectId,
          },
        });
      }

      if (!linkedProjectMilestone) {
        const existingBySequence = financialBySequence.get(paymentMilestone.sequence);
        if (existingBySequence) {
          linkedProjectMilestone = await tx.projectMilestone.update({
            where: { id: existingBySequence.id },
            data: {
              title: paymentMilestone.title,
              plannedStartDate:
                computedPlannedStartDate || existingBySequence.plannedStartDate || null,
              plannedEndDate: plannedEndDate || existingBySequence.plannedEndDate || null,
              isFinancial: true,
            },
          });
        } else {
          linkedProjectMilestone = await tx.projectMilestone.create({
            data: {
              projectId: input.projectId,
              projectProfessionalId: input.projectProfessionalId || null,
              title: paymentMilestone.title,
              sequence: paymentMilestone.sequence,
              status: 'not_started',
              percentComplete: 0,
              plannedStartDate: computedPlannedStartDate,
              plannedEndDate,
              isFinancial: true,
            },
          });
        }
      } else if (!linkedProjectMilestone.isFinancial) {
        linkedProjectMilestone = await tx.projectMilestone.update({
          where: { id: linkedProjectMilestone.id },
          data: {
            isFinancial: true,
            plannedStartDate:
              computedPlannedStartDate || linkedProjectMilestone.plannedStartDate || null,
            plannedEndDate: plannedEndDate || linkedProjectMilestone.plannedEndDate || null,
          },
        });
      } else {
        linkedProjectMilestone = await tx.projectMilestone.update({
          where: { id: linkedProjectMilestone.id },
          data: {
            plannedStartDate:
              linkedProjectMilestone.plannedStartDate || computedPlannedStartDate || null,
            plannedEndDate: plannedEndDate || linkedProjectMilestone.plannedEndDate || null,
          },
        });
      }

      if (!linkedProjectMilestone) {
        throw new BadRequestException('Unable to link payment milestone to project milestone');
      }

      await tx.paymentMilestone.update({
        where: { id: paymentMilestone.id },
        data: {
          projectMilestoneId: linkedProjectMilestone.id,
          plannedDueAt:
            paymentMilestone.plannedDueAt ||
            linkedProjectMilestone.plannedEndDate ||
            null,
        },
      });

      previousPlannedDueAt = plannedEndDate || previousPlannedDueAt;
    }
  }

  private async ensureProjectPaymentPlan(tx: any, input: {
    projectId: string;
    projectProfessionalId?: string | null;
    totalAmount: number;
    explicitScale?: string | null;
    quoteEstimatedDurationMinutes?: number | null;
    quoteEstimatedStartAt?: Date | string | null;
    tradesRequired?: string[] | null;
    isEmergency?: boolean | null;
  }) {
    const scale = this.inferProjectScaleFromContext({
      explicitScale: input.explicitScale,
      quoteEstimatedDurationMinutes: input.quoteEstimatedDurationMinutes,
      tradesRequired: input.tradesRequired,
      isEmergency: input.isEmergency,
    });
    const escrowPolicy = this.escrowPolicyForScale(scale);
    const totalAmount = this.roundMoney(input.totalAmount);
    const quoteStart =
      input.quoteEstimatedStartAt instanceof Date
        ? input.quoteEstimatedStartAt
        : input.quoteEstimatedStartAt
          ? new Date(input.quoteEstimatedStartAt)
          : null;
    const safeDurationMinutes = Math.max(0, Number(input.quoteEstimatedDurationMinutes) || 0);
    const completionAt =
      quoteStart && safeDurationMinutes > 0
        ? new Date(quoteStart.getTime() + safeDurationMinutes * 60 * 1000)
        : null;
    const defaultRetentionReleaseAt = completionAt ? this.addMonths(completionAt, 1) : null;

    const milestoneRows = this.buildScaleMilestones({
      scale,
      totalAmount,
      startAt: quoteStart,
      durationMinutes: input.quoteEstimatedDurationMinutes || null,
    });

    const existing = await tx.projectPaymentPlan.findUnique({
      where: { projectId: input.projectId },
      include: { milestones: true },
    });

    if (existing?.lockedAt) {
      return existing;
    }

    const baseData = {
      projectProfessionalId: input.projectProfessionalId || null,
      projectScale: scale,
      escrowFundingPolicy: escrowPolicy,
      totalAmount: new Decimal(totalAmount),
      depositCapPercent: scale === 'SCALE_1' ? 30 : scale === 'SCALE_2' ? 20 : 10,
      fundingBufferMilestones: scale === 'SCALE_3' ? 2 : null,
      retentionEnabled: existing?.retentionEnabled ?? false,
      retentionPercent:
        scale === 'SCALE_3'
          ? new Decimal(existing?.retentionPercent ?? 5)
          : null,
      retentionAmount:
        scale === 'SCALE_3' && existing?.retentionEnabled
          ? new Decimal(this.roundMoney((totalAmount * Number(existing?.retentionPercent ?? 5)) / 100))
          : null,
      retentionReleaseAt:
        scale === 'SCALE_3'
          ? existing?.retentionReleaseAt || defaultRetentionReleaseAt
          : null,
      status: 'draft',
    };

    const plan = existing
      ? await tx.projectPaymentPlan.update({
          where: { id: existing.id },
          data: baseData,
        })
      : await tx.projectPaymentPlan.create({
          data: {
            projectId: input.projectId,
            ...baseData,
          },
        });

    await tx.paymentMilestone.deleteMany({ where: { paymentPlanId: plan.id } });
    const createdMilestones: any[] = [];
    if (milestoneRows.length > 0) {
      for (const row of milestoneRows) {
        const created = await tx.paymentMilestone.create({
          data: {
          paymentPlanId: plan.id,
          sequence: row.sequence,
          title: row.title,
          type: row.type,
          amount: new Decimal(row.amount),
          percentOfTotal: row.percentOfTotal,
          plannedDueAt: row.plannedDueAt,
          },
        });
        createdMilestones.push(created);
      }
      await this.ensureFinancialProjectMilestoneLinks(tx, {
        projectId: input.projectId,
        projectProfessionalId: input.projectProfessionalId || null,
        paymentMilestones: createdMilestones,
      });
    }

    await tx.project.update({
      where: { id: input.projectId },
      data: {
        projectScale: scale,
        escrowFundingPolicy: escrowPolicy,
      } as any,
    });

    return tx.projectPaymentPlan.findUnique({
      where: { id: plan.id },
      include: {
        milestones: {
          orderBy: { sequence: 'asc' },
        },
      },
    });
  }

  async getProjectPaymentPlan(
    projectId: string,
    actorId: string,
    role: 'client' | 'professional' | 'admin',
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        clientId: true,
        professionals: {
          select: {
            professionalId: true,
          },
        },
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (role === 'client') {
      const isOwner = project.userId === actorId || project.clientId === actorId;
      if (!isOwner) {
        throw new BadRequestException('You do not have access to this project');
      }
    }

    if (role === 'professional') {
      const hasAccess = project.professionals.some((pp: any) => pp.professionalId === actorId);
      if (!hasAccess) {
        throw new BadRequestException('You do not have access to this project');
      }
    }

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      include: {
        milestones: {
          orderBy: { sequence: 'asc' },
          include: {
            projectMilestone: {
              select: {
                id: true,
                title: true,
                sequence: true,
                plannedStartDate: true,
                plannedEndDate: true,
                status: true,
                isFinancial: true,
              },
            },
          },
        },
      },
    });

    if (!plan) return null;

    // B.2: Compute timeline risk — count milestones past their planned due date
    // that have not yet been released or cancelled.
    const now = new Date();
    const overdueCount: number = ((plan.milestones || []) as any[]).filter((m: any) => {
      if (!m.plannedDueAt) return false;
      if (['released', 'cancelled'].includes(m.status)) return false;
      return new Date(m.plannedDueAt) < now;
    }).length;

    const risk: 'none' | 'moderate' | 'high' =
      overdueCount === 0 ? 'none' : overdueCount <= 2 ? 'moderate' : 'high';

    return {
      ...plan,
      timelineRisk: { overdueCount, risk },
    };
  }

  async updateScaleFinancialMilestones(
    projectId: string,
    actorId: string,
    role: 'client' | 'professional' | 'admin',
    body: {
      scale2Milestone2?: {
        title?: string;
        plannedDueAt?: string | null;
        projectMilestoneId?: string | null;
      };
      scale3IntermediateMilestones?: Array<{
        title: string;
        amount: number;
        plannedDueAt?: string | null;
        projectMilestoneId: string;
      }>;
    },
  ) {
    if (!['professional', 'admin'].includes(role)) {
      throw new BadRequestException('Only professionals or admins can edit financial milestones');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        clientId: true,
        professionals: { select: { professionalId: true } },
      },
    });
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (role === 'professional') {
      const hasAccess = project.professionals.some((pp: any) => pp.professionalId === actorId);
      if (!hasAccess) {
        throw new BadRequestException('You do not have access to this project');
      }
    }

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      include: { milestones: { orderBy: { sequence: 'asc' } } },
    });
    if (!plan) {
      throw new BadRequestException('Payment plan not found for this project');
    }
    if (role === 'professional' && plan.lockedAt) {
      throw new BadRequestException('Locked plans cannot be edited by professionals');
    }

    return this.prisma.$transaction(async (tx) => {
      if (plan.projectScale === 'SCALE_2' && body.scale2Milestone2) {
        const milestone2 = plan.milestones.find((item: any) => item.sequence === 2);
        if (!milestone2) {
          throw new BadRequestException('Scale 2 payment milestone 2 was not found');
        }

        let linkedProjectMilestoneId =
          body.scale2Milestone2.projectMilestoneId !== undefined
            ? body.scale2Milestone2.projectMilestoneId
            : milestone2.projectMilestoneId;

        if (linkedProjectMilestoneId) {
          const linked = await tx.projectMilestone.findFirst({
            where: {
              id: linkedProjectMilestoneId,
              projectId,
            },
          });
          if (!linked) {
            throw new BadRequestException('Linked project milestone not found on this project');
          }
          await tx.projectMilestone.update({
            where: { id: linked.id },
            data: {
              isFinancial: true,
              plannedEndDate:
                this.toValidDate(body.scale2Milestone2.plannedDueAt) || linked.plannedEndDate || null,
            },
          });
        }

        await tx.paymentMilestone.update({
          where: { id: milestone2.id },
          data: {
            title: body.scale2Milestone2.title?.trim() || milestone2.title,
            plannedDueAt:
              this.toValidDate(body.scale2Milestone2.plannedDueAt) ||
              milestone2.plannedDueAt ||
              null,
            projectMilestoneId: linkedProjectMilestoneId || null,
          },
        });
      }

      if (plan.projectScale === 'SCALE_3' && Array.isArray(body.scale3IntermediateMilestones)) {
        const statuses = (plan.milestones || []).map((row: any) => row.status);
        if (statuses.some((value: string) => value !== 'scheduled')) {
          throw new BadRequestException(
            'Scale 3 milestone structure can only be edited before funding/release starts',
          );
        }

        const first = plan.milestones.find((row: any) => row.sequence === 1);
        const last = plan.milestones[plan.milestones.length - 1];
        if (!first || !last) {
          throw new BadRequestException('Scale 3 plan is missing required first/last milestones');
        }

        const intermediateRows = body.scale3IntermediateMilestones.map((entry, index) => {
          const title = String(entry.title || '').trim();
          const amount = this.roundMoney(Number(entry.amount) || 0);
          if (!title) {
            throw new BadRequestException(`Intermediate milestone ${index + 1} requires a title`);
          }
          if (amount <= 0) {
            throw new BadRequestException(`Intermediate milestone ${index + 1} requires amount > 0`);
          }
          if (!entry.projectMilestoneId) {
            throw new BadRequestException(`Intermediate milestone ${index + 1} requires projectMilestoneId`);
          }
          return {
            ...entry,
            title,
            amount,
            plannedDueAt: this.toValidDate(entry.plannedDueAt) || null,
          };
        });

        const linkedIds = new Set<string>();
        for (const row of intermediateRows) {
          if (linkedIds.has(row.projectMilestoneId)) {
            throw new BadRequestException('Each intermediate payment milestone must link to a unique project milestone');
          }
          linkedIds.add(row.projectMilestoneId);

          const linked = await tx.projectMilestone.findFirst({
            where: {
              id: row.projectMilestoneId,
              projectId,
            },
          });
          if (!linked) {
            throw new BadRequestException(`Project milestone ${row.projectMilestoneId} not found on this project`);
          }
          await tx.projectMilestone.update({
            where: { id: linked.id },
            data: {
              isFinancial: true,
              plannedEndDate: row.plannedDueAt || linked.plannedEndDate || null,
            },
          });
        }

        const totalAmount = Number(plan.totalAmount || 0);
        const depositAmount = Number(first.amount || 0);
        const intermediateTotal = this.roundMoney(
          intermediateRows.reduce((sum, item) => sum + item.amount, 0),
        );
        const finalAmount = this.roundMoney(totalAmount - depositAmount - intermediateTotal);
        if (finalAmount < 0) {
          throw new BadRequestException('Intermediate milestone totals exceed available plan amount');
        }

        const rebuiltRows: Array<any> = [
          {
            sequence: 1,
            title: first.title,
            type: 'deposit',
            amount: this.roundMoney(depositAmount),
            percentOfTotal: totalAmount > 0 ? this.roundMoney((depositAmount / totalAmount) * 100) : null,
            plannedDueAt: first.plannedDueAt,
            projectMilestoneId: first.projectMilestoneId || null,
          },
          ...intermediateRows.map((row, index) => ({
            sequence: index + 2,
            title: row.title,
            type: 'progress',
            amount: row.amount,
            percentOfTotal: totalAmount > 0 ? this.roundMoney((row.amount / totalAmount) * 100) : null,
            plannedDueAt: row.plannedDueAt,
            projectMilestoneId: row.projectMilestoneId,
          })),
          {
            sequence: intermediateRows.length + 2,
            title: last.title,
            type: 'final',
            amount: finalAmount,
            percentOfTotal: totalAmount > 0 ? this.roundMoney((finalAmount / totalAmount) * 100) : null,
            plannedDueAt: last.plannedDueAt,
            projectMilestoneId: last.projectMilestoneId || null,
          },
        ];

        await tx.paymentMilestone.deleteMany({
          where: { paymentPlanId: plan.id },
        });

        for (const row of rebuiltRows) {
          await tx.paymentMilestone.create({
            data: {
              paymentPlanId: plan.id,
              sequence: row.sequence,
              title: row.title,
              type: row.type,
              amount: new Decimal(row.amount),
              percentOfTotal: row.percentOfTotal,
              plannedDueAt: row.plannedDueAt,
              projectMilestoneId: row.projectMilestoneId,
            },
          });
        }
      }

      return (tx as any).projectPaymentPlan.findUnique({
        where: { id: plan.id },
        include: {
          milestones: {
            orderBy: { sequence: 'asc' },
            include: {
              projectMilestone: {
                select: {
                  id: true,
                  title: true,
                  sequence: true,
                  plannedStartDate: true,
                  plannedEndDate: true,
                  status: true,
                  isFinancial: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async configurePaymentPlanRetention(
    projectId: string,
    actorId: string,
    role: 'client' | 'professional' | 'admin',
    body: {
      retentionEnabled: boolean;
      retentionPercent?: number;
      retentionReleaseAt?: string | null;
    },
  ) {
    if (role !== 'admin') {
      throw new BadRequestException('Only admins can configure retention settings');
    }

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      include: {
        project: {
          select: {
            quoteEstimatedStartAt: true,
            quoteEstimatedDurationMinutes: true,
          },
        },
      },
    });
    if (!plan) {
      throw new BadRequestException('Payment plan not found for this project');
    }
    if (plan.projectScale !== 'SCALE_3') {
      throw new BadRequestException('Retention settings are only supported for Scale 3 plans');
    }

    const percent = this.roundMoney(
      Math.max(0, Math.min(100, Number(body.retentionPercent ?? plan.retentionPercent ?? 5))),
    );
    const totalAmount = Number(plan.totalAmount || 0);

    const startAt = this.toValidDate(plan.project?.quoteEstimatedStartAt || null);
    const durationMinutes = Math.max(0, Number(plan.project?.quoteEstimatedDurationMinutes || 0));
    const completionAt =
      startAt && durationMinutes > 0
        ? new Date(startAt.getTime() + durationMinutes * 60 * 1000)
        : null;
    const defaultReleaseAt = completionAt ? this.addMonths(completionAt, 1) : null;
    const releaseAt =
      this.toValidDate(body.retentionReleaseAt) ||
      this.toValidDate(plan.retentionReleaseAt) ||
      defaultReleaseAt;

    return (this.prisma as any).projectPaymentPlan.update({
      where: { id: plan.id },
      data: {
        retentionEnabled: !!body.retentionEnabled,
        retentionPercent: new Decimal(percent),
        retentionAmount: body.retentionEnabled
          ? new Decimal(this.roundMoney((totalAmount * percent) / 100))
          : null,
        retentionReleaseAt: body.retentionEnabled ? releaseAt : null,
      },
      include: {
        milestones: {
          orderBy: { sequence: 'asc' },
          include: {
            projectMilestone: {
              select: {
                id: true,
                title: true,
                sequence: true,
                plannedStartDate: true,
                plannedEndDate: true,
                status: true,
                isFinancial: true,
              },
            },
          },
        },
      },
    });
  }

  async reviewProjectPaymentPlan(
    projectId: string,
    actorId: string,
    role: 'client' | 'professional' | 'admin',
    body: {
      clientComment?: string;
      adminComment?: string;
      adminOverrideApplied?: boolean;
      lockPlan?: boolean;
    },
  ) {
    if (role === 'professional') {
      throw new BadRequestException('Professionals cannot edit the payment plan review state');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, clientId: true },
    });
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (role === 'client') {
      const isOwner = project.userId === actorId || project.clientId === actorId;
      if (!isOwner) {
        throw new BadRequestException('You do not have access to this project');
      }
    }

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
    });
    if (!plan) {
      throw new BadRequestException('Payment plan not found for this project');
    }

    const isLocked = !!plan.lockedAt;
    const updateData: any = {};

    if (role === 'client' && body.clientComment !== undefined) {
      updateData.clientComment = String(body.clientComment || '').trim() || null;
      if (!isLocked) {
        updateData.status = 'client_review';
      }
    }

    if (role === 'admin') {
      if (body.adminComment !== undefined) {
        updateData.adminComment = String(body.adminComment || '').trim() || null;
      }
      if (typeof body.adminOverrideApplied === 'boolean') {
        updateData.adminOverrideApplied = body.adminOverrideApplied;
      }
      if (!isLocked && body.lockPlan) {
        updateData.lockedAt = new Date();
        updateData.status = 'locked';
      } else if (!isLocked && Object.keys(updateData).length > 0 && !updateData.status) {
        updateData.status = 'admin_review';
      }
    }

    if (Object.keys(updateData).length === 0) {
      return (this.prisma as any).projectPaymentPlan.findUnique({
        where: { projectId },
        include: {
          milestones: { orderBy: { sequence: 'asc' } },
        },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextPlan = await (tx as any).projectPaymentPlan.update({
        where: { projectId },
        data: updateData,
      });

      if (updateData.lockedAt) {
        await (tx as any).project.update({
          where: { id: projectId },
          data: {
            paymentPlanLockedAt: updateData.lockedAt,
          },
        });
      }

      return (tx as any).projectPaymentPlan.findUnique({
        where: { id: nextPlan.id },
        include: {
          milestones: { orderBy: { sequence: 'asc' } },
        },
      });
    });

    return updated;
  }

  private normalizePhotos(
    photos?: Array<{ url?: string; note?: string }> | null,
    legacyUrls?: string[] | null,
  ): Array<{ url: string; note?: string }> {
    const result: Array<{ url: string; note?: string }> = [];
    if (Array.isArray(photos)) {
      for (const p of photos) {
        if (!p) continue;
        const url = typeof p.url === 'string' ? p.url.trim() : '';
        if (!url) continue;
        result.push({ url, note: typeof p.note === 'string' ? p.note : undefined });
      }
    }
    if (Array.isArray(legacyUrls)) {
      for (const u of legacyUrls) {
        const url = typeof u === 'string' ? u.trim() : '';
        if (!url) continue;
        // Avoid duplicates
        if (!result.some((p) => p.url === url)) {
          result.push({ url });
        }
      }
    }
    return result;
  }

  private resolveProjectPhotos(photos: any[]): any[] {
    if (!Array.isArray(photos)) return photos;
    return photos.map((p) => ({ ...p, url: buildPublicAssetUrl(p.url) }));
  }

  async findCanonical(userId?: string) {
    try {
      const projects = (await this.prisma.project.findMany({
        // Frontend passes the authenticated user's id
        // Only check userId (clientId is legacy)
        where: userId
          ? {
              userId: userId,
              status: { not: this.ARCHIVED_STATUS },
            }
          : {
              status: { not: this.ARCHIVED_STATUS },
            },
        include: {

          professionals: {
            include: { professional: true },
          },
          aiIntake: {
            select: {
              id: true,
              assumptions: true,
              risks: true,
              project: true,
            },
          },
          photos: true,
        },
      })) as any[];

      const byKey = new Map<string, unknown>();
      for (const p of projects) {
        const proj = p;
        const key = userId
          ? `${userId}|${this.canon(proj.projectName)}`
          : `${this.canon(proj.clientName)}|${this.canon(proj.projectName)}`;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, {
            ...proj,
            canonicalKey: key,
            sourceIds: [String(proj.id)],
            professionals: this.dedupeProfessionals(proj.professionals),
            photos: this.resolveProjectPhotos(proj.photos),
          });
        } else {
          const existing_proj = existing as any;
          const mergedPros = [
            ...(existing_proj.professionals ?? []),
            ...(proj.professionals ?? []),
          ];
          existing_proj.professionals = this.dedupeProfessionals(mergedPros);
          existing_proj.sourceIds = Array.from(
            new Set([...(existing_proj.sourceIds ?? []), String(proj.id)]),
          );
          // Prefer the most recently updated record for primary fields
          if ((proj.updatedAt || '') > (existing_proj.updatedAt || '')) {
            existing_proj.id = proj.id;
            existing_proj.region = proj.region;
            existing_proj.status = proj.status;
            existing_proj.contractorName = proj.contractorName;
            existing_proj.budget = proj.budget;
            existing_proj.notes = proj.notes;
            existing_proj.updatedAt = proj.updatedAt;
          }
        }
      }
      return Array.from(byKey.values());
    } catch (error) {
      console.error('[ProjectsService.findCanonical] Database error:', {
        message: error?.message,
        code: error?.code,
        meta: error?.meta,
      });
      return [];
    }
  }

  async findAll() {
    try {
      const projects = await this.prisma.project.findMany({
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          aiIntake: true,
          photos: true,
        },
      });
      // Consolidate duplicate professionals per project
      return projects.map((p: any) => ({
        ...p,
        professionals: this.dedupeProfessionals(p.professionals),
        photos: this.resolveProjectPhotos(p.photos),
      }));
    } catch (error) {
      console.error('[ProjectsService.findAll] Database error:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
      });
      return [];
    }
  }
  
  async findAllForClient(userId: string) {
    try {
      // Step 1: Basic query without includes (to check if data exists)
      // NOTE: Only checking userId now (clientId is legacy and never set for new projects)
      const basicProjects = await this.prisma.project.findMany({
        where: {
          userId: userId,
          status: { not: this.ARCHIVED_STATUS },
        },
        select: {
          id: true,
          projectName: true,
          clientId: true,
          userId: true,
          status: true,
        },
      });

      if (basicProjects.length === 0) {
        return [];
      }

      // Step 2: Now fetch full projects with includes
      let projects;
      try {
        projects = await this.prisma.project.findMany({
          where: {
            id: { in: basicProjects.map(p => p.id) },
          },
          include: {

            professionals: {
              include: {
                professional: true,
              },
            },
            aiIntake: {
              select: {
                id: true,
                assumptions: true,
                risks: true,
                project: true,
              },
            },
            photos: true,
          },
        });
      } catch (includesError) {
        // Fallback to basic projects if includes fail (handles schema mismatch issues)
        console.error('[ProjectsService.findAllForClient] Warning: includes query failed, returning basic projects:', includesError?.message);
        projects = basicProjects;
      }

      try {
        const mapped = projects.map((p: any) => {
          try {
            return {
              ...p,
              professionals: this.dedupeProfessionals(p.professionals),
              photos: this.resolveProjectPhotos(p.photos),
            };
          } catch (mapError) {
            return {
              ...p,
              professionals: [],
              photos: this.resolveProjectPhotos(p.photos),
            };
          }
        });
        return mapped;
      } catch (mapError) {
        console.error('[ProjectsService.findAllForClient] Error in map operation:', mapError?.message);
        return (projects as any[]).map((p: any) => ({
          ...p,
          photos: this.resolveProjectPhotos(p?.photos),
        }));
      }
    } catch (error) {
      console.error('[ProjectsService.findAllForClient] Database error:', error?.message);
      return [];
    }
  }

  private async getWalletTransferTimeline(projectId: string) {
    // "Wallet transfer" in the Class 1/2 flow = the client authorizing the milestone 1
    // cap allocation (milestone_foh_allocation_cap). This makes the nominal sum
    // available to the professional but not yet withdrawable. A separate evidence-
    // approval step then moves the proven amount to the withdrawable wallet.
    const firstCapTx = await this.prisma.financialTransaction.findFirst({
      where: {
        projectId,
        status: 'confirmed',
        type: 'milestone_foh_allocation_cap',
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        createdAt: true,
      },
    });

    return {
      walletTransferStatus: firstCapTx ? 'completed' : 'pending',
      walletTransferCompletedAt: firstCapTx?.createdAt ?? null,
    };
  }

  async findOne(id: string) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id },
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          paymentPlan: {
            include: {
              milestones: {
                orderBy: {
                  sequence: 'asc',
                },
              },
            },
          },
          startProposals: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 10,
          },
          aiIntake: true,
          photos: true,
        },
      });
      if (!project) return null;
      const walletTransferTimeline = await this.getWalletTransferTimeline(project.id);
      return {
        ...project,
        ...walletTransferTimeline,
        professionals: this.dedupeProfessionals((project as any).professionals),
        photos: this.resolveProjectPhotos((project as any).photos),
      } as any;
    } catch (error) {
      console.error('[ProjectsService.findOne] Error:', error?.message, error?.stack);
      return null;
    }
  }

  async findOneForClient(id: string, userId: string) {
    try {
      console.log('[ProjectsService.findOneForClient] Fetching project:', id, 'for userId:', userId);
      const project = await this.prisma.project.findFirst({
        where: {
          id,
          userId: userId,
          status: { not: this.ARCHIVED_STATUS },
        },
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          paymentPlan: {
            include: {
              milestones: {
                orderBy: {
                  sequence: 'asc',
                },
              },
            },
          },
          startProposals: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 10,
          },
          aiIntake: {
            select: {
              id: true,
              assumptions: true,
              risks: true,
              project: true,
            },
          },
          photos: true,
        },
      });
      console.log('[ProjectsService.findOneForClient] Project found:', !!project);
      if (!project) return null;
      const walletTransferTimeline = await this.getWalletTransferTimeline(project.id);
      return {
        ...project,
        ...walletTransferTimeline,
        professionals: this.dedupeProfessionals((project as any).professionals),
        photos: this.resolveProjectPhotos((project as any).photos),
      } as any;
    } catch (error) {
      console.error('[ProjectsService.findOneForClient] Error:', error?.message, error?.stack);
      return null;
    }
  }

  async getEmailTokens(projectId: string) {
    return this.prisma.emailToken.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            email: true,
            fullName: true,
            businessName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getProjectProfessionals(projectId: string) {
    const pros = await this.prisma.projectProfessional.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            email: true,
            fullName: true,
            businessName: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return this.dedupeProfessionals(pros);
  }

  async inviteProfessionals(projectId: string, professionalIds: string[]) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const ids = Array.isArray(professionalIds)
      ? Array.from(new Set(professionalIds.filter(Boolean)))
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('At least one professionalId is required');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    const professionals = await this.getProjectSelectableProfessionals(ids, {
      requireEmergencyCallout: !!project.isEmergency,
    });
    if (professionals.length === 0) {
      throw new BadRequestException('No professionals found for given ids');
    }

    // Create or ensure ProjectProfessional relations (update status to 'pending' if exists)
    const junctionPromises = professionals.map((pro) =>
      this.prisma.projectProfessional.upsert({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId: pro.id,
          },
        },
        update: { status: 'pending' },
        create: {
          projectId,
          professionalId: pro.id,
          status: 'pending',
        },
      }),
    );

    const junctionResults = await Promise.all(junctionPromises);

    // Create invitation messages for each professional
    const messagePromises = junctionResults.map(async (projectProfessional) => {
      const professional = professionals.find(p => p.id === projectProfessional.professionalId);
      if (!professional) return;

      const tradesText = project.tradesRequired && project.tradesRequired.length > 0
        ? `Trades Required: ${project.tradesRequired.join(', ')}`
        : 'Trades: To be discussed';

      const timelineText = project.endDate 
        ? `Timeline: Needed by ${new Date(project.endDate).toLocaleDateString()}`
        : 'Timeline: Flexible';

      const invitationMessage = `📋 Project Invitation: ${project.projectName}

You've been invited to submit a quote for this project.

${tradesText}
Region: ${project.region}
${timelineText}

Please review the project details and respond with your quote or decline the invitation.`;

      return this.prisma.message.create({
        data: {
          projectProfessionalId: projectProfessional.id,
          senderType: 'client',
          senderClientId: project.userId || project.clientId,
          content: invitationMessage,
        },
      });
    });

    await Promise.all(messagePromises);

    // Generate tokens for all professionals in parallel (no rate limit concern)
    const tokenData: Array<{ professional: typeof professionals[0]; acceptToken: string; declineToken: string; authToken: string }> = [];
    const tokenPromises: any[] = [];

    for (const professional of professionals) {
      const acceptToken = createId();
      const declineToken = createId();
      const authToken = createId();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const authExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      tokenData.push({ professional, acceptToken, declineToken, authToken });

      tokenPromises.push(
        this.prisma.emailToken.create({ data: { token: acceptToken, projectId, professionalId: professional.id, action: 'accept', expiresAt } }),
        this.prisma.emailToken.create({ data: { token: declineToken, projectId, professionalId: professional.id, action: 'decline', expiresAt } }),
        this.prisma.emailToken.create({ data: { token: authToken, projectId, professionalId: professional.id, action: 'auth', expiresAt: authExpiresAt } }),
      );
    }

    await Promise.all(tokenPromises);

    // Send notifications sequentially — 1.1s gap between emails to respect Resend free-tier rate limit (1 req/s)
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const notificationAudit = this.createNotificationAudit(
      'project_invitation_notifications',
      projectId,
      { invitedCount: tokenData.length },
    );

    for (let i = 0; i < tokenData.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }

      const { professional, acceptToken, declineToken, authToken } = tokenData[i];
      const professionalName = professional.fullName || professional.businessName || 'Professional';
      const quoteWindowLabel = project.isEmergency ? '12 hours' : '3 days';
      const recipientAudit: NotificationAuditRecipient = {
        actorType: 'professional',
        actorId: professional.id,
        role: 'invitee',
        email: { status: 'skipped' },
        direct: { status: 'skipped' },
      };

      // Always send email (carries accept/decline token links)
      try {
        await this.emailService.sendProjectInvitation({
          to: professional.email,
          professionalName,
          projectName: project.projectName,
          projectDescription: project.notes || 'No description provided',
          location: project.region,
          acceptToken,
          declineToken,
          authToken,
          projectId,
          baseUrl,
          quoteWindowLabel,
        });
        recipientAudit.email.status = 'sent';
      } catch (err) {
        recipientAudit.email.status = 'failed';
        recipientAudit.email.error = err?.message;
        console.error('[ProjectsService.inviteProfessionals] email failed', { to: professional.email, error: err?.message });
      }

      // Also send WhatsApp/SMS if professional has a non-email primary channel and a phone number
      if (professional.phone) {
        try {
          const preference = await this.prisma.notificationPreference.findUnique({
            where: { professionalId: professional.id },
            select: {
              primaryChannel: true,
              fallbackChannel: true,
              enableWhatsApp: true,
              enableSMS: true,
            },
          });
          const preferredChannel = preference?.primaryChannel;
          const fallbackChannel = preference?.fallbackChannel;

          const isMessagingChannel = (channel?: NotificationChannel | null) =>
            channel === NotificationChannel.WHATSAPP ||
            channel === NotificationChannel.SMS;

          const isChannelEnabled = (channel?: NotificationChannel | null) => {
            if (!channel) return false;
            if (channel === NotificationChannel.WHATSAPP) {
              return preference?.enableWhatsApp ?? true;
            }
            if (channel === NotificationChannel.SMS) {
              return preference?.enableSMS ?? true;
            }
            return false;
          };

          let directChannel: NotificationChannel | null = null;
          if (
            isMessagingChannel(preferredChannel) &&
            isChannelEnabled(preferredChannel)
          ) {
            directChannel = preferredChannel as NotificationChannel;
          } else if (
            isMessagingChannel(fallbackChannel) &&
            isChannelEnabled(fallbackChannel)
          ) {
            directChannel = fallbackChannel as NotificationChannel;
          } else if (!preference) {
            directChannel = NotificationChannel.WHATSAPP;
          }

          recipientAudit.direct.preferredChannel = preferredChannel;
          recipientAudit.direct.channel = directChannel;

          if (directChannel) {
            const shortMsg = `📋 New project invitation: "${project.projectName}" in ${project.region}. Check your email or log in to respond.`;
            const sendResult = await this.notificationService.send({
              professionalId: professional.id,
              phoneNumber: professional.phone,
              channel: directChannel,
              eventType: 'project_invitation',
              message: shortMsg,
            });

            if (sendResult.success) {
              recipientAudit.direct.status = 'sent';
            } else {
              recipientAudit.direct.status = 'failed';
              recipientAudit.direct.error =
                sendResult.error || 'Direct invitation notification failed';
            }
          } else {
            recipientAudit.direct.status = 'skipped';
            recipientAudit.direct.reason = preference
              ? 'no_enabled_messaging_channel'
              : 'missing_notification_preference';
          }
        } catch (err) {
          recipientAudit.direct.status = 'failed';
          recipientAudit.direct.error = err?.message;
          console.error('[ProjectsService.inviteProfessionals] WhatsApp/SMS failed', { professionalId: professional.id, error: err?.message });
        }
      } else {
        recipientAudit.direct.status = 'skipped';
        recipientAudit.direct.reason = 'missing_phone';
      }

      this.pushNotificationAuditRecipient(notificationAudit, recipientAudit);
    }

    await this.finalizeNotificationAudit(notificationAudit);

    return { success: true, invitedCount: professionals.length };
  }

  // Mark professionals as selected for a project without invitations
  async selectProfessionals(projectId: string, professionalIds: string[]) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const ids = Array.isArray(professionalIds)
      ? Array.from(new Set(professionalIds.filter(Boolean)))
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('At least one professionalId is required');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    await this.getProjectSelectableProfessionals(ids, {
      requireEmergencyCallout: !!project.isEmergency,
    });

    const results: any[] = [];
    for (const proId of ids) {
      const existing = await this.prisma.projectProfessional
        .findUnique({
          where: {
            projectId_professionalId: { projectId, professionalId: proId },
          },
        })
        .catch(() => null);

      if (!existing) {
        const created = await this.prisma.projectProfessional.create({
          data: {
            projectId,
            professionalId: proId,
            status: 'selected',
          },
        });
        results.push(created);
      } else {
        // Preserve existing lifecycle status for already-linked professionals.
        // Do not downgrade active invitations back to `selected`, otherwise they
        // disappear from the bidding board even though bidding is still live.
        results.push(existing);
      }
    }

    return {
      ok: true,
      count: results.length,
      items: this.dedupeProfessionals(results),
    } as any;
  }

  async create(createProjectDto: CreateProjectDto) {
    const { professionalIds, userId, photos, photoUrls, aiIntakeId, ...rest } = createProjectDto;
    // Strip legacy professionalId from the data object so Prisma does not see an unknown field

    const { professionalId: _legacyField, ...projectData } = rest as any;

    const normalizedPhotos = this.normalizePhotos(photos, photoUrls);

    // Backward compatibility: allow single professionalId in payload
    const ids: string[] = Array.isArray(professionalIds)
      ? Array.from(new Set(professionalIds.filter(Boolean)))
      : [];

    const legacyId = (createProjectDto as any).professionalId;
    if (legacyId && !ids.includes(legacyId)) ids.push(legacyId);

    // Professional IDs are optional - projects can be created without selecting professionals yet
    // Professionals can be invited after project creation

    // Debug: log invitation targets (safe for troubleshooting)
    if (ids.length > 0) {
      console.log('[ProjectsService.create] inviting professionals:', ids);
    }

    // Fetch professionals for email (if any)
    let professionals: any[] = [];
    if (ids.length > 0) {
      professionals = await this.getProjectSelectableProfessionals(ids, {
        requireEmergencyCallout: !!createProjectDto.isEmergency,
      });
    }

    // Transform userId into user relation for Prisma
    // Normalize date fields if provided
    const normalized: any = { ...projectData };
    if (typeof normalized.startDate === 'string' && normalized.startDate) {
      normalized.startDate = new Date(normalized.startDate);
    }
    if (typeof normalized.endDate === 'string' && normalized.endDate) {
      normalized.endDate = new Date(normalized.endDate);
    }

    const resolvedScale = this.inferProjectScaleFromContext({
      explicitScale: (createProjectDto as any).projectScale,
      tradesRequired: Array.isArray(normalized.tradesRequired) ? normalized.tradesRequired : [],
      isEmergency: Boolean(normalized.isEmergency),
    });
    normalized.projectScale = resolvedScale;
    normalized.escrowFundingPolicy = this.escrowPolicyForScale(resolvedScale);

    const createData: any = {
      ...normalized,
      currentStage: ids.length > 0 ? ProjectStage.BIDDING_ACTIVE : ProjectStage.CREATED,
      professionals: {
        create: ids.map((id) => ({
          professionalId: id,
          status: 'pending',
        })),
      },
    };

    // Link to AI intake if provided
    if (aiIntakeId) {
      createData.aiIntakeId = aiIntakeId;
    }

    if (normalizedPhotos.length > 0) {
      createData.photos = {
        create: normalizedPhotos.map((p) => ({ url: p.url, note: p.note })),
      };
    }

    if (userId) {
      createData.user = { connect: { id: userId } };
    }

    // Create project with all ProjectProfessional junctions
    const project = await this.prisma.project.create({
      data: createData,
      include: {

        professionals: {
          include: {
            professional: true,
          },
        },
        photos: true,
      },
    });

    // Create invitation messages for each professional
    if (professionals.length > 0 && project.professionals.length > 0) {
      const messagePromises = project.professionals.map(async (projectProfessional) => {
        const professional = professionals.find(p => p.id === projectProfessional.professionalId);
        if (!professional) return;

        const budgetText = project.budget 
          ? `Budget: HK$${project.budget.toLocaleString()}`
          : 'Budget: TBD';
        
        const tradesText = project.tradesRequired && project.tradesRequired.length > 0
          ? `Trades Required: ${project.tradesRequired.join(', ')}`
          : 'Trades: To be discussed';

        const timelineText = project.endDate 
          ? `Timeline: Needed by ${new Date(project.endDate).toLocaleDateString()}`
          : 'Timeline: Flexible';

        const invitationMessage = `📋 Project Invitation: ${project.projectName}

You've been invited to submit a quote for this project.

${budgetText}
${tradesText}
Region: ${project.region}
${timelineText}

Please review the project details and respond with your quote or decline the invitation.`;

        return this.prisma.message.create({
          data: {
            projectProfessionalId: projectProfessional.id,
            senderType: 'client',
            senderClientId: project.userId || project.clientId,
            content: invitationMessage,
          },
        });
      });

      await Promise.all(messagePromises);
    }

    // Generate secure tokens and send invitation emails for each professional
    const tokenPromises: any[] = [];
    const emailPromises: any[] = [];
    const directNotificationPromises: any[] = [];

    for (const professional of professionals) {
      const acceptToken = createId();
      const declineToken = createId();
      const authToken = createId();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      const authExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for auth token

      // Store tokens in database
      tokenPromises.push(
        this.prisma.emailToken.create({
          data: {
            token: acceptToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'accept',
            expiresAt,
          },
        }),
        this.prisma.emailToken.create({
          data: {
            token: declineToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'decline',
            expiresAt,
          },
        }),
        this.prisma.emailToken.create({
          data: {
            token: authToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'auth',
            expiresAt: authExpiresAt,
          },
        }),
      );

      // Send invitation email
      const professionalName =
        professional.fullName || professional.businessName || 'Professional';
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const quoteWindowLabel = project.isEmergency ? '12 hours' : '3 days';

      emailPromises.push(
        this.emailService
          .sendProjectInvitation({
            to: professional.email,
            professionalName,
            projectName: project.projectName,
            projectDescription: project.notes || 'No description provided',
            location: project.region,
            acceptToken,
            declineToken,
            authToken,
            projectId: project.id,
            baseUrl,
            quoteWindowLabel,
          })
          .catch((err) => {
            console.error('[ProjectsService.create] failed to send invite', {
              to: professional.email,
              error: err?.message,
            });
            return null;
          }),
      );

      // Send direct notification via preferred communication channel (if configured)
      if (professional.phone) {
        directNotificationPromises.push(
          (async () => {
            try {
              const preference = await this.prisma.notificationPreference.findUnique({
                where: { professionalId: professional.id },
                select: {
                  primaryChannel: true,
                  fallbackChannel: true,
                  enableWhatsApp: true,
                  enableSMS: true,
                },
              });

              const preferredChannel = preference?.primaryChannel;
              const fallbackChannel = preference?.fallbackChannel;

              const isMessagingChannel = (channel?: NotificationChannel | null) =>
                channel === NotificationChannel.WHATSAPP ||
                channel === NotificationChannel.SMS;

              const isChannelEnabled = (channel?: NotificationChannel | null) => {
                if (!channel) return false;
                if (channel === NotificationChannel.WHATSAPP) {
                  return preference?.enableWhatsApp ?? true;
                }
                if (channel === NotificationChannel.SMS) {
                  return preference?.enableSMS ?? true;
                }
                return false;
              };

              let directChannel: NotificationChannel | null = null;
              if (
                isMessagingChannel(preferredChannel) &&
                isChannelEnabled(preferredChannel)
              ) {
                directChannel = preferredChannel as NotificationChannel;
              } else if (
                isMessagingChannel(fallbackChannel) &&
                isChannelEnabled(fallbackChannel)
              ) {
                directChannel = fallbackChannel as NotificationChannel;
              } else if (!preference) {
                directChannel = NotificationChannel.WHATSAPP;
              }

              if (!directChannel) {
                return;
              }

              const shortMsg = `📋 New project invitation: "${project.projectName}" in ${project.region}. Check your email or log in to respond.`;
              const sendResult = await this.notificationService.send({
                professionalId: professional.id,
                phoneNumber: professional.phone,
                channel: directChannel,
                eventType: 'project_invitation',
                message: shortMsg,
              });

              if (!sendResult.success) {
                console.error(
                  '[ProjectsService.create] preferred direct invitation failed',
                  {
                    professionalId: professional.id,
                    channel: directChannel,
                    error: sendResult.error,
                  },
                );
              }
            } catch (err) {
              console.error(
                '[ProjectsService.create] preferred direct invitation failed',
                {
                  professionalId: professional.id,
                  error: err?.message,
                },
              );
            }
          })(),
        );
      }
    }

    // Execute all token creations and email sends in parallel
    await Promise.all([...tokenPromises, ...emailPromises, ...directNotificationPromises]);

    // Link the AI intake to the project if provided
    if (aiIntakeId && userId) {
      try {
        await this.prisma.aiIntake.update({
          where: { id: aiIntakeId },
          data: {
            projectId: project.id,
            status: 'converted',
          },
        });
      } catch (err) {
        // Silently fail AI intake linking - project was already created successfully
        console.warn('[ProjectsService.create] Failed to link AI intake:', {
          aiIntakeId,
          projectId: project.id,
          error: (err as Error)?.message,
        });
      }
    }

    return {
      ...project,
      photos: this.resolveProjectPhotos((project as any).photos),
    } as any;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    const { photos, photoUrls, ...rest } = updateProjectDto;
    const hasPhotoUpdate = photos !== undefined || photoUrls !== undefined;
    const normalizedPhotos = hasPhotoUpdate
      ? this.normalizePhotos(photos, photoUrls)
      : [];

    // Normalize dates if provided
    if (typeof (rest as any).startDate === 'string' && (rest as any).startDate) {
      (rest as any).startDate = new Date((rest as any).startDate);
    }
    if (typeof (rest as any).endDate === 'string' && (rest as any).endDate) {
      (rest as any).endDate = new Date((rest as any).endDate);
    }

    return this.prisma.$transaction(async (tx) => {
      if (hasPhotoUpdate) {
        await tx.projectPhoto.deleteMany({ where: { projectId: id } });
        if (normalizedPhotos.length > 0) {
          await tx.projectPhoto.createMany({
            data: normalizedPhotos.map((p) => ({ projectId: id, url: p.url, note: p.note })),
          });
        }
      }

      const project = await tx.project.update({
        where: { id },
        data: rest,
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          photos: true,
        },
      });

      return {
        ...project,
        professionals: this.dedupeProfessionals((project as any).professionals),
        photos: this.resolveProjectPhotos((project as any).photos),
      } as any;
    });
  }

  /**
   * Get S3 client for Cloudflare R2
   */
  private getS3Client() {
    try {
      const { S3Client } = require('@aws-sdk/client-s3');
      
      const accountId = process.env.STORAGE_ACCOUNT_ID;
      const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
      const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

      if (!accountId || !accessKeyId || !secretAccessKey) {
        console.warn('Storage credentials not configured');
        return null;
      }

      return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } catch (error) {
      console.error('Failed to initialize S3 client:', error);
      return null;
    }
  }

  /**
   * Delete a specific photo and remove it from Cloudflare R2
   */
  async deletePhoto(projectId: string, photoId: string) {
    // Get photo to extract filename
    const photo = await this.prisma.projectPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new BadRequestException('Photo not found');
    }

    if (photo.projectId !== projectId) {
      throw new BadRequestException('Photo does not belong to this project');
    }

    try {
      // Extract object key from stored URL/key
      const filename = extractObjectKeyFromValue(photo.url);
      
      if (filename) {
        // Delete from Cloudflare R2
        const s3 = this.getS3Client();
        if (s3) {
          try {
            const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
            const bucket = process.env.STORAGE_BUCKET;
            
            if (bucket) {
              await s3.send(
                new DeleteObjectCommand({
                  Bucket: bucket,
                  Key: filename,
                }),
              );
            }
          } catch (s3Error) {
            console.error('Failed to delete from R2:', s3Error);
            // Continue - delete from DB even if R2 delete fails
          }
        }
      }

      // Delete from database
      await this.prisma.projectPhoto.delete({
        where: { id: photoId },
      });

      return { success: true, photoId };
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw new BadRequestException('Failed to delete photo');
    }
  }

  /**
   * Update a photo's note
   */
  async updatePhoto(projectId: string, photoId: string, note?: string) {
    const photo = await this.prisma.projectPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new BadRequestException('Photo not found');
    }

    if (photo.projectId !== projectId) {
      throw new BadRequestException('Photo does not belong to this project');
    }

    return this.prisma.projectPhoto.update({
      where: { id: photoId },
      data: { note: note || null },
    });
  }

  /**
   * Create a financial transaction for a project
   */
  async createFinancialTransaction(
    projectId: string,
    data: {
      type: string;
      description: string;
      amount: string;
      status: string;
      requestedBy?: string;
      requestedByRole?: string;
      actionBy?: string;
      actionByRole?: string;
      projectProfessionalId?: string;
    },
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const amount = new Decimal(data.amount);

    return this.prisma.financialTransaction.create({
      data: {
        projectId,
        projectProfessionalId: data.projectProfessionalId || null,
        type: data.type,
        description: data.description,
        amount,
        status: data.status,
        requestedBy: data.requestedBy,
        requestedByRole: data.requestedByRole,
        actionBy: data.actionBy,
        actionByRole: data.actionByRole,
      },
    });
  }

  async respondToInvitation(token: string, action: 'accept' | 'decline') {
    // Validate token
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
    });

    if (!emailToken) {
      throw new Error('Invalid or expired token');
    }

    if (emailToken.usedAt) {
      throw new Error('This link has already been used');
    }

    if (new Date() > emailToken.expiresAt) {
      throw new Error('This invitation has expired');
    }

    if (emailToken.action !== action) {
      throw new Error('Invalid action for this token');
    }

    // Fetch professional and project separately
    const [professional, project] = await Promise.all([
      this.prisma.professional.findUnique({
        where: { id: emailToken.professionalId },
      }),
      this.prisma.project.findUnique({
        where: { id: emailToken.projectId },
        include: {

        },
      }),
    ]);

    if (!professional || !project) {
      throw new Error('Professional or project not found');
    }

    // Mark token as used
    await this.prisma.emailToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    // Update ProjectProfessional status
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    await this.prisma.projectProfessional.updateMany({
      where: {
        projectId: emailToken.projectId,
        professionalId: emailToken.professionalId,
      },
      data: {
        status: newStatus,
        respondedAt: new Date(),
      },
    });

    const projectProfessional = await this.prisma.projectProfessional.findUnique({
      where: {
        projectId_professionalId: {
          projectId: emailToken.projectId,
          professionalId: emailToken.professionalId,
        },
      },
      select: { id: true },
    });

    // Send follow-up email if accepted
    if (action === 'accept') {
      const professionalName =
        professional.fullName || professional.businessName || 'Professional';
      const quoteWindowLabel = project.isEmergency ? '12 hours' : '3 days';
      const webBaseUrl =
        process.env.WEB_BASE_URL ||
        process.env.FRONTEND_BASE_URL ||
        process.env.APP_WEB_URL ||
        'https://fitouthub-web.vercel.app';

      await this.emailService.sendProjectAccepted({
        to: professional.email,
        professionalName,
        projectName: project.projectName,
        projectId: emailToken.projectId,
        professionalId: emailToken.professionalId,
        baseUrl: webBaseUrl,
        quoteWindowLabel,
      });
    }

    return {
      success: true,
      message:
        action === 'accept'
          ? `Thank you for accepting! Please submit your quote within ${project.isEmergency ? '12 hours' : '3 days'} from invitation.`
          : 'Project declined. Thank you for your response.',
      projectId: emailToken.projectId,
      professionalId: emailToken.professionalId,
      projectProfessionalId: projectProfessional?.id,
    };
  }

  async validateMagicAuthToken(token: string) {
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
    });

    if (!emailToken) {
      throw new Error('Invalid or expired token');
    }

    if (emailToken.action !== 'auth') {
      throw new Error('Invalid token type');
    }

    if (new Date() > emailToken.expiresAt) {
      throw new Error('This link has expired');
    }

    const professional = await this.prisma.professional.findUnique({
      where: { id: emailToken.professionalId },
    });

    if (!professional) {
      throw new Error('Professional not found');
    }

    return {
      professional,
      projectId: emailToken.projectId,
      professionalId: emailToken.professionalId,
    };
  }

  async getAcceptTokenForMagicLink(magicToken: string) {
    // Find the auth token to get projectId and professionalId
    const authToken = await this.prisma.emailToken.findUnique({
      where: { token: magicToken },
    });

    if (!authToken) {
      return null;
    }

    // Find the corresponding accept token for same project/professional
    const acceptToken = await this.prisma.emailToken.findFirst({
      where: {
        projectId: authToken.projectId,
        professionalId: authToken.professionalId,
        action: 'accept',
      },
    });

    return acceptToken || null;
  }

  async submitQuote(
    projectId: string,
    professionalId: string,
    quoteAmount: number,
    quoteNotes?: string,
    quoteEstimatedStartAt?: string,
    quoteEstimatedDurationMinutes?: number,
  ) {
    // Verify professional has accepted this project
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          project: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
          },
          professional: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('You are not invited to this project');
    }

    if (projectProfessional.status !== 'accepted') {
      throw new Error('You must accept the project before submitting a quote');
    }

    if (projectProfessional.quotedAt) {
      throw new Error('You have already submitted a quote for this project');
    }

    const inviteCreatedAt = projectProfessional.createdAt
      ? new Date(projectProfessional.createdAt)
      : null;
    const quoteWindowMs = projectProfessional.project?.isEmergency
      ? 12 * 60 * 60 * 1000
      : 3 * 24 * 60 * 60 * 1000;

    if (inviteCreatedAt) {
      const extendedUntil = (projectProfessional as any).quoteExtendedUntil
        ? new Date((projectProfessional as any).quoteExtendedUntil)
        : null;
      const quoteDeadline = extendedUntil ?? new Date(inviteCreatedAt.getTime() + quoteWindowMs);
      if (new Date() > quoteDeadline) {
        throw new Error(
          projectProfessional.project?.isEmergency
            ? 'Initial quote window closed (12 hours from invitation)'
            : 'Initial quote window closed (3 days from invitation)',
        );
      }
    }

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const hasApprovedAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);
    const isVisitScheduled =
      latestAccessRequest?.status === 'approved_visit_scheduled';
    const hasVisited =
      !!latestAccessRequest?.visitedAt || latestAccessRequest?.status === 'visited';
    const isRemoteQuote = !hasApprovedAccess || (isVisitScheduled && !hasVisited);
    const visitApprovedButNotDone = isVisitScheduled && !hasVisited;
    const quoteSchedule = this.normalizeQuoteSchedule(
      {
        quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes,
      },
      { required: true },
    );

    // Update ProjectProfessional with quote
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        status: 'quoted',
        quoteAmount,
        quoteNotes,
        quoteEstimatedStartAt: quoteSchedule.quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes:
          quoteSchedule.quoteEstimatedDurationMinutes,
        quotedAt: new Date(),
        visitApprovedButNotDone,
      },
    });

    if (latestAccessRequest) {
      await this.prisma.siteAccessRequest.update({
        where: { id: latestAccessRequest.id },
        data: {
          quoteCreatedAfterAccess: true,
          quoteIsRemote: isRemoteQuote,
        },
      });
    }

    // Notify client
    const clientActorId =
      projectProfessional.project.user?.id ||
      projectProfessional.project.userId ||
      projectProfessional.project.clientId ||
      'unknown-client';
    const clientEmail = projectProfessional.project.user?.email || 'client@example.com';
    const professionalName =
      projectProfessional.professional.fullName ||
      projectProfessional.professional.businessName ||
      'Professional';
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const notificationAudit = this.createNotificationAudit(
      'quote_submitted_notifications',
      projectId,
      {
        professionalId,
        projectProfessionalId: projectProfessional.id,
      },
    );

    const clientAudit: NotificationAuditRecipient = {
      actorType: 'client',
      actorId: clientActorId,
      role: 'quote_submit_recipient',
      email: { status: 'skipped' },
      direct: {
        status: 'skipped',
        reason: 'not_implemented_client_direct_notification',
      },
    };

    try {
      await this.emailService.sendQuoteSubmitted({
        to: clientEmail,
        clientName: projectProfessional.project.clientName,
        professionalName,
        projectName: projectProfessional.project.projectName,
        quoteAmount,
        projectId,
        baseUrl,
      });
      clientAudit.email.status = 'sent';
    } catch (error) {
      clientAudit.email.status = 'failed';
      clientAudit.email.error = error?.message;
      this.pushNotificationAuditRecipient(notificationAudit, clientAudit);
      await this.finalizeNotificationAudit(notificationAudit);
      throw error;
    }

    this.pushNotificationAuditRecipient(notificationAudit, clientAudit);
    await this.finalizeNotificationAudit(notificationAudit);

    return {
      success: true,
      message: 'Quote submitted successfully',
      quoteAmount,
      quoteIsRemote: isRemoteQuote,
    };
  }

  async remindQuote(projectId: string, ppId: string, clientUserId: string) {
    const pp = await this.prisma.projectProfessional.findFirst({
      where: { id: ppId, projectId },
      include: {
        project: { include: { user: true } },
        professional: true,
      },
    });

    if (!pp) throw new BadRequestException('Professional record not found on this project');

    // Verify client ownership
    const project = pp.project as any;
    const isOwner =
      (project.userId && project.userId === clientUserId) ||
      (project.clientId && project.clientId === clientUserId) ||
      (!project.userId && !project.clientId);
    if (!isOwner) throw new BadRequestException('You do not have access to this project');

    const remindableStatuses = ['selected', 'pending', 'accepted'];
    if (!remindableStatuses.includes(pp.status)) {
      throw new BadRequestException('Cannot send reminder: professional is not in an active bidding state');
    }

    if (pp.quotedAt) throw new BadRequestException('Professional has already submitted a quote');

    if ((pp as any).quoteReminderSentAt) {
      throw new BadRequestException('A reminder has already been sent to this professional (one-shot only)');
    }

    const quoteExtendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nextStatus = pp.status === 'selected' ? 'pending' : pp.status;

    const updated = await this.prisma.projectProfessional.update({
      where: { id: ppId },
      data: {
        status: nextStatus,
        quoteReminderSentAt: new Date(),
        quoteExtendedUntil,
      } as any,
    });

    // Send email notification
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const professionalName = pp.professional.fullName || pp.professional.businessName || 'Professional';
    try {
      await this.emailService.sendQuoteExtensionReminder({
        to: pp.professional.email,
        professionalName,
        projectName: project.projectName,
        projectId,
        professionalId: pp.professionalId,
        baseUrl,
        newDeadline: quoteExtendedUntil,
      });
    } catch (err) {
      console.error('[ProjectsService.remindQuote] email failed:', err?.message);
    }

    // Also send WhatsApp/SMS if professional has a phone and messaging preference
    if (pp.professional.phone) {
      try {
        const preference = await this.prisma.notificationPreference.findUnique({
          where: { professionalId: pp.professionalId },
          select: { primaryChannel: true, fallbackChannel: true, enableWhatsApp: true, enableSMS: true },
        });
        const preferredChannel = preference?.primaryChannel;
        const isWhatsApp = preferredChannel === NotificationChannel.WHATSAPP && (preference?.enableWhatsApp ?? true);
        const isSms = preferredChannel === NotificationChannel.SMS && (preference?.enableSMS ?? true);
        const directChannel = isWhatsApp
          ? NotificationChannel.WHATSAPP
          : isSms
          ? NotificationChannel.SMS
          : !preference
          ? NotificationChannel.WHATSAPP
          : null;

        if (directChannel) {
          const msg = `\u23f0 Your quote deadline for \"${project.projectName}\" has been extended by 24 hours by the client. Log in to submit now.`;
          await this.notificationService.send({
            professionalId: pp.professionalId,
            phoneNumber: pp.professional.phone,
            channel: directChannel,
            eventType: 'quote_extension_reminder',
            message: msg,
          });
        }
      } catch (err) {
        console.error('[ProjectsService.remindQuote] WhatsApp/SMS failed:', err?.message);
      }
    }

    return {
      success: true,
      status: (updated as any).status,
      quoteReminderSentAt: (updated as any).quoteReminderSentAt,
      quoteExtendedUntil: (updated as any).quoteExtendedUntil,
    };
  }

  private async assertClientProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const isOwner =
      (project.userId && project.userId === userId) ||
      (project.clientId && project.clientId === userId) ||
      (!project.userId && !project.clientId);

    if (!isOwner) {
      throw new BadRequestException('You do not have access to this project');
    }

    return project;
  }

  private formatDurationMinutes(durationMinutes: number) {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return 'unspecified duration';
    }

    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }

    const hours = durationMinutes / 60;
    if (Number.isInteger(hours)) {
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${hours.toFixed(1).replace(/\.0$/, '')} hours`;
  }

  private calculateProposalEndDate(startAt: Date, durationMinutes: number) {
    return new Date(startAt.getTime() + durationMinutes * 60 * 1000);
  }

  private getStartProposalActorRole(isProfessional: boolean): 'professional' | 'client' {
    return isProfessional ? 'professional' : 'client';
  }

  private getStartProposalActorLabel(role: 'professional' | 'client') {
    return role === 'professional' ? 'Professional' : 'Client';
  }

  private isProjectInContractWorkflowStage(stage?: string | null) {
    const contractWorkflowStages = new Set([
      'CONTRACT_PHASE',
      'PRE_WORK',
      'WORK_IN_PROGRESS',
      'MILESTONE_PENDING',
      'PAYMENT_RELEASED',
      'NEAR_COMPLETION',
      'FINAL_INSPECTION',
      'COMPLETE',
      'WARRANTY_PERIOD',
      'CLOSED',
    ]);

    const normalizedStage = String(stage || '').toUpperCase();
    return contractWorkflowStages.has(normalizedStage);
  }

  async requestProjectStartProposal(
    projectId: string,
    professionalId: string,
    body: { scheduledAt: string; durationMinutes: number; notes?: string },
  ) {
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is required');
    }

    const durationMinutes = Number(body.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 30) {
      throw new BadRequestException('durationMinutes must be at least 30');
    }
    if (durationMinutes > 60 * 24 * 30) {
      throw new BadRequestException('durationMinutes is too large');
    }

    const projectProfessional = await this.prisma.projectProfessional.findUnique({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      include: {
        professional: true,
        project: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    const isAwardedStatus = String(projectProfessional.status || '').toLowerCase() === 'awarded';
    const isContractWorkflowStage = this.isProjectInContractWorkflowStage(
      projectProfessional.project?.currentStage,
    );

    if (!isAwardedStatus && !isContractWorkflowStage) {
      throw new BadRequestException('Start details can only be proposed for awarded projects');
    }

    const latestProposal = await this.prisma.projectStartProposal.findFirst({
      where: {
        projectId,
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestProposal?.status === 'accepted') {
      throw new BadRequestException('Start details have already been agreed for this project');
    }

    if (latestProposal?.status === 'proposed') {
      throw new BadRequestException(
        latestProposal.proposedByRole === 'professional'
          ? 'Wait for the client to accept or update your proposed start first'
          : 'Use the response action on the latest client update instead of sending a new proposal',
      );
    }

    const proposal = await this.prisma.projectStartProposal.create({
      data: {
        projectId,
        projectProfessionalId: projectProfessional.id,
        professionalId,
        proposedByRole: 'professional',
        proposedByUserId: professionalId,
        proposedStartAt: scheduledAt,
        durationMinutes,
        notes: body.notes?.trim() || undefined,
        status: 'proposed',
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    const professionalName =
      projectProfessional.professional?.businessName ||
      projectProfessional.professional?.fullName ||
      'Professional';
    const durationLabel = this.formatDurationMinutes(durationMinutes);
    await this.addProjectChatMessage(
      projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} proposed starting on ${this.formatDateTime(scheduledAt)} for an estimated ${durationLabel}.${body.notes ? ` Notes: ${body.notes}` : ''}`,
    );

    try {
      const client = projectProfessional.project?.user;
      if (client?.id && client?.mobile) {
        await this.notificationService.send({
          userId: client.id,
          phoneNumber: client.mobile,
          eventType: 'project_start_proposed',
          message: `${professionalName} proposed a project start on ${this.formatDateTime(scheduledAt)} for "${projectProfessional.project.projectName}" (${durationLabel}).`,
        });
      }
    } catch (error) {
      console.error('Failed to send start proposal notification:', error);
    }

    return {
      success: true,
      proposal: {
        ...proposal,
        projectedEndAt: this.calculateProposalEndDate(scheduledAt, durationMinutes),
      },
    };
  }

  async respondToProjectStartProposal(
    proposalId: string,
    actorId: string,
    isProfessional: boolean,
    body: {
      status: 'accepted' | 'declined' | 'updated';
      updatedScheduledAt?: string;
      responseNotes?: string;
    },
  ) {
    const proposal = await this.prisma.projectStartProposal.findUnique({
      where: { id: proposalId },
      include: {
        project: {
          include: { user: true },
        },
        professional: true,
        projectProfessional: true,
      },
    });

    if (!proposal) {
      throw new BadRequestException('Start proposal not found');
    }

    if (proposal.status !== 'proposed') {
      throw new BadRequestException('This start proposal has already been responded to');
    }

    const actorRole = this.getStartProposalActorRole(isProfessional);
    const actorLabel = this.getStartProposalActorLabel(actorRole);
    const recipientRole = actorRole === 'professional' ? 'client' : 'professional';

    if (proposal.proposedByRole === actorRole) {
      throw new BadRequestException(
        actorRole === 'professional'
          ? 'Wait for the client to accept or update your proposed start first'
          : 'Wait for the professional to respond before updating the start again',
      );
    }

    if (isProfessional) {
      const projectProfessional = await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId: proposal.projectId,
            professionalId: actorId,
          },
        },
      });

      if (!projectProfessional || projectProfessional.id !== proposal.projectProfessionalId) {
        throw new BadRequestException('You do not have access to this start proposal');
      }
    } else {
      await this.assertClientProjectAccess(proposal.projectId, actorId);
    }

    const responseNotes = body.responseNotes?.trim() || undefined;
    const updatedScheduledAt = body.updatedScheduledAt
      ? new Date(body.updatedScheduledAt)
      : null;

    if (body.status === 'updated') {
      if (!updatedScheduledAt || Number.isNaN(updatedScheduledAt.getTime())) {
        throw new BadRequestException('updatedScheduledAt is required when status is updated');
      }
    }

    const projectedEndAt = this.calculateProposalEndDate(proposal.proposedStartAt, proposal.durationMinutes);
    const updatedProjectedEndAt =
      updatedScheduledAt && !Number.isNaN(updatedScheduledAt.getTime())
        ? this.calculateProposalEndDate(updatedScheduledAt, proposal.durationMinutes)
        : null;

    const updated = await this.prisma.$transaction(async (prisma) => {
      const updatedProposal = await prisma.projectStartProposal.update({
        where: { id: proposalId },
        data: {
          status: body.status === 'updated' ? 'declined' : body.status,
          respondedAt: new Date(),
          respondedBy: actorId,
          responseNotes,
        },
      });

      if (body.status === 'accepted') {
        await prisma.projectStartProposal.updateMany({
          where: {
            projectId: proposal.projectId,
            projectProfessionalId: proposal.projectProfessionalId,
            status: 'accepted',
            id: { not: proposalId },
          },
          data: {
            status: 'superseded',
            respondedAt: new Date(),
          },
        });

        await prisma.project.update({
          where: { id: proposal.projectId },
          data: {
            startDate: proposal.proposedStartAt,
            endDate: projectedEndAt,
          },
        });
      }

      if (body.status === 'updated' && updatedScheduledAt) {
        const replacementProposal = await prisma.projectStartProposal.create({
          data: {
            projectId: proposal.projectId,
            projectProfessionalId: proposal.projectProfessionalId,
            professionalId: proposal.professionalId,
            proposedByRole: actorRole,
            proposedByUserId: actorId,
            status: 'proposed',
            proposedStartAt: updatedScheduledAt,
            durationMinutes: proposal.durationMinutes,
            notes: responseNotes || proposal.notes || undefined,
          },
          include: {
            project: true,
            professional: true,
            projectProfessional: true,
          },
        });

        return {
          ...replacementProposal,
          __previousProposalId: updatedProposal.id,
        } as any;
      }

      return updatedProposal as any;
    });

    const professionalName =
      proposal.professional?.businessName || proposal.professional?.fullName || 'Professional';
    const durationLabel = this.formatDurationMinutes(proposal.durationMinutes);

    await this.addProjectChatMessage(
      proposal.projectId,
      actorRole,
      isProfessional ? null : actorId,
      isProfessional ? actorId : null,
      body.status === 'accepted'
        ? `${actorLabel} accepted the proposed start of ${this.formatDateTime(proposal.proposedStartAt)} (${durationLabel}).`
        : body.status === 'updated' && updatedScheduledAt
          ? `${actorLabel} proposed an updated start: ${this.formatDateTime(updatedScheduledAt)} (${durationLabel}).${responseNotes ? ` Note: ${responseNotes}` : ''}`
          : `${actorLabel} declined the proposed start of ${this.formatDateTime(proposal.proposedStartAt)}${responseNotes ? `: ${responseNotes}` : '.'}`,
    );

    try {
      const client = proposal.project?.user;
      const clientPhone = client?.mobile || null;
      const notifyClient = recipientRole === 'client' && client?.id && clientPhone;
      const notifyProfessional =
        recipientRole === 'professional' && proposal.professional?.id && proposal.professional?.phone;

      if (notifyClient || notifyProfessional) {
        await this.notificationService.send({
          ...(notifyClient
            ? { userId: client!.id, phoneNumber: clientPhone! }
            : {
                professionalId: proposal.professional!.id,
                phoneNumber: proposal.professional!.phone,
              }),
          eventType:
            body.status === 'accepted'
              ? 'project_start_accepted'
              : 'project_start_declined',
          message:
            body.status === 'accepted'
              ? `${actorLabel} accepted the proposed start for "${proposal.project.projectName}". Agreed start: ${this.formatDateTime(proposal.proposedStartAt)}.`
              : body.status === 'updated' && updatedScheduledAt
                ? `${actorLabel} proposed an updated start for "${proposal.project.projectName}": ${this.formatDateTime(updatedScheduledAt)}${responseNotes ? ` (${responseNotes})` : ''}.`
                : `${actorLabel} declined the proposed start for "${proposal.project.projectName}"${responseNotes ? `: ${responseNotes}` : '.'}`,
        });
      }
    } catch (error) {
      console.error('Failed to send start proposal response notification:', error);
    }

    return {
      success: true,
      proposal: {
        ...updated,
        projectedEndAt:
          body.status === 'updated' && updatedProjectedEndAt
            ? updatedProjectedEndAt
            : projectedEndAt,
      },
    };
  }

  async getProjectStartProposals(projectId: string, actorId: string, isProfessional: boolean) {
    if (isProfessional) {
      await this.prisma.projectProfessional.findFirst({
        where: {
          projectId,
          professionalId: actorId,
        },
      }).then((projectProfessional) => {
        if (!projectProfessional) {
          throw new BadRequestException('You do not have access to this project');
        }
      });
    } else {
      await this.assertClientProjectAccess(projectId, actorId);
    }

    const proposals = await this.prisma.projectStartProposal.findMany({
      where: { projectId },
      include: {
        professional: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return proposals.map((proposal) => ({
      ...proposal,
      projectedEndAt: this.calculateProposalEndDate(proposal.proposedStartAt, proposal.durationMinutes),
    }));
  }

  async requestSiteAccess(
    projectId: string,
    professionalId: string,
    body?: {
      visitScheduledFor?: string;
      visitScheduledAt?: string;
    },
  ) {
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
        },
      });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    if (!['pending', 'accepted', 'quoted', 'awarded'].includes(projectProfessional.status)) {
      throw new BadRequestException('Professional must be invited to request site access');
    }

    const existingRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: {
          in: ['pending', 'approved_visit_scheduled'],
        },
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    if (existingRequest) {
      return {
        success: true,
        request: existingRequest,
        message: 'A site access request is already pending',
      };
    }

    const visitDate = body?.visitScheduledFor?.trim();
    const visitTime = body?.visitScheduledAt?.trim();

    if ((visitDate && !visitTime) || (!visitDate && visitTime)) {
      throw new BadRequestException('Both visit date and visit time are required');
    }

    let requestedVisitAt: Date | null = null;
    let requestedVisitFor: Date | null = null;

    if (visitDate && visitTime) {
      const parsed = new Date(`${visitDate}T${visitTime}`);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid requested visit date/time');
      }
      requestedVisitAt = parsed;
      requestedVisitFor = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    const request = await this.prisma.siteAccessRequest.create({
      data: {
        projectId,
        projectProfessionalId: projectProfessional.id,
        professionalId,
        status: 'pending',
        visitScheduledFor: requestedVisitFor,
        visitScheduledAt: requestedVisitAt,
      },
    });

    const professionalName =
      projectProfessional.professional?.businessName ||
      projectProfessional.professional?.fullName ||
      'Professional';
    await this.addProjectChatMessage(
      projectId,
      'professional',
      null,
      professionalId,
      requestedVisitAt
        ? `${professionalName} requested site access on ${this.formatDateTime(new Date())} and proposed a visit for ${this.formatDateTime(requestedVisitAt)}.`
        : `${professionalName} requested site access on ${this.formatDateTime(new Date())}.`,
    );

    return {
      success: true,
      request,
    };
  }

  async submitSiteAccessData(
    projectId: string,
    userId: string,
    body: {
      addressFull: string;
      unitNumber?: string;
      floorLevel?: string;
      accessDetails?: string;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
    },
  ) {
    await this.assertClientProjectAccess(projectId, userId);

    if (!body.addressFull) {
      throw new BadRequestException('Address is required');
    }

    const data = await this.prisma.siteAccessData.upsert({
      where: { projectId },
      create: {
        projectId,
        addressFull: body.addressFull,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        accessDetails: body.accessDetails,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        submittedBy: userId,
      },
      update: {
        addressFull: body.addressFull,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        accessDetails: body.accessDetails,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        lastUpdatedBy: userId,
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        siteAccessDataCollected: true,
        siteAccessDataCollectedAt: new Date(),
      },
    });

    return {
      success: true,
      data,
    };
  }

  async respondToSiteAccessRequest(
    requestId: string,
    userId: string,
    body: {
      status: 'approved_no_visit' | 'approved_visit_scheduled' | 'denied';
      visitScheduledFor?: string;
      visitScheduledAt?: string;
      reasonDenied?: string;
      addressFull?: string;
      unitNumber?: string;
      floorLevel?: string;
      accessDetails?: string;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
    },
  ) {
    const request = await this.prisma.siteAccessRequest.findUnique({
      where: { id: requestId },
      include: { project: true },
    });

    if (!request) {
      throw new BadRequestException('Site access request not found');
    }

    await this.assertClientProjectAccess(request.projectId, userId);

    if (body.status === 'approved_visit_scheduled' && !body.visitScheduledFor) {
      if (!body.visitScheduledAt) {
        throw new BadRequestException('visitScheduledAt or visitScheduledFor is required for scheduled visits');
      }
    }

    // Fetch location details to get project timezone
    const locationDetails = await this.prisma.projectLocationDetails.findUnique({
      where: { projectId: request.projectId },
    });

    const projectTimezone = locationDetails?.timezone || 'Asia/Hong_Kong';

    const parseOptionalDate = (value?: string) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    };

    // Convert local time string in a timezone to UTC
    // Example: "2024-03-01T13:00" in "Asia/Hong_Kong" timezone
    const convertLocalToUTC = (localDateTime: string, timezone: string): Date | null => {
      try {
        // Create formatter for the target timezone to get offset
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });

        // Parse the local datetime
        const localDate = new Date(localDateTime);
        if (Number.isNaN(localDate.getTime())) {
          return null;
        }

        // Get the formatted string in the target timezone
        const parts = formatter.formatToParts(localDate);
        const partsObj: Record<string, string> = {};
        parts.forEach((part) => {
          partsObj[part.type] = part.value;
        });

        // Create a date from the formatted parts
        const tzDate = new Date(
          parseInt(partsObj.year),
          parseInt(partsObj.month) - 1,
          parseInt(partsObj.day),
          parseInt(partsObj.hour),
          parseInt(partsObj.minute),
          parseInt(partsObj.second)
        );

        // Calculate offset between local and target timezone
        const offsetMs = localDate.getTime() - tzDate.getTime();
        
        // Return UTC time (add offset to get back to UTC)
        return new Date(localDate.getTime() + offsetMs);
      } catch {
        return null;
      }
    };

    if (body.status === 'denied') {
      const denied = await this.prisma.siteAccessRequest.update({
        where: { id: requestId },
        data: {
          status: 'denied',
          respondedAt: new Date(),
          clientApprovedBy: userId,
          reasonDenied: body.reasonDenied,
        },
      });

      await this.addProjectChatMessage(
        request.projectId,
        'client',
        userId,
        null,
        `Client denied site access${body.reasonDenied ? `: ${body.reasonDenied}` : '.'}`,
      );

      return {
        success: true,
        request: denied,
      };
    }

    const existingData = await this.prisma.siteAccessData.findUnique({
      where: { projectId: request.projectId },
    });

    if (!existingData && !body.addressFull) {
      throw new BadRequestException('Address is required to approve site access');
    }

    if (body.addressFull) {
      await this.prisma.siteAccessData.upsert({
        where: { projectId: request.projectId },
        create: {
          projectId: request.projectId,
          addressFull: body.addressFull,
          unitNumber: body.unitNumber,
          floorLevel: body.floorLevel,
          accessDetails: body.accessDetails,
          onSiteContactName: body.onSiteContactName,
          onSiteContactPhone: body.onSiteContactPhone,
          submittedBy: userId,
        },
        update: {
          addressFull: body.addressFull,
          unitNumber: body.unitNumber,
          floorLevel: body.floorLevel,
          accessDetails: body.accessDetails,
          onSiteContactName: body.onSiteContactName,
          onSiteContactPhone: body.onSiteContactPhone,
          lastUpdatedBy: userId,
        },
      });

      await this.prisma.project.update({
        where: { id: request.projectId },
        data: {
          siteAccessDataCollected: true,
          siteAccessDataCollectedAt: new Date(),
        },
      });
    }

    const scheduledForInput = body.visitScheduledFor?.trim();
    const scheduledAtInput = body.visitScheduledAt?.trim();

    let scheduledAt: Date | null = null;
    if (scheduledForInput || scheduledAtInput) {
      let localDateTime: string | null = null;
      
      if (scheduledForInput && scheduledAtInput) {
        const isTimeOnly = /^\d{2}:\d{2}(:\d{2})?$/.test(scheduledAtInput);
        if (isTimeOnly) {
          localDateTime = `${scheduledForInput}T${scheduledAtInput}`;
        } else {
          scheduledAt = parseOptionalDate(scheduledAtInput);
        }
      } else if (scheduledForInput) {
        localDateTime = scheduledForInput;
      } else if (scheduledAtInput) {
        const isTimeOnly = /^\d{2}:\d{2}(:\d{2})?$/.test(scheduledAtInput);
        if (isTimeOnly && !scheduledForInput) {
          throw new BadRequestException('Date is required when time is provided');
        }
        localDateTime = scheduledAtInput;
      }

      if (localDateTime && !scheduledAt) {
        scheduledAt = convertLocalToUTC(localDateTime, projectTimezone);
      }
    }

    const isValidDate = (value: Date | null) =>
      !!value && !Number.isNaN(value.getTime());

    const safeScheduledFor = scheduledAt
      ? new Date(scheduledAt.getFullYear(), scheduledAt.getMonth(), scheduledAt.getDate())
      : null;

    const safeScheduledAt = isValidDate(scheduledAt) ? scheduledAt : null;

    if (body.status === 'approved_visit_scheduled' && !safeScheduledAt) {
      throw new BadRequestException('A valid visit date/time is required for scheduled visits');
    }

    const approved = await this.prisma.siteAccessRequest.update({
      where: { id: requestId },
      data: {
        status: body.status,
        respondedAt: new Date(),
        clientApprovedBy: userId,
        reasonDenied: body.reasonDenied,
        visitScheduledFor: safeScheduledFor,
        visitScheduledAt: safeScheduledAt,
      },
    });

    if (body.status === 'approved_visit_scheduled' && safeScheduledAt) {
      await this.prisma.siteAccessVisit.create({
        data: {
          projectId: request.projectId,
          projectProfessionalId: request.projectProfessionalId,
          professionalId: request.professionalId,
          proposedAt: safeScheduledAt,
          proposedByRole: 'client',
          status: 'proposed',
        },
      });
    }

    await this.addProjectChatMessage(
      request.projectId,
      'client',
      userId,
      null,
      body.status === 'approved_no_visit'
        ? 'Client approved site access (no visit required).'
        : `Client approved site access with a proposed visit on ${this.formatDateTime(safeScheduledAt)}.`,
    );

    // Send notification to professional
    try {
      const professional = await this.prisma.professional.findUnique({
        where: { id: request.professionalId },
      });

      if (professional?.phone) {
        const project = await this.prisma.project.findUnique({
          where: { id: request.projectId },
          select: { projectName: true },
        });

        const notificationMessage = body.status === 'approved_no_visit'
          ? `Good news! Your site access request for "${project?.projectName}" has been approved. No site visit required.`
          : `Good news! Your site access request for "${project?.projectName}" has been approved with a scheduled visit on ${this.formatDateTime(safeScheduledAt)}.`;

        await this.notificationService.send({
          professionalId: professional.id,
          phoneNumber: professional.phone,
          eventType: 'site_access_approved',
          message: notificationMessage,
        });
      }
    } catch (error) {
      // Log but don't fail the request if notification fails
      console.error('Failed to send site access approval notification:', error);
    }

    return {
      success: true,
      request: approved,
    };
  }

  async confirmSiteVisit(
    requestId: string,
    professionalId: string,
    body: { visitDetails?: string },
  ) {
    const request = await this.prisma.siteAccessRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new BadRequestException('Site access request not found');
    }

    if (request.professionalId !== professionalId) {
      throw new BadRequestException('You do not have access to this request');
    }

    if (!['approved_visit_scheduled', 'approved_no_visit', 'visited'].includes(request.status)) {
      throw new BadRequestException('Site visit cannot be confirmed for this request');
    }

    const updatedRequest = await this.prisma.siteAccessRequest.update({
      where: { id: requestId },
      data: {
        status: 'visited',
        visitedAt: new Date(),
        visitDetails: body.visitDetails,
      },
    });

    await this.prisma.projectProfessional.update({
      where: { id: request.projectProfessionalId },
      data: {
        siteVisitedAt: new Date(),
        visitNotes: body.visitDetails,
        visitApprovedButNotDone: false,
      },
    });

    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
    });
    const professionalName =
      professional?.businessName || professional?.fullName || 'Professional';
    await this.addProjectChatMessage(
      request.projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} confirmed a site visit on ${this.formatDateTime(updatedRequest.visitedAt)}.`,
    );

    return {
      success: true,
      request: updatedRequest,
    };
  }

  async requestSiteVisit(
    projectId: string,
    professionalId: string,
    body: { scheduledAt: string; notes?: string },
  ) {
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is required');
    }

    const projectProfessional = await this.prisma.projectProfessional.findUnique({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      include: {
        professional: true,
      },
    });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    if (!['pending', 'accepted', 'quoted', 'awarded'].includes(projectProfessional.status)) {
      throw new BadRequestException('Professional must be invited to request a site visit');
    }

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const hasAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);

    if (!hasAccess) {
      throw new BadRequestException('Site access must be approved before requesting a visit');
    }

    const existingPending = await this.prisma.siteAccessVisit.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: 'proposed',
        proposedByRole: 'professional',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPending) {
      return {
        success: true,
        visit: existingPending,
        message: 'A site visit proposal is already pending',
      };
    }

    const latestAccepted = await this.prisma.siteAccessVisit.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: 'accepted',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestAccepted) {
      await this.prisma.siteAccessVisit.update({
        where: { id: latestAccepted.id },
        data: {
          status: 'cancelled',
          responseNotes: 'Rescheduled by professional',
        },
      });
    }

    const visit = await this.prisma.siteAccessVisit.create({
      data: {
        projectId,
        projectProfessionalId: projectProfessional.id,
        professionalId,
        proposedAt: scheduledAt,
        proposedByRole: 'professional',
        notes: body.notes,
        status: 'proposed',
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    const professionalName =
      projectProfessional.professional?.businessName ||
      projectProfessional.professional?.fullName ||
      'Professional';
    await this.addProjectChatMessage(
      projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} requested a site visit on ${this.formatDateTime(scheduledAt)}.`,
    );

    return {
      success: true,
      visit,
    };
  }

  async respondToSiteVisit(
    visitId: string,
    actorId: string,
    isProfessional: boolean,
    body: { status: 'accepted' | 'declined'; responseNotes?: string },
  ) {
    const visit = await this.prisma.siteAccessVisit.findUnique({
      where: { id: visitId },
      include: {
        project: true,
        professional: true,
      },
    });

    if (!visit) {
      throw new BadRequestException('Site visit not found');
    }

    if (visit.status !== 'proposed') {
      throw new BadRequestException('This site visit has already been responded to');
    }

    if (visit.proposedByRole === 'professional') {
      if (isProfessional) {
        throw new BadRequestException('Only clients can respond to this visit proposal');
      }
      await this.assertClientProjectAccess(visit.projectId, actorId);
    } else {
      if (!isProfessional) {
        throw new BadRequestException('Only professionals can respond to this visit proposal');
      }
      if (visit.professionalId !== actorId) {
        throw new BadRequestException('You do not have access to this visit proposal');
      }
    }

    const updated = await this.prisma.siteAccessVisit.update({
      where: { id: visitId },
      data: {
        status: body.status,
        respondedAt: new Date(),
        respondedBy: !isProfessional ? actorId : null,
        responseNotes: body.responseNotes,
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    if (body.status === 'accepted') {
      await this.prisma.projectProfessional.update({
        where: { id: visit.projectProfessionalId },
        data: {
          visitApprovedButNotDone: true,
        },
      });
    }

    const professionalName =
      visit.professional?.businessName || visit.professional?.fullName || 'Professional';
    const actorLabel = isProfessional ? professionalName : 'Client';
    await this.addProjectChatMessage(
      visit.projectId,
      isProfessional ? 'professional' : 'client',
      isProfessional ? null : actorId,
      isProfessional ? actorId : null,
      body.status === 'accepted'
        ? `${actorLabel} accepted the proposed site visit for ${this.formatDateTime(visit.proposedAt)}.`
        : `${actorLabel} declined the proposed site visit for ${this.formatDateTime(visit.proposedAt)}${body.responseNotes ? `: ${body.responseNotes}` : '.'}`,
    );

    return {
      success: true,
      visit: updated,
    };
  }

  async completeSiteVisit(
    visitId: string,
    professionalId: string,
    body: { visitDetails?: string },
  ) {
    const visit = await this.prisma.siteAccessVisit.findUnique({
      where: { id: visitId },
    });

    if (!visit) {
      throw new BadRequestException('Site visit not found');
    }

    if (visit.professionalId !== professionalId) {
      throw new BadRequestException('You do not have access to this visit');
    }

    if (visit.status !== 'accepted') {
      throw new BadRequestException('Only accepted visits can be completed');
    }

    const updated = await this.prisma.siteAccessVisit.update({
      where: { id: visitId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        responseNotes: body.visitDetails ?? visit.responseNotes,
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    await this.prisma.projectProfessional.update({
      where: { id: visit.projectProfessionalId },
      data: {
        siteVisitedAt: new Date(),
        visitNotes: body.visitDetails,
        visitApprovedButNotDone: false,
      },
    });

    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
    });
    const professionalName =
      professional?.businessName || professional?.fullName || 'Professional';
    await this.addProjectChatMessage(
      visit.projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} marked the site visit as completed on ${this.formatDateTime(updated.completedAt)}.`,
    );

    return {
      success: true,
      visit: updated,
    };
  }

  async getSiteVisits(
    projectId: string,
    actorId: string,
    isProfessional: boolean,
  ) {
    if (isProfessional) {
      const projectProfessional = await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId: actorId,
          },
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Professional is not linked to this project');
      }

      const visits = await this.prisma.siteAccessVisit.findMany({
        where: { projectProfessionalId: projectProfessional.id },
        include: { professional: true },
        orderBy: { proposedAt: 'desc' },
      });

      return { success: true, visits };
    }

    await this.assertClientProjectAccess(projectId, actorId);
    const visits = await this.prisma.siteAccessVisit.findMany({
      where: { projectId },
      include: { professional: true },
      orderBy: { proposedAt: 'desc' },
    });

    return { success: true, visits };
  }

  async getSiteAccessStatus(projectId: string, professionalId: string) {
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
      });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const hasAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);

    const siteAccessData = hasAccess
      ? await this.prisma.siteAccessData.findUnique({
          where: { projectId },
        })
      : null;

    return {
      success: true,
      requestId: latestAccessRequest?.id || null,
      requestStatus: latestAccessRequest?.status || 'none',
      visitScheduledFor: latestAccessRequest?.visitScheduledFor || null,
      visitScheduledAt: latestAccessRequest?.visitScheduledAt || null,
      visitedAt: latestAccessRequest?.visitedAt || null,
      reasonDenied: latestAccessRequest?.reasonDenied || null,
      hasAccess,
      siteAccessData,
    };
  }

  async submitLocationDetails(
    projectId: string,
    userId: string,
    body: {
      addressFull: string;
      postalCode?: string;
      gpsCoordinates?: { lat: number; lng: number };
      unitNumber?: string;
      floorLevel?: string;
      propertyType?: string;
      propertySize?: string;
      propertyAge?: string;
      accessDetails?: string;
      existingConditions?: string;
      specialRequirements?: Array<string> | Record<string, unknown>;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
      accessHoursDescription?: string;
      desiredStartDate?: string;
      photoUrls?: string[];
    },
  ) {
    const project = await this.assertClientProjectAccess(projectId, userId);

    const awardedAssignment = await this.prisma.projectProfessional.findFirst({
      where: {
        projectId,
        status: 'awarded',
      },
      select: { id: true },
    });

    const isAwardedStage = project.status === 'awarded' || !!awardedAssignment;

    const missingFields: string[] = [];

    if (!body.addressFull?.trim()) missingFields.push('Full Address');
    if (!body.unitNumber?.trim()) missingFields.push('Unit Number');
    if (!body.floorLevel?.trim()) missingFields.push('Floor Level');

    if (isAwardedStage) {
      if (!body.postalCode?.trim()) missingFields.push('Postal Code / District');
      if (!body.propertyType?.trim()) missingFields.push('Property Type');
      if (!body.propertySize?.trim()) missingFields.push('Property Size');
      if (!body.propertyAge?.trim()) missingFields.push('Property Age');
      if (!body.existingConditions?.trim()) missingFields.push('Existing Conditions');
      if (!body.accessDetails?.trim()) missingFields.push('Access Details');
      if (!body.accessHoursDescription?.trim()) missingFields.push('Access Hours');
      if (!body.onSiteContactName?.trim()) missingFields.push('On-site Contact Name');
      if (!body.onSiteContactPhone?.trim()) missingFields.push('On-site Contact Phone');
      if (!body.desiredStartDate?.trim()) missingFields.push('Desired Start Date');
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        isAwardedStage
          ? `Awarded projects require complete location details. Missing: ${missingFields.join(', ')}`
          : `Bidding stage requires basic location details. Missing: ${missingFields.join(', ')}`,
      );
    }

    if (
      project.escrowRequired &&
      project.escrowHeld &&
      new Decimal(project.escrowHeld.toString()).lessThan(
        new Decimal(project.escrowRequired.toString()),
      )
    ) {
      throw new BadRequestException('Escrow must be confirmed before submitting location details');
    }

    const details = await this.prisma.projectLocationDetails.upsert({
      where: { projectId },
      create: {
        projectId,
        addressFull: body.addressFull,
        postalCode: body.postalCode,
        gpsCoordinates: body.gpsCoordinates || undefined,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        propertyType: body.propertyType,
        propertySize: body.propertySize,
        propertyAge: body.propertyAge,
        accessDetails: body.accessDetails,
        existingConditions: body.existingConditions,
        specialRequirements: (body.specialRequirements as Prisma.InputJsonValue) || undefined,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        accessHoursDescription: body.accessHoursDescription,
        desiredStartDate: body.desiredStartDate
          ? new Date(body.desiredStartDate)
          : undefined,
        photoUrls: body.photoUrls || [],
        status: 'submitted',
        submittedBy: userId,
      },
      update: {
        addressFull: body.addressFull,
        postalCode: body.postalCode,
        gpsCoordinates: body.gpsCoordinates || undefined,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        propertyType: body.propertyType,
        propertySize: body.propertySize,
        propertyAge: body.propertyAge,
        accessDetails: body.accessDetails,
        existingConditions: body.existingConditions,
        specialRequirements: (body.specialRequirements as Prisma.InputJsonValue) || undefined,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        accessHoursDescription: body.accessHoursDescription,
        desiredStartDate: body.desiredStartDate
          ? new Date(body.desiredStartDate)
          : undefined,
        photoUrls: body.photoUrls || [],
        status: 'submitted',
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        locationDetailsStatus: 'submitted',
        locationDetailsProvidedAt: new Date(),
        locationDetailsRequiredAt: project.locationDetailsRequiredAt || new Date(),
      },
    });

    return {
      success: true,
      details,
    };
  }

  async getSiteAccessRequests(projectId: string, userId: string) {
    await this.assertClientProjectAccess(projectId, userId);

    const requests = await this.prisma.siteAccessRequest.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            fullName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
        projectProfessional: {
          select: {
            id: true,
            status: true,
            quoteAmount: true,
            quotedAt: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    const siteAccessData = await this.prisma.siteAccessData.findUnique({
      where: { projectId },
    });

    return {
      success: true,
      requests,
      siteAccessData,
    };
  }

  async confirmDepositPaid(transactionId: string, projectId: string) {
    // Verify the transaction exists and is a pending escrow deposit request
    const transaction = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        project: {
          include: {

          },
        },
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.projectId !== projectId) {
      throw new Error('Transaction does not belong to this project');
    }

    if (transaction.type !== 'escrow_deposit_request') {
      throw new Error('This transaction is not an escrow deposit request');
    }

    if ((transaction.status || '').toLowerCase() !== 'pending') {
      throw new Error('This deposit request is not pending');
    }

    // Create a new transaction confirming the payment was made by client
    await this.prisma.financialTransaction.create({
      data: {
        projectId,
        projectProfessionalId: transaction.projectProfessionalId,
        type: 'escrow_deposit_confirmation',
        description: 'Client confirms deposit payment made to Fitout Hub escrow',
        amount: transaction.amount,
        status: 'pending',
        requestedBy: transaction.requestedBy,
        requestedByRole: 'client',
        actionBy: 'foh',  // Action required from FOH/platform admin team
        actionByRole: 'platform',
        actionAt: new Date(),
        actionComplete: false,  // Pending FOH admin confirmation
        notes: `Confirmation for escrow deposit request ${transactionId}`,
      },
    });

    // Update the original transaction status (client confirmed payment)
    await this.prisma.financialTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'paid',
        actionBy: transaction.requestedBy,
        actionByRole: 'client',
        actionAt: new Date(),
        actionComplete: true,
        notes: `${transaction.notes || ''} | Client confirmed payment made`,
      },
    });

    // Move project to PRE_WORK once escrow deposit is confirmed by client
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        currentStage: ProjectStage.PRE_WORK,
        stageStartedAt: new Date(),
      },
    });

    return { success: true };
  }

  async awardQuote(projectId: string, professionalId: string) {
    // Verify ProjectProfessional relationship exists and has a quote
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          project: {
            include: {

              professionals: {
                include: { professional: true },
              },
            },
          },
          professional: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (!projectProfessional.quotedAt) {
      throw new Error('Professional has not submitted a quote yet');
    }

    const quoteStartAt = projectProfessional.quoteEstimatedStartAt
      ? new Date(projectProfessional.quoteEstimatedStartAt)
      : null;
    const hasValidQuoteStartAt =
      !!quoteStartAt && !Number.isNaN(quoteStartAt.getTime());
    const quoteDurationMinutes = Math.max(
      0,
      Number((projectProfessional as any)?.quoteEstimatedDurationMinutes) || 0,
    );
    const quoteEndAt =
      hasValidQuoteStartAt && quoteDurationMinutes > 0
        ? new Date((quoteStartAt as Date).getTime() + quoteDurationMinutes * 60 * 1000)
        : null;

    const { awarded } = await this.prisma.$transaction(async (tx) => {
      // Update this professional's status to "awarded"
      const awardedPP = await tx.projectProfessional.update({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        data: {
          status: 'awarded',
        },
        include: {
          professional: true,
          project: {
            include: {

            },
          },
        },
      });

      // Auto-approve awarded professional's pending site access request (if any)
      await tx.siteAccessRequest.updateMany({
        where: {
          projectProfessionalId: awardedPP.id,
          status: 'pending',
        },
        data: {
          status: 'approved_no_visit',
          respondedAt: new Date(),
        },
      });

      // Mark project as awarded for downstream views
      await tx.project.update({
        where: { id: projectId },
        data: {
          status: 'awarded',
          currentStage: ProjectStage.CONTRACT_PHASE,
          awardedProjectProfessionalId: awardedPP.id,
          startDate: hasValidQuoteStartAt ? (quoteStartAt as Date) : undefined,
          endDate: quoteEndAt || undefined,
        },
      });

      // Create financial transactions mirroring the client acceptance flow
      const quoteAmount = projectProfessional.quoteAmount
        ? new Decimal(projectProfessional.quoteAmount.toString())
        : new Decimal(0);

      if (quoteAmount.greaterThan(0)) {
        const clientId = projectProfessional.project?.clientId || projectProfessional.project?.userId;
        // Informational line: quotation accepted (mark as complete since no action needed)
        const quoteTx = await tx.financialTransaction.create({
          data: {
            projectId,
            projectProfessionalId: awardedPP.id,
            type: 'quotation_accepted',
            description: `Quotation accepted from ${projectProfessional.professional?.businessName || projectProfessional.professional?.fullName || 'Professional'}`,
            amount: quoteAmount,
            status: 'info',
            requestedBy: clientId,
            requestedByRole: 'client',
            actionBy: clientId,
            actionByRole: 'client',
            actionComplete: true,  // Info transactions don't require action
          },
        });

        // Persist approved budget + award pointers on project
        await tx.project.update({
          where: { id: projectId },
          data: {
            approvedBudget: quoteAmount,
            approvedBudgetTxId: quoteTx.id,
            awardedProjectProfessionalId: awardedPP.id,
            escrowRequired: quoteAmount,
          },
        });

        // Escrow deposit request is intentionally created later,
        // after both parties have signed the standard contract.
      }

      await this.ensureProjectPaymentPlan(tx as any, {
        projectId,
        projectProfessionalId: awardedPP.id,
        totalAmount: quoteAmount.toNumber(),
        explicitScale: (projectProfessional.project as any)?.projectScale || null,
        quoteEstimatedDurationMinutes:
          (projectProfessional as any)?.quoteEstimatedDurationMinutes || null,
        quoteEstimatedStartAt:
          (projectProfessional as any)?.quoteEstimatedStartAt || null,
        tradesRequired: (projectProfessional.project as any)?.tradesRequired || [],
        isEmergency: (projectProfessional.project as any)?.isEmergency || false,
      });

      return { awarded: awardedPP };
    });

    const project = projectProfessional.project;
    const professionals = project.professionals;
    const winnerName =
      projectProfessional.professional.fullName ||
      projectProfessional.professional.businessName ||
      'Professional';
    const clientName = project.clientName;
    const notificationAudit = this.createNotificationAudit(
      'quote_award_notifications',
      projectId,
      {
        awardedProfessionalId: professionalId,
      },
    );
    const winnerAudit: NotificationAuditRecipient = {
      actorType: 'professional',
      actorId: professionalId,
      role: 'winner',
      email: { status: 'skipped' },
      direct: { status: 'skipped' },
    };

    // Send winner notification

    console.log('[ProjectsService.awardQuote] Notifying winner:', {
      projectId,
      professionalId,
      email: projectProfessional.professional.email,
    });

    try {
      await this.emailService.sendWinnerNotification({
        to: projectProfessional.professional.email,
        professionalName: winnerName,
        projectName: project.projectName,
        quoteAmount: projectProfessional.quoteAmount?.toString() || '0',
        nextStepsMessage:
          'The client will contact you soon to discuss next steps. You can share your contact details or continue communicating via the platform for transparency and project management.\n\nWhile you are waiting for the client to get in contact with you, please ensure you sign the project contract, available in your project panel. Without a signed, binding contract we will not ask the client to fund the project.',
      });
      winnerAudit.email.status = 'sent';
    } catch (error) {
      winnerAudit.email.status = 'failed';
      winnerAudit.email.error = error?.message;
      throw error;
    }

    // Send preferred channel notification to winner (email remains as backup)
    try {
      console.log('[ProjectsService.awardQuote] Preparing notification for professional:', {
        professionalId: projectProfessional.professional.id,
        professionalEmail: projectProfessional.professional.email,
        professionalPhone: projectProfessional.professional.phone ? `${projectProfessional.professional.phone.substring(0, 4)}...` : null,
      });

      const preference = await this.prisma.notificationPreference.findUnique({
        where: { professionalId: projectProfessional.professional.id },
        select: {
          primaryChannel: true,
          fallbackChannel: true,
          enableWhatsApp: true,
          enableSMS: true,
        },
      });

      const preferredChannel = preference?.primaryChannel;
      const fallbackChannel = preference?.fallbackChannel;

      const isMessagingChannel = (channel?: NotificationChannel | null) =>
        channel === NotificationChannel.WHATSAPP ||
        channel === NotificationChannel.SMS;

      const isChannelEnabled = (channel?: NotificationChannel | null) => {
        if (!channel) return false;
        if (channel === NotificationChannel.WHATSAPP) {
          return preference?.enableWhatsApp ?? true;
        }
        if (channel === NotificationChannel.SMS) {
          return preference?.enableSMS ?? true;
        }
        return false;
      };

      let directChannel: NotificationChannel | null = null;
      if (isMessagingChannel(preferredChannel) && isChannelEnabled(preferredChannel)) {
        directChannel = preferredChannel as NotificationChannel;
      } else if (
        isMessagingChannel(fallbackChannel) &&
        isChannelEnabled(fallbackChannel)
      ) {
        directChannel = fallbackChannel as NotificationChannel;
      } else if (!preference) {
        directChannel = NotificationChannel.WHATSAPP;
      }
      winnerAudit.direct.preferredChannel = preferredChannel;
      winnerAudit.direct.channel = directChannel;

      // TODO(notification-templates): revisit award-notification templates per channel in a dedicated template pass.
      const winnerShortMsg = `Congratulations! Your quote for "${project.projectName}" has been awarded. The client will contact you soon to discuss next steps.`;

      if (projectProfessional.professional.phone && directChannel) {
        console.log('[ProjectsService.awardQuote] Sending notification to:', projectProfessional.professional.phone);

        const sendResult = await this.notificationService.send({
          professionalId: projectProfessional.professional.id,
          phoneNumber: projectProfessional.professional.phone,
          channel: directChannel,
          eventType: 'quote_awarded',
          message: winnerShortMsg,
        });

        if (sendResult.success) {
          winnerAudit.direct.status = 'sent';
          console.log('[ProjectsService.awardQuote] Notification sent successfully');
        } else {
          winnerAudit.direct.status = 'failed';
          winnerAudit.direct.error =
            sendResult.error || 'Direct winner notification failed';
        }
      } else {
        winnerAudit.direct.status = 'skipped';
        winnerAudit.direct.reason = !projectProfessional.professional.phone
          ? 'missing_phone'
          : preference
            ? 'no_enabled_messaging_channel'
            : 'missing_notification_preference';
        console.log('[ProjectsService.awardQuote] Skipping direct winner notification (no phone or primary channel is EMAIL/unsupported)', {
          hasPhone: Boolean(projectProfessional.professional.phone),
          preferredChannel,
        });
      }
    } catch (error) {
      winnerAudit.direct.status = 'failed';
      winnerAudit.direct.error = error?.message;
      console.error('[ProjectsService.awardQuote] Failed to send preferred-channel notification to winner:', error);
      console.error('[ProjectsService.awardQuote] Error details:', {
        message: error?.message,
      });
    }

    this.pushNotificationAuditRecipient(notificationAudit, winnerAudit);

    // Send escrow notification to professional
    const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';
    await this.emailService.sendEscrowNotification({
      to: projectProfessional.professional.email,
      professionalName: winnerName,
      projectName: project.projectName,
      invoiceAmount: `$${projectProfessional.quoteAmount?.toString() || '0'}`,
      projectUrl: `${webBaseUrl}/professional-projects/${awarded.id}`,
    });

    // Send notifications to non-declined, non-awarded professionals
    const otherProfessionals = professionals.filter(
      (pp: any) =>
        pp.professionalId !== professionalId &&
        !['declined', 'rejected'].includes(pp.status),
    );

    for (const pp of otherProfessionals) {
      const nonWinnerAudit: NotificationAuditRecipient = {
        actorType: 'professional',
        actorId: pp.professional.id,
        role: 'non_winner',
        email: { status: 'skipped' },
        direct: { status: 'skipped' },
      };

      try {
        await this.emailService.sendLoserNotification({
          to: pp.professional.email,
          professionalName:
            pp.professional.fullName ||
            pp.professional.businessName ||
            'Professional',
          projectName: project.projectName,
          thankYouMessage:
            'Thank you for your time and effort on this project. We hope to work with you on future opportunities.',
        });
        nonWinnerAudit.email.status = 'sent';
      } catch (err) {
        nonWinnerAudit.email.status = 'failed';
        nonWinnerAudit.email.error = err?.message;
        console.error(
          '[ProjectsService.awardQuote] Failed to send loser notification',
          {
            to: pp.professional.email,
            error: err?.message,
          },
        );
      }

      try {
        const preference = await this.prisma.notificationPreference.findUnique({
          where: { professionalId: pp.professional.id },
          select: {
            primaryChannel: true,
            fallbackChannel: true,
            enableWhatsApp: true,
            enableSMS: true,
          },
        });

        const preferredChannel = preference?.primaryChannel;
        const fallbackChannel = preference?.fallbackChannel;

        const isMessagingChannel = (channel?: NotificationChannel | null) =>
          channel === NotificationChannel.WHATSAPP ||
          channel === NotificationChannel.SMS;

        const isChannelEnabled = (channel?: NotificationChannel | null) => {
          if (!channel) return false;
          if (channel === NotificationChannel.WHATSAPP) {
            return preference?.enableWhatsApp ?? true;
          }
          if (channel === NotificationChannel.SMS) {
            return preference?.enableSMS ?? true;
          }
          return false;
        };

        let directChannel: NotificationChannel | null = null;
        if (isMessagingChannel(preferredChannel) && isChannelEnabled(preferredChannel)) {
          directChannel = preferredChannel as NotificationChannel;
        } else if (
          isMessagingChannel(fallbackChannel) &&
          isChannelEnabled(fallbackChannel)
        ) {
          directChannel = fallbackChannel as NotificationChannel;
        } else if (!preference) {
          directChannel = NotificationChannel.WHATSAPP;
        }
        nonWinnerAudit.direct.preferredChannel = preferredChannel;
        nonWinnerAudit.direct.channel = directChannel;

        if (pp.professional.phone && directChannel) {
          const sendResult = await this.notificationService.send({
            professionalId: pp.professional.id,
            phoneNumber: pp.professional.phone,
            channel: directChannel,
            eventType: 'quote_not_awarded',
            message: `Update on "${project.projectName}": another professional was selected this time. Thank you for your quote—we hope to work with you on a future project.`,
          });

          if (sendResult.success) {
            nonWinnerAudit.direct.status = 'sent';
          } else {
            nonWinnerAudit.direct.status = 'failed';
            nonWinnerAudit.direct.error =
              sendResult.error || 'Direct non-winner notification failed';
          }
        } else {
          nonWinnerAudit.direct.status = 'skipped';
          nonWinnerAudit.direct.reason = !pp.professional.phone
            ? 'missing_phone'
            : preference
              ? 'no_enabled_messaging_channel'
              : 'missing_notification_preference';
        }
      } catch (err) {
        nonWinnerAudit.direct.status = 'failed';
        nonWinnerAudit.direct.error = err?.message;
        console.error(
          '[ProjectsService.awardQuote] Failed to send preferred-channel non-winner notification',
          {
            professionalId: pp.professional?.id,
            error: err?.message,
          },
        );
      }

      this.pushNotificationAuditRecipient(notificationAudit, nonWinnerAudit);
    }

    await this.finalizeNotificationAudit(notificationAudit);

    // Add system messages to project chat
    // Winner message
    await this.prisma.message.create({
      data: {
        projectProfessionalId: projectProfessional.id,
        senderType: 'client',
        senderClientId: project.clientId,
        content: `✓ Quote awarded. ${clientName} has selected your quote. Next steps will be discussed via the platform or direct contact.`,
      },
    });

    // Loser messages
    for (const pp of otherProfessionals) {
      // Update status to declined for non-awarded professionals
      try {
        await this.prisma.projectProfessional.update({
          where: { id: pp.id },
          data: { status: 'declined' },
        });

        // Cancel any pending site access requests from non-awarded professionals
        await this.prisma.siteAccessRequest.updateMany({
          where: {
            projectProfessionalId: pp.id,
            status: 'pending',
          },
          data: {
            status: 'cancelled',
            respondedAt: new Date(),
          },
        });
      } catch (err) {
        console.error(
          '[ProjectsService.awardQuote] Failed to update loser status to declined',
          {
            projectProfessionalId: pp.id,
            error: (err as Error)?.message,
          },
        );
      }
      await this.prisma.message.create({
        data: {
          projectProfessionalId: pp.id,
          senderType: 'client',
          senderClientId: project.clientId,
          content: `Thank you for your quote on "${project.projectName}". Another professional was selected for this project. We appreciate your time and hope to work with you in the future.`,
        },
      });
    }

    return awarded;
  }

  async reverseAward(
    projectId: string,
    adminUserId: string,
    body: { reason: string; reopenPriorQuotes?: boolean },
  ) {
    const reason = body.reason?.trim();
    if (!reason || reason.length < 5) {
      throw new BadRequestException('A clear admin reason is required to reverse an award');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: {
          select: {
            id: true,
            mobile: true,
            email: true,
          },
        },
        professionals: {
          include: {
            professional: true,
            paymentRequests: {
              select: { id: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const awardedProjectProfessional =
      project.professionals.find((pp: any) => pp.id === project.awardedProjectProfessionalId) ||
      project.professionals.find((pp: any) => pp.status === 'awarded');

    if (!awardedProjectProfessional) {
      throw new BadRequestException('No awarded professional is currently attached to this project');
    }

    const [nonAwardFinancialCount, projectPaymentRequestCount] = await Promise.all([
      this.prisma.financialTransaction.count({
        where: {
          projectId,
          type: { not: 'quotation_accepted' },
        },
      }),
      this.prisma.paymentRequest.count({
        where: {
          projectProfessional: {
            projectId,
          },
        },
      }),
    ]);

    const blockers: string[] = [];
    if (project.clientSignedAt) {
      blockers.push('client has already signed the contract');
    }
    if (project.professionalSignedAt) {
      blockers.push('professional has already signed the contract');
    }
    if (project.escrowHeld && new Decimal(project.escrowHeld.toString()).greaterThan(0)) {
      blockers.push('escrow funds are already held');
    }
    if (nonAwardFinancialCount > 0) {
      blockers.push('financial activity exists beyond quotation acceptance');
    }
    if (projectPaymentRequestCount > 0 || awardedProjectProfessional.paymentRequests?.length > 0) {
      blockers.push('payment requests already exist for this project');
    }

    if (blockers.length > 0) {
      throw new BadRequestException(
        `Award cannot be reversed automatically because ${blockers.join('; ')}. Please use a managed dispute or cancellation process instead.`,
      );
    }

    const reopenPriorQuotes = body.reopenPriorQuotes !== false;
    const reversedProfessionalName =
      awardedProjectProfessional.professional?.fullName ||
      awardedProjectProfessional.professional?.businessName ||
      awardedProjectProfessional.professional?.email ||
      'Professional';

    const priorQuotedProfessionals = project.professionals.filter(
      (pp: any) =>
        pp.id !== awardedProjectProfessional.id &&
        !!pp.quotedAt &&
        ['declined', 'quoted', 'counter_requested'].includes(pp.status),
    );

    const reopenedIds = reopenPriorQuotes
      ? priorQuotedProfessionals
          .filter((pp: any) => pp.status === 'declined' || pp.status === 'counter_requested')
          .map((pp: any) => pp.id)
      : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.projectProfessional.update({
        where: { id: awardedProjectProfessional.id },
        data: {
          status: 'award_reversed',
        },
      });

      if (reopenPriorQuotes && reopenedIds.length > 0) {
        await tx.projectProfessional.updateMany({
          where: { id: { in: reopenedIds } },
          data: {
            status: 'quoted',
          },
        });
      }

      await tx.projectStartProposal.updateMany({
        where: {
          projectId,
          projectProfessionalId: awardedProjectProfessional.id,
          status: 'proposed',
        },
        data: {
          status: 'superseded',
          respondedAt: new Date(),
          responseNotes: reason,
        },
      });

      await tx.project.update({
        where: { id: projectId },
        data: {
          status: 'quoted',
          currentStage: ProjectStage.QUOTE_RECEIVED,
          awardedProjectProfessionalId: null,
          approvedBudget: null,
          approvedBudgetTxId: null,
          escrowRequired: null,
          startDate: null,
          endDate: null,
          contractorName: null,
          contractorContactName: null,
          contractorContactPhone: null,
          contractorContactEmail: null,
        },
      });

      await (tx as any).activityLog.create({
        data: {
          userId: adminUserId,
          actorName: 'Admin',
          actorType: 'admin',
          action: 'project_award_reversed',
          resource: 'Project',
          resourceId: projectId,
          details: `Award reversed for ${reversedProfessionalName}`,
          metadata: {
            projectId,
            awardedProjectProfessionalId: awardedProjectProfessional.id,
            reversedProfessionalId: awardedProjectProfessional.professionalId,
            reopenPriorQuotes,
            reopenedProjectProfessionalIds: reopenedIds,
            reason,
          },
          status: 'warning',
        },
      });
    });

    try {
      if (awardedProjectProfessional.professional?.phone) {
        await this.notificationService.send({
          professionalId: awardedProjectProfessional.professional.id,
          phoneNumber: awardedProjectProfessional.professional.phone,
          eventType: 'award_reversed',
          message: `Admin update for "${project.projectName}": the award has been reversed and the project has been reopened for review. Reason: ${reason}`,
        });
      }
    } catch (error) {
      console.error('[ProjectsService.reverseAward] Failed to notify reversed professional:', error);
    }

    if (reopenPriorQuotes) {
      for (const projectProfessional of priorQuotedProfessionals) {
        if (!reopenedIds.includes(projectProfessional.id)) continue;
        try {
          if (projectProfessional.professional?.phone) {
            await this.notificationService.send({
              professionalId: projectProfessional.professional.id,
              phoneNumber: projectProfessional.professional.phone,
              eventType: 'quote_reopened',
              message: `Admin update for "${project.projectName}": the project has been reopened for quote review and your quotation is active again.`,
            });
          }
        } catch (error) {
          console.error('[ProjectsService.reverseAward] Failed to notify reopened professional:', error);
        }
      }
    }

    return {
      success: true,
      message: reopenPriorQuotes
        ? 'Award reversed and prior quoted professionals were reopened for review'
        : 'Award reversed successfully',
      reversedProfessionalId: awardedProjectProfessional.professionalId,
      reopenedProjectProfessionalIds: reopenedIds,
    };
  }

  async shareContact(
    projectId: string,
    professionalId: string,
    clientId?: string,
  ) {
    // Verify ProjectProfessional relationship exists and quote is awarded
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: {
            include: {
              user: true,

            },
          },
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (projectProfessional.status !== 'awarded') {
      throw new Error('Quote must be awarded before sharing contact details');
    }

    // Update ProjectProfessional to mark contact shared
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        directContactShared: true,
        directContactSharedAt: new Date(),
      },
    });

    const project = projectProfessional.project;
    const professional = projectProfessional.professional;
    const clientName = project.user
      ? `${project.user.firstName} ${project.user.surname}`.trim()
      : project.clientName;
    const clientPhone = project.user?.mobile || 'Not provided';
    const professionalName =
      professional.fullName || professional.businessName || 'Professional';

    // Send notification email to professional with client contact
    await this.emailService.sendContactShared({
      to: professional.email,
      professionalName,
      clientName,
      clientPhone,
      projectName: project.projectName,
    });

    // Return professional contact to client
    return {
      success: true,
      professional: {
        name: professionalName,
        phone: professional.phone,
        email: professional.email,
      },
    };
  }

  async counterRequest(projectId: string, professionalId: string) {
    // Verify ProjectProfessional exists and has a quote
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (!projectProfessional.quotedAt) {
      throw new Error('Professional has not submitted a quote yet');
    }

    // Update status to counter_requested
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        status: 'counter_requested',
      },
    });

    const project = projectProfessional.project;
    const professional = projectProfessional.professional;
    const professionalName =
      professional.fullName || professional.businessName || 'Professional';

    // Send notification email to professional
    await this.emailService.sendCounterRequest({
      to: professional.email,
      professionalName,
      projectName: project.projectName,
      currentQuote: projectProfessional.quoteAmount?.toString() || '0',
    });

    // Add system message
    await this.prisma.message.create({
      data: {
        projectProfessionalId: projectProfessional.id,
        senderType: 'client',
        senderClientId: project.clientId,
        content: `The client has requested a better offer. Please review and submit an updated quote if possible.`,
      },
    });

    return {
      success: true,
      message: 'Counter-request sent to professional',
    };
  }

  async updateQuote(
    projectId: string,
    professionalId: string,
    quoteAmount: number,
    quoteNotes?: string,
    quoteEstimatedStartAt?: string,
    quoteEstimatedDurationMinutes?: number,
    quoteEstimatedDurationUnit?: string,
  ) {
    // Verify ProjectProfessional exists
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    const quoteSchedule = this.normalizeQuoteSchedule(
      {
        quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes,
        quoteEstimatedDurationUnit,
      },
      { required: true },
    );

    // Calculate gross price (with platform fee) from professional's base quote
    const feeBreakdown = await this.platformFeeService.calculateGrossPrice(
      quoteAmount,
      professionalId,
      projectProfessional.project?.clientId || undefined,
    );

    // Update quote
    const updated = await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        quoteBaseAmount: feeBreakdown.baseAmount,
        quoteAmount: feeBreakdown.grossAmount,  // Client sees this (gross with fee)
        quotePlatformFeeAmount: feeBreakdown.platformFeeAmount,
        quotePlatformFeePercent: feeBreakdown.effectivePercent,
        quotePricingVersion: feeBreakdown.pricingVersion,
        quotePlatformFeeBreakdown: feeBreakdown as any,
        feeCalculatedAt: feeBreakdown.calculatedAt,
        quoteNotes,
        quoteEstimatedStartAt: quoteSchedule.quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes:
          quoteSchedule.quoteEstimatedDurationMinutes,
        quoteEstimatedDurationUnit: quoteSchedule.quoteEstimatedDurationUnit,
        quotedAt: new Date(),
        status: 'quoted', // Reset to quoted for client review
      },
      include: {
        professional: true,
      },
    });

    // Add system message
    await this.prisma.message.create({
      data: {
        projectProfessionalId: projectProfessional.id,
        senderType: 'professional',
        senderProfessionalId: professionalId,
        content: `Updated quote: $${feeBreakdown.grossAmount} (base: $${feeBreakdown.baseAmount}) · Estimated start ${this.formatDateTime(quoteSchedule.quoteEstimatedStartAt)} · Duration ${this.formatDurationMinutes(quoteSchedule.quoteEstimatedDurationMinutes || 0)}${quoteNotes ? ` - ${quoteNotes}` : ''}`,
      },
    });

    return {
      success: true,
      message: 'Quote updated successfully',
      projectProfessional: updated,
    };
  }

  async updateProjectSchedule(
    projectId: string,
    startDate?: string,
    endDate?: string,
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Update schedule fields
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });

    return {
      success: true,
      message: 'Schedule updated successfully',
      project: updated,
    };
  }

  async updateContractorContact(
    projectId: string,
    name?: string,
    phone?: string,
    email?: string,
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Update contractor contact fields
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        contractorContactName: name,
        contractorContactPhone: phone,
        contractorContactEmail: email,
      },
    });

    return {
      success: true,
      message: 'Contractor contact updated successfully',
      project: updated,
    };
  }

  async withdrawProject(projectId: string, userId: string) {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {

        professionals: {
          include: { professional: true },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found or not authorized');
    }

    const hasAwarded = project.professionals?.some(
      (pp: any) => pp.status === 'awarded',
    );
    if (hasAwarded) {
      throw new Error('Project already awarded; cannot withdraw');
    }

    const toNotify = (project.professionals || []).filter((pp: any) => {
      if (pp.status === 'awarded') return false;
      if (pp.status === 'accepted' || pp.status === 'quoted' || pp.status === 'counter_requested') return true;
      if (pp.createdAt && pp.createdAt >= cutoff) return true;
      return false;
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'withdrawn' },
    });

    await this.prisma.projectProfessional.updateMany({
      where: {
        projectId,
        status: { in: ['pending', 'accepted', 'quoted', 'counter_requested'] },
      },
      data: { status: 'withdrawn' },
    });

    // Notify professionals via email and system message
    await Promise.all(
      toNotify.map(async (pp: any) => {
        const professionalName =
          pp.professional.fullName || pp.professional.businessName || 'Professional';

        await this.prisma.message.create({
          data: {
            projectProfessionalId: pp.id,
            senderType: 'client',
            senderClientId: project.clientId,
            content:
              '🚫 Project withdrawn by client. Thank you for your participation.',
          },
        });

        try {
          await this.emailService.sendProjectWithdrawnNotification({
            to: pp.professional.email,
            professionalName,
            projectName: project.projectName,
          });
        } catch (err) {
          console.error('[ProjectsService.withdrawProject] Email failed', {
            to: pp.professional.email,
            error: (err as Error)?.message,
          });
        }
      }),
    );

    return { success: true, status: 'withdrawn' };
  }

  async archive(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if ((project.status || '').toLowerCase() === this.ARCHIVED_STATUS) {
      return { success: true, status: this.ARCHIVED_STATUS, alreadyArchived: true };
    }

    await this.prisma.project.update({
      where: { id },
      data: { status: this.ARCHIVED_STATUS, updatedAt: new Date() },
    });

    return { success: true, status: this.ARCHIVED_STATUS };
  }

  async unarchive(id: string, status = 'pending') {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if ((status || '').toLowerCase() === this.ARCHIVED_STATUS) {
      throw new BadRequestException('Unarchive status cannot be archived');
    }

    if ((project.status || '').toLowerCase() !== this.ARCHIVED_STATUS) {
      return { success: true, status: project.status, alreadyActive: true };
    }

    await this.prisma.project.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });

    return { success: true, status };
  }

  async remove(id: string) {
    return this.archive(id);
  }

  private buildBulkCleanWhere(criteria: {
    statuses?: string[];
    olderThanDays?: number;
    createdBefore?: string;
    includeArchived?: boolean;
  }): Prisma.ProjectWhereInput {
    const where: Prisma.ProjectWhereInput = {};

    const normalizedStatuses = Array.isArray(criteria.statuses)
      ? criteria.statuses
          .map((status) => String(status || '').trim().toLowerCase())
          .filter((status) => status.length > 0)
      : [];

    if (normalizedStatuses.length > 0) {
      where.status = { in: normalizedStatuses };
    } else if (!criteria.includeArchived) {
      where.status = { not: this.ARCHIVED_STATUS };
    }

    if (Number.isFinite(criteria.olderThanDays) && Number(criteria.olderThanDays) > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(criteria.olderThanDays));
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), lte: cutoff };
    }

    if (criteria.createdBefore) {
      const parsed = new Date(criteria.createdBefore);
      if (!Number.isNaN(parsed.getTime())) {
        where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), lte: parsed };
      }
    }

    return where;
  }

  async bulkCleanPreview(criteria: {
    statuses?: string[];
    olderThanDays?: number;
    createdBefore?: string;
    includeArchived?: boolean;
    limit?: number;
  }) {
    const where = this.buildBulkCleanWhere(criteria);
    const safeLimit = Number.isFinite(criteria.limit)
      ? Math.min(Math.max(Number(criteria.limit), 1), 500)
      : 200;

    const [totalMatched, statusBreakdown, sampleProjects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          projectName: true,
          status: true,
          createdAt: true,
        },
        take: safeLimit,
      }),
    ]);

    const projectIds = sampleProjects.map((project) => project.id);
    const affected = projectIds.length
      ? await Promise.all([
          this.prisma.projectPhoto.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.projectProfessional.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.projectAssistRequest.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.projectChatThread.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.financialTransaction.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.siteAccessRequest.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.siteAccessVisit.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.projectMilestone.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.nextStepAction.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.adminAction.count({ where: { projectId: { in: projectIds } } }),
          this.prisma.supportRequest.count({ where: { projectId: { in: projectIds } } }),
        ])
      : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    return {
      criteria: {
        statuses: criteria.statuses || [],
        olderThanDays: criteria.olderThanDays || null,
        createdBefore: criteria.createdBefore || null,
        includeArchived: !!criteria.includeArchived,
      },
      totalMatched,
      sampled: sampleProjects.length,
      statusBreakdown: statusBreakdown.map((row) => ({ status: row.status, count: row._count.status })),
      sampleProjects,
      sampleImpact: {
        projectPhotos: affected[0],
        projectProfessionals: affected[1],
        projectAssistRequests: affected[2],
        projectChatThreads: affected[3],
        financialTransactions: affected[4],
        siteAccessRequests: affected[5],
        siteAccessVisits: affected[6],
        projectMilestones: affected[7],
        nextStepActions: affected[8],
        adminActions: affected[9],
        supportRequestsLinked: affected[10],
      },
    };
  }

  async bulkCleanExecute(criteria: {
    action: 'archive' | 'permanent_delete';
    statuses?: string[];
    olderThanDays?: number;
    createdBefore?: string;
    includeArchived?: boolean;
    limit?: number;
  }) {
    const where = this.buildBulkCleanWhere(criteria);
    const safeLimit = Number.isFinite(criteria.limit)
      ? Math.min(Math.max(Number(criteria.limit), 1), 500)
      : 200;

    const candidates = await this.prisma.project.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
      },
      take: safeLimit,
    });

    if (criteria.action === 'archive') {
      const targetIds = candidates
        .filter((project) => (project.status || '').toLowerCase() !== this.ARCHIVED_STATUS)
        .map((project) => project.id);

      if (targetIds.length === 0) {
        return {
          action: criteria.action,
          selected: candidates.length,
          affected: 0,
          skipped: candidates.length,
        };
      }

      const result = await this.prisma.project.updateMany({
        where: {
          id: { in: targetIds },
        },
        data: {
          status: this.ARCHIVED_STATUS,
          updatedAt: new Date(),
        },
      });

      return {
        action: criteria.action,
        selected: candidates.length,
        affected: result.count,
        skipped: candidates.length - result.count,
      };
    }

    let deleted = 0;
    for (const project of candidates) {
      await this.hardRemove(project.id);
      deleted += 1;
    }

    return {
      action: criteria.action,
      selected: candidates.length,
      affected: deleted,
      skipped: candidates.length - deleted,
    };
  }

  async hardRemove(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        notes: true,
        photos: {
          select: {
            url: true,
            note: true,
          },
        },
        milestones: {
          select: {
            notes: true,
            photoUrls: true,
          },
        },
        locationDetails: {
          select: {
            photoUrls: true,
          },
        },
        assistRequests: {
          select: {
            id: true,
            notes: true,
            messages: {
              select: {
                content: true,
              },
            },
          },
        },
        chatThread: {
          select: {
            id: true,
            messages: {
              select: {
                content: true,
                attachments: true,
              },
            },
          },
        },
      },
    });

    const supportRequests = await this.prisma.supportRequest.findMany({
      where: { projectId: id },
      select: {
        id: true,
        body: true,
        notes: true,
        replies: true,
      },
    });

    const privateThreads = await this.prisma.privateChatThread.findMany({
      where: { projectId: id },
      select: {
        id: true,
        messages: {
          select: {
            content: true,
            attachments: true,
          },
        },
      },
    });

    const assistIds = project?.assistRequests?.map((request) => request.id) || [];
    const supportIds = supportRequests.map((request) => request.id);
    const privateIds = privateThreads.map((thread) => thread.id);
    const projectThreadIds = project?.chatThread?.id ? [project.chatThread.id] : [];

    const assignmentFilters: Array<{ sourceType: string; sourceId: string }> = [
      { sourceType: 'project', sourceId: id },
      ...assistIds.map((sourceId) => ({ sourceType: 'assist', sourceId })),
      ...supportIds.map((sourceId) => ({ sourceType: 'support', sourceId })),
      ...privateIds.map((sourceId) => ({ sourceType: 'private', sourceId })),
      ...projectThreadIds.map((sourceId) => ({ sourceType: 'project', sourceId })),
    ];

    const caseWhereOr: Array<Record<string, string>> = [{ projectId: id }];
    assistIds.forEach((assistRequestId) => caseWhereOr.push({ assistRequestId }));
    supportIds.forEach((supportRequestId) => caseWhereOr.push({ supportRequestId }));
    privateIds.forEach((privateChatId) => caseWhereOr.push({ privateChatId }));

    const fileCandidates: unknown[] = [
      project?.notes,
      ...(project?.photos || []).flatMap((photo) => [photo.url, photo.note]),
      ...(project?.milestones || []).flatMap((milestone) => [milestone.notes, milestone.photoUrls]),
      project?.locationDetails?.photoUrls,
      ...(project?.assistRequests || []).flatMap((request) => [
        request.notes,
        request.messages.map((message) => message.content),
      ]),
      ...(project?.chatThread?.messages || []).flatMap((message) => [message.content, message.attachments]),
      ...supportRequests.flatMap((request) => [request.body, request.notes, request.replies]),
      ...privateThreads.flatMap((thread) =>
        thread.messages.flatMap((message) => [message.content, message.attachments]),
      ),
    ];

    const result = await this.prisma.$transaction(async (tx) => {
      if (assignmentFilters.length > 0) {
        await tx.adminMessageAssignment.deleteMany({
          where: {
            OR: assignmentFilters,
          },
        });
      }

      if (caseWhereOr.length > 0) {
        await (tx as any).case.deleteMany({
          where: {
            OR: caseWhereOr,
          },
        });
      }

      if (supportIds.length > 0) {
        await tx.supportRequest.deleteMany({
          where: {
            id: { in: supportIds },
          },
        });
      }

      if (privateIds.length > 0) {
        await tx.privateChatThread.deleteMany({
          where: {
            id: { in: privateIds },
          },
        });
      }

      await (tx as any).activityLog.deleteMany({
        where: {
          resource: 'Project',
          resourceId: id,
        },
      });

      return tx.project.delete({
        where: { id },
      });
    });

    await this.deleteProjectFiles(fileCandidates);

    return result;
  }

  private async deleteProjectFiles(values: unknown[]) {
    const files = this.extractUploadFilepaths(values);
    if (files.length === 0) {
      return;
    }

    await Promise.all(
      files.map(async (filepath) => {
        try {
          await fs.unlink(filepath);
        } catch (err) {
          return;
        }
      }),
    );
  }

  private extractUploadFilepaths(values: unknown[]): string[] {
    const uploadsRoot = resolve(process.cwd(), 'uploads');
    const filepaths = new Set<string>();

    const visit = (value: unknown) => {
      if (value == null) return;

      if (typeof value === 'string') {
        const matches = value.match(/(https?:\/\/[^\s,;"')]+|\/uploads\/[^\s,;"')]+)/g) || [];
        matches.forEach((raw) => {
          const uploadIndex = raw.indexOf('/uploads/');
          if (uploadIndex === -1) return;

          const relative = raw
            .slice(uploadIndex + '/uploads/'.length)
            .split(/[?#]/)[0]
            .trim();
          if (!relative) return;

          const target = resolve(uploadsRoot, relative);
          if (!target.startsWith(uploadsRoot)) return;

          filepaths.add(target);
        });
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      if (typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(visit);
      }
    };

    values.forEach(visit);
    return Array.from(filepaths);
  }

  // Removed payInvoice flow; payments are handled via escrow and payment requests
}
