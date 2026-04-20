import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { NotificationChannel, Prisma, ProjectStage } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { ChatService } from '../chat/chat.service';
import { NotificationService } from '../notifications/notification.service';
import { StripePaymentsService } from './stripe-payments.service';
import { createHash, randomInt } from 'crypto';

export interface CreateFinancialTransactionDto {
  projectId: string;
  projectProfessionalId?: string;
  type: 'escrow_deposit' | 'payment_request' | 'advance_payment_approval' | 'advance_payment_rejection' | 'release_payment' | 'escrow_confirmation' | 'escrow_deposit_request' | 'escrow_deposit_confirmation' | 'quotation_accepted' | string;
  description: string;
  amount: number | string;
  requestedBy?: string;
  requestedByRole?: 'client' | 'professional' | 'admin' | 'platform';
  actionBy?: string;  // who needs to take action on this transaction
  actionByRole?: 'client' | 'professional' | 'admin';
  actionComplete?: boolean;  // true for info transactions or completed items
  notes?: string;
}

export interface UpdateFinancialTransactionDto {
  status?: 'pending' | 'confirmed' | 'rejected' | 'info';
  actionBy?: string;  // who took the action
  actionByRole?: 'client' | 'admin' | 'professional';
  actionAt?: Date;  // when action was taken
  actionComplete?: boolean;  // mark action complete
  notes?: string;
}

type SlaMode = 'hours' | 'working_days';
type SlaCategory =
  | 'escrow_deposit'
  | 'upfront_payment'
  | 'milestone_payment'
  | 'final_payment'
  | 'cancellation_payment'
  | 'retention_release';

type SlaRule = {
  mode: SlaMode;
  value: number;
};

type SlaCategoryPolicy = Record<SlaCategory, SlaRule>;

type StoredSlaPolicy = {
  version: 1;
  categories: Partial<SlaCategoryPolicy>;
};

@Injectable()
export class FinancialService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private chatService: ChatService,
    private notificationService: NotificationService,
    private stripePaymentsService: StripePaymentsService,
  ) {}

  private readonly slaMarker = '__FOH_SLA_POLICY__';
  private readonly allowedHourIncrements = new Set([12, 24, 36, 48, 72, 96]);
  private readonly allowedWorkingDayIncrements = new Set([1, 2, 3, 4, 5]);

  private isMissingProcurementEvidenceTableError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    );
  }

  private rethrowProcurementEvidenceTableError(error: unknown): never {
    if (this.isMissingProcurementEvidenceTableError(error)) {
      throw new ServiceUnavailableException(
        'Procurement evidence database migration has not been applied yet',
      );
    }

    throw error;
  }

  private getDefaultSlaByScale(scale?: string | null): SlaCategoryPolicy {
    const normalized = String(scale || 'SCALE_1').toUpperCase();
    const base: SlaRule =
      normalized === 'SCALE_3'
        ? { mode: 'working_days', value: 3 }
        : normalized === 'SCALE_2'
          ? { mode: 'hours', value: 48 }
          : { mode: 'hours', value: 24 };

    return {
      escrow_deposit: { ...base },
      upfront_payment: { ...base },
      milestone_payment: { ...base },
      final_payment: { ...base },
      cancellation_payment: { ...base },
      retention_release: { ...base },
    };
  }

  private parseStoredSlaPolicy(adminComment?: string | null): StoredSlaPolicy | null {
    if (!adminComment) return null;
    const index = adminComment.indexOf(this.slaMarker);
    if (index < 0) return null;
    const payload = adminComment.slice(index + this.slaMarker.length).trim();
    if (!payload) return null;
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === 'object') {
        return parsed as StoredSlaPolicy;
      }
    } catch {
      return null;
    }
    return null;
  }

  private stripSlaPolicyMarker(adminComment?: string | null) {
    if (!adminComment) return '';
    const index = adminComment.indexOf(this.slaMarker);
    if (index < 0) return adminComment.trim();
    return adminComment.slice(0, index).trim();
  }

  private mergeSlaPolicy(scale: string | null | undefined, stored?: StoredSlaPolicy | null): SlaCategoryPolicy {
    const defaults = this.getDefaultSlaByScale(scale);
    if (!stored?.categories) return defaults;

    const merged = { ...defaults };
    (Object.keys(stored.categories) as SlaCategory[]).forEach((key) => {
      const rule = stored.categories[key];
      if (!rule) return;
      if ((rule.mode !== 'hours' && rule.mode !== 'working_days') || !Number.isFinite(rule.value)) return;
      merged[key] = {
        mode: rule.mode,
        value: Math.max(1, Math.floor(Number(rule.value))),
      };
    });
    return merged;
  }

  private validateSlaCategories(categories?: Record<string, { mode: SlaMode; value: number }>) {
    if (!categories || typeof categories !== 'object') return;

    const allowedKeys: SlaCategory[] = [
      'escrow_deposit',
      'upfront_payment',
      'milestone_payment',
      'final_payment',
      'cancellation_payment',
      'retention_release',
    ];

    for (const [rawKey, rawRule] of Object.entries(categories)) {
      if (!allowedKeys.includes(rawKey as SlaCategory)) {
        throw new BadRequestException(`Unsupported SLA category: ${rawKey}`);
      }
      if (!rawRule || (rawRule.mode !== 'hours' && rawRule.mode !== 'working_days')) {
        throw new BadRequestException(`Invalid SLA mode for category ${rawKey}`);
      }
      const value = Math.floor(Number(rawRule.value));
      if (!Number.isFinite(value) || value <= 0) {
        throw new BadRequestException(`Invalid SLA value for category ${rawKey}`);
      }
      if (rawRule.mode === 'hours' && !this.allowedHourIncrements.has(value)) {
        throw new BadRequestException(`SLA hours for ${rawKey} must be one of 12,24,36,48,72,96`);
      }
      if (rawRule.mode === 'working_days' && !this.allowedWorkingDayIncrements.has(value)) {
        throw new BadRequestException(`SLA working days for ${rawKey} must be one of 1,2,3,4,5`);
      }
    }
  }

  private addWorkingDays(startAt: Date, days: number): Date {
    const result = new Date(startAt);
    let remaining = Math.max(0, Math.floor(days));
    while (remaining > 0) {
      result.setDate(result.getDate() + 1);
      const day = result.getDay();
      if (day !== 0 && day !== 6) {
        remaining -= 1;
      }
    }
    return result;
  }

  private resolveSlaCategoryForTransaction(input: {
    type: string;
    notes?: string | null;
    amount: number;
    planTotal: number;
    retentionReleaseAt?: Date | null;
  }): SlaCategory | null {
    const type = String(input.type || '').toLowerCase();
    if (type === 'escrow_deposit' || type === 'escrow_deposit_confirmation' || type === 'escrow_deposit_request') {
      return 'escrow_deposit';
    }
    if (type === 'retention_release') {
      return 'retention_release';
    }
    if (type === 'cancellation_payment') {
      return 'cancellation_payment';
    }
    if (type === 'payment_request' || type === 'release_payment') {
      const meta = this.parseMilestoneMetadata(input.notes);
      if (meta?.milestoneSequence === 1) return 'upfront_payment';
      if (meta?.milestoneTitle && /final|completion/i.test(meta.milestoneTitle)) return 'final_payment';
      if (meta?.paymentMilestoneId) return 'milestone_payment';
      if (input.planTotal > 0 && input.amount >= input.planTotal * 0.95) return 'final_payment';
      return 'milestone_payment';
    }
    return null;
  }

  private appendNote(existing: string | null | undefined, extra: string) {
    const trimmedExtra = String(extra || '').trim();
    if (!trimmedExtra) {
      return existing || '';
    }
    return existing ? `${existing} | ${trimmedExtra}` : trimmedExtra;
  }

  private mapRoleToActorType(role?: string | null): 'user' | 'professional' | 'admin' | 'system' {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'admin') return 'admin';
    if (normalized === 'professional') return 'professional';
    if (normalized === 'client' || normalized === 'user' || normalized === 'platform') return 'user';
    return 'system';
  }

  private async createFinancialAuditLog(input: {
    transactionId: string;
    action: string;
    actorId?: string | null;
    actorRole?: string | null;
    details: string;
    status?: 'success' | 'info' | 'warning' | 'danger';
    metadata?: Record<string, unknown>;
  }) {
    const actorRole = String(input.actorRole || 'system').toLowerCase();
    const actorType = this.mapRoleToActorType(actorRole);

    let actorName = actorRole || 'system';
    let userId: string | null = null;
    let professionalId: string | null = null;

    try {
      if (actorType === 'admin' || actorType === 'user') {
        const user = input.actorId
          ? await this.prisma.user.findUnique({
              where: { id: input.actorId },
              select: { id: true, firstName: true, surname: true, email: true },
            })
          : null;
        if (user) {
          userId = user.id;
          actorName =
            [user.firstName, user.surname].filter(Boolean).join(' ').trim() ||
            user.email ||
            actorName;
        } else if (input.actorId) {
          actorName = `${actorRole}:${input.actorId}`;
        }
      } else if (actorType === 'professional') {
        const professional = input.actorId
          ? await this.prisma.professional.findUnique({
              where: { id: input.actorId },
              select: { id: true, fullName: true, businessName: true, email: true },
            })
          : null;
        if (professional) {
          professionalId = professional.id;
          actorName =
            professional.fullName ||
            professional.businessName ||
            professional.email ||
            actorName;
        } else if (input.actorId) {
          actorName = `${actorRole}:${input.actorId}`;
        }
      } else {
        actorName = input.actorId ? `system:${input.actorId}` : 'system';
      }

      await (this.prisma as any).activityLog.create({
        data: {
          userId,
          professionalId,
          actorName,
          actorType,
          action: input.action,
          resource: 'FinancialTransaction',
          resourceId: input.transactionId,
          details: input.details,
          metadata: input.metadata || {},
          status: input.status || 'success',
        },
      });
    } catch (error) {
      console.warn('[FinancialService] Failed to write financial audit log:', error);
    }
  }

  private async attachAuditSummary<T extends { id: string }>(transactions: T[]): Promise<Array<T & {
    auditSummary: {
      totalEvents: number;
      latestEventAt: Date | null;
      latestAction: string | null;
      latestStatus: string | null;
      latestActorName: string | null;
      latestActorType: string | null;
    };
  }>> {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return [];
    }

    const transactionIds = transactions.map((t) => t.id);
    const logs = await (this.prisma as any).activityLog.findMany({
      where: {
        resource: 'FinancialTransaction',
        resourceId: { in: transactionIds },
      },
      select: {
        resourceId: true,
        action: true,
        status: true,
        actorName: true,
        actorType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const grouped = new Map<string, Array<any>>();
    for (const entry of logs) {
      const key = String(entry.resourceId || '');
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }

    return transactions.map((tx) => {
      const txLogs = grouped.get(tx.id) || [];
      const latest = txLogs[0];
      return {
        ...tx,
        auditSummary: {
          totalEvents: txLogs.length,
          latestEventAt: latest?.createdAt || null,
          latestAction: latest?.action || null,
          latestStatus: latest?.status || null,
          latestActorName: latest?.actorName || null,
          latestActorType: latest?.actorType || null,
        },
      };
    });
  }

  private parseMilestoneMetadata(notes?: string | null): {
    paymentMilestoneId?: string;
    paymentPlanId?: string;
    milestoneSequence?: number;
    milestoneTitle?: string;
    timingStatus?: 'early' | 'on_time' | 'late';
    plannedDueAt?: string;
  } | null {
    if (!notes) return null;

    const marker = '__FOH_MILESTONE__';
    const markerIndex = notes.indexOf(marker);
    if (markerIndex === -1) return null;

    const jsonPayload = notes.slice(markerIndex + marker.length).trim();
    if (!jsonPayload) return null;

    try {
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  private serializeMilestoneMetadata(extra: Record<string, unknown>) {
    return `__FOH_MILESTONE__${JSON.stringify(extra)}`;
  }

  private toAmount(value: unknown) {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value instanceof Decimal) {
      return Number(value.toString());
    }
    if (typeof value === 'object' && value && 'toString' in (value as any)) {
      const parsed = Number((value as any).toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private async getMilestoneProcurementContext(projectId: string, milestoneId: string) {
    const paymentPlan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      include: {
        project: {
          select: {
            id: true,
            userId: true,
            projectName: true,
          },
        },
        projectProfessional: {
          select: {
            id: true,
            professionalId: true,
            professional: {
              select: {
                id: true,
                email: true,
                phone: true,
                contactName: true,
                companyName: true,
              },
            },
          },
        },
        milestones: {
          where: { id: milestoneId },
          take: 1,
        },
      },
    });

    if (!paymentPlan) {
      throw new NotFoundException('Payment plan not found for this project');
    }

    const milestone = paymentPlan.milestones?.[0];
    if (!milestone) {
      throw new NotFoundException('Milestone not found for this project');
    }

    return {
      paymentPlan,
      milestone,
      project: paymentPlan.project,
      projectProfessional: paymentPlan.projectProfessional,
    };
  }

  private hashOtpCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private generateOtpCode() {
    return randomInt(100000, 1000000).toString();
  }

  private async assertEscrowCheckoutPermission(
    transactionId: string,
    actorId: string,
    role: 'client' | 'admin' | 'professional',
  ) {
    const transaction = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            userId: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.type !== 'escrow_deposit_request') {
      throw new BadRequestException('Only escrow deposit requests can be paid via checkout');
    }

    const status = (transaction.status || '').toLowerCase();
    if (status !== 'pending') {
      throw new BadRequestException('This escrow request is no longer payable');
    }

    if (role === 'professional') {
      throw new ForbiddenException('Professionals cannot pay escrow deposits');
    }

    if (role === 'client' && transaction.project?.userId !== actorId) {
      throw new ForbiddenException('You do not have permission to pay this escrow request');
    }

    const amountNumber = Number(transaction.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      throw new BadRequestException('Invalid escrow amount');
    }

    return { transaction, amountNumber };
  }

  async requestEscrowCheckoutOtp(
    transactionId: string,
    actorId: string,
    role: 'client' | 'admin' | 'professional',
  ) {
    await this.assertEscrowCheckoutPermission(transactionId, actorId, role);

    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      include: { notificationPreference: true },
    });

    if (!user?.email) {
      throw new BadRequestException('Account email is required to send OTP');
    }

    const preferredChannel =
      user.notificationPreference?.primaryChannel || NotificationChannel.EMAIL;
    const code = this.generateOtpCode();
    const codeHash = this.hashOtpCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await (this.prisma as any).escrowCheckoutOtpChallenge.updateMany({
      where: {
        transactionId,
        actorUserId: actorId,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await (this.prisma as any).escrowCheckoutOtpChallenge.create({
      data: {
        transactionId,
        actorUserId: actorId,
        codeHash,
        preferredChannel,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
      },
    });

    const channelsSent = ['EMAIL'];
    await this.emailService.sendOtpCode({
      to: user.email,
      code,
      firstName: user.firstName || undefined,
      minutesValid: 10,
    });

    if (
      preferredChannel !== NotificationChannel.EMAIL &&
      user.mobile &&
      (preferredChannel === NotificationChannel.SMS ||
        preferredChannel === NotificationChannel.WHATSAPP)
    ) {
      await this.notificationService.send({
        userId: user.id,
        phoneNumber: user.mobile,
        channel: preferredChannel,
        eventType: 'escrow_checkout_otp',
        message: `Your Fitout Hub escrow payment OTP is ${code}. It expires in 10 minutes.`,
      });
      channelsSent.push(preferredChannel);
    }

    return {
      success: true,
      expiresAt,
      channelsSent,
    };
  }

  async verifyEscrowCheckoutOtp(
    transactionId: string,
    actorId: string,
    role: 'client' | 'admin' | 'professional',
    code: string,
  ) {
    if (!code || !/^\d{6}$/.test(code.trim())) {
      throw new BadRequestException('OTP code must be a 6-digit number');
    }

    await this.assertEscrowCheckoutPermission(transactionId, actorId, role);

    const challenges = await (this.prisma as any).escrowCheckoutOtpChallenge.findMany({
      where: {
        transactionId,
        actorUserId: actorId,
        consumedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!challenges || challenges.length === 0) {
      throw new BadRequestException('No OTP challenge found. Please request a new code.');
    }

    const latestChallenge = challenges[0];

    if (challenges.some((challenge: any) => challenge.verifiedAt)) {
      return {
        success: true,
        verified: true,
      };
    }

    const nowMs = Date.now();
    const verifiableChallenges = challenges.filter((challenge: any) => {
      const notExpired = new Date(challenge.expiresAt).getTime() >= nowMs;
      const attemptsOk = (challenge.attempts || 0) < (challenge.maxAttempts || 5);
      return notExpired && attemptsOk;
    });

    if (verifiableChallenges.length === 0) {
      const latestExpired = new Date(latestChallenge.expiresAt).getTime() < nowMs;
      if (latestExpired) {
        throw new BadRequestException('OTP code has expired. Please request a new code.');
      }
      throw new BadRequestException('Maximum OTP attempts reached. Please request a new code.');
    }

    const providedHash = this.hashOtpCode(code.trim());
    const matchedChallenge = verifiableChallenges.find(
      (challenge: any) => challenge.codeHash === providedHash,
    );

    if (!matchedChallenge) {
      await (this.prisma as any).escrowCheckoutOtpChallenge.update({
        where: { id: latestChallenge.id },
        data: { attempts: (latestChallenge.attempts || 0) + 1 },
      });
      throw new BadRequestException('Invalid OTP code');
    }

    await (this.prisma as any).escrowCheckoutOtpChallenge.update({
      where: { id: matchedChallenge.id },
      data: {
        verifiedAt: new Date(),
      },
    });

    return {
      success: true,
      verified: true,
    };
  }

  private async assertEscrowOtpVerified(transactionId: string, actorId: string) {
    const now = new Date();
    const challenge = await (this.prisma as any).escrowCheckoutOtpChallenge.findFirst({
      where: {
        transactionId,
        actorUserId: actorId,
        verifiedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException('OTP verification is required before checkout');
    }

    return challenge;
  }

  async createEscrowCheckoutSession(
    transactionId: string,
    actorId: string,
    role: 'client' | 'admin' | 'professional',
  ) {
    if (!this.stripePaymentsService.isConfigured()) {
      throw new InternalServerErrorException('Stripe is not configured on the API server');
    }

    const { transaction, amountNumber } = await this.assertEscrowCheckoutPermission(
      transactionId,
      actorId,
      role,
    );
    const verifiedChallenge = await this.assertEscrowOtpVerified(transactionId, actorId);

    const amountInCents = Math.round(amountNumber * 100);
    const projectName = transaction.project?.projectName || 'Project';
    const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';
    const projectId = transaction.projectId;

    const session = await this.stripePaymentsService.createCheckoutSession({
      mode: 'payment',
      success_url: `${webBaseUrl}/projects/${projectId}?tab=overview&section=progress-financials&payment=success`,
      cancel_url: `${webBaseUrl}/projects/${projectId}?tab=overview&section=progress-financials&payment=cancelled`,
      client_reference_id: projectId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'hkd',
            product_data: {
              name: `Escrow deposit - ${projectName}`,
              description: `Project ${projectId}`,
            },
            unit_amount: amountInCents,
          },
        },
      ],
      metadata: {
        transactionId,
        projectId,
      },
    });

    await this.prisma.financialTransaction.update({
      where: { id: transactionId },
      data: {
        notes: this.appendNote(transaction.notes, `stripe_checkout_session:${session.id} | otp_verified_challenge:${verifiedChallenge.id}`),
      },
    });

    await (this.prisma as any).escrowCheckoutOtpChallenge.update({
      where: { id: verifiedChallenge.id },
      data: {
        consumedAt: new Date(),
      },
    });

    if (!session.url) {
      throw new Error('Stripe checkout session did not return a redirect URL');
    }

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  }

  async handleStripeWebhookEvent(event: { type: string; data: { object: any } }) {
    const eventType = event.type;
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(eventType)) {
      return { processed: false, reason: 'event_ignored' };
    }

    const session = event.data?.object;
    const transactionId = session?.metadata?.transactionId as string | undefined;
    const stripeSessionId = session?.id as string | undefined;
    const paymentIntentId =
      typeof session?.payment_intent === 'string'
        ? session.payment_intent
        : session?.payment_intent?.id;

    if (!transactionId || !stripeSessionId) {
      return { processed: false, reason: 'missing_metadata' };
    }

    const requestTx = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        project: {
          select: { id: true },
        },
      },
    });

    if (!requestTx) {
      return { processed: false, reason: 'transaction_not_found' };
    }

    if (requestTx.type !== 'escrow_deposit_request') {
      return { processed: false, reason: 'not_escrow_request' };
    }

    const existingConfirmed = await this.prisma.financialTransaction.findFirst({
      where: {
        projectId: requestTx.projectId,
        projectProfessionalId: requestTx.projectProfessionalId,
        type: 'escrow_deposit_confirmation',
        status: 'confirmed',
        notes: {
          contains: `request ${requestTx.id}`,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingConfirmed) {
      return { processed: true, alreadyProcessed: true };
    }

    if ((requestTx.status || '').toLowerCase() === 'pending') {
      await this.prisma.financialTransaction.update({
        where: { id: requestTx.id },
        data: {
          status: 'paid',
          actionBy: 'stripe',
          actionByRole: 'platform',
          actionAt: new Date(),
          actionComplete: true,
          notes: this.appendNote(
            requestTx.notes,
            `Stripe payment completed (session:${stripeSessionId}${paymentIntentId ? `,intent:${paymentIntentId}` : ''})`,
          ),
        },
      });
    }

    let confirmationTx = await this.prisma.financialTransaction.findFirst({
      where: {
        projectId: requestTx.projectId,
        projectProfessionalId: requestTx.projectProfessionalId,
        type: 'escrow_deposit_confirmation',
        notes: {
          contains: `request ${requestTx.id}`,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!confirmationTx) {
      confirmationTx = await this.prisma.financialTransaction.create({
        data: {
          projectId: requestTx.projectId,
          projectProfessionalId: requestTx.projectProfessionalId,
          type: 'escrow_deposit_confirmation',
          description: 'Escrow payment completed via Stripe Checkout',
          amount: requestTx.amount,
          status: 'pending',
          requestedBy: requestTx.requestedBy,
          requestedByRole: 'client',
          actionBy: 'platform',
          actionByRole: 'platform',
          actionComplete: false,
          notes: `Confirmation for escrow deposit request ${requestTx.id} | stripe_session:${stripeSessionId}${paymentIntentId ? ` | stripe_intent:${paymentIntentId}` : ''}`,
        },
      });
    }

    if ((confirmationTx.status || '').toLowerCase() !== 'confirmed') {
      await this.confirmEscrowDeposit(confirmationTx.id, 'stripe-webhook');
    }

    await this.prisma.project.update({
      where: { id: requestTx.projectId },
      data: {
        currentStage: ProjectStage.PRE_WORK,
        stageStartedAt: new Date(),
      },
    });

    return { processed: true };
  }

  /**
   * Retry helper with exponential backoff for transient errors
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelayMs = 100,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await Promise.race([
          operation(),
          new Promise<T>((_, reject) =>
            setTimeout(
              () => reject(new Error('Operation timeout')),
              5000, // 5 second timeout per operation
            ),
          ),
        ]);
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          const delayMs = initialDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Create a new financial transaction
   */
  async createTransaction(data: CreateFinancialTransactionDto) {
    return this.retryWithBackoff(() =>
      this.prisma.financialTransaction.create({
        data: {
          projectId: data.projectId,
          projectProfessionalId: data.projectProfessionalId,
          type: data.type,
          description: data.description,
          amount: new Decimal(data.amount.toString()),
          requestedBy: data.requestedBy,
          requestedByRole: data.requestedByRole,
          actionBy: data.actionBy,
          actionByRole: data.actionByRole,
          actionComplete: data.actionComplete ?? false,  // default to false for pending items
          notes: data.notes,
        },
      }),
    );
  }

  /**
   * Get all transactions for a project - optimized with minimal includes
   */
  async getProjectTransactions(projectId: string) {
    const transactions = await this.retryWithBackoff(() =>
      this.prisma.financialTransaction.findMany({
        where: { projectId },
        select: {
          id: true,
          projectProfessionalId: true,
          type: true,
          description: true,
          amount: true,
          status: true,
          requestedBy: true,
          requestedByRole: true,
          actionBy: true,
          actionByRole: true,
          actionAt: true,
          actionComplete: true,
          notes: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1000, // Limit results to prevent memory issues
      }),
    );

    return this.attachAuditSummary(transactions as any[]);
  }

  /**
   * Get a single transaction
   */
  async getTransaction(transactionId: string) {
    const transaction = await this.retryWithBackoff(() =>
      this.prisma.financialTransaction.findUnique({
        where: { id: transactionId },
      }),
    );

    if (!transaction) return transaction;
    const [withSummary] = await this.attachAuditSummary([transaction as any]);
    return withSummary;
  }

  async getTransactionAuditTrail(transactionId: string) {
    const transaction = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return (this.prisma as any).activityLog.findMany({
      where: {
        resource: 'FinancialTransaction',
        resourceId: transactionId,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        actorName: true,
        actorType: true,
        action: true,
        details: true,
        metadata: true,
        status: true,
        createdAt: true,
      },
    });
  }

  /**
   * Update a transaction (typically for status changes)
   */
  async updateTransaction(transactionId: string, data: UpdateFinancialTransactionDto) {
    return this.retryWithBackoff(() =>
      this.prisma.financialTransaction.update({
        where: { id: transactionId },
        data: {
          status: data.status,
          actionBy: data.actionBy,
          actionByRole: data.actionByRole,
          actionAt: data.actionAt,
          actionComplete: data.actionComplete,

          notes: data.notes,
        },
      }),
    );
  }

  /**
   * Create an escrow deposit request (auto-created when project is awarded)
   */
  async createEscrowDepositRequest(projectId: string, amount: number | Decimal) {
    const amountValue = amount instanceof Decimal ? amount.toNumber() : amount;
    return this.createTransaction({
      projectId,
      type: 'escrow_deposit_request',
      description: 'Request to deposit project fees to escrow',
      amount: amountValue,
      requestedByRole: 'platform',
    });
  }

  /**
   * Create an advance payment request by professional
   */
  async createAdvancePaymentRequest(
    projectProfessionalId: string,
    amount: number,
    requestedBy: string,
  ) {
    const projectProf = await this.prisma.projectProfessional.findUnique({
      where: { id: projectProfessionalId },
      include: {
        project: { select: { id: true, projectName: true, clientId: true, userId: true } },
      },
    });

    if (!projectProf) {
      throw new Error(`ProjectProfessional not found with id: ${projectProfessionalId}`);
    }

    const clientId = projectProf.project?.clientId || projectProf.project?.userId || undefined;

    if (!clientId) {
      throw new Error('Could not determine clientId from project');
    }

    const created = await this.createTransaction({
      projectId: projectProf.projectId,
      projectProfessionalId,
      type: 'payment_request',
      description: 'Payment request from professional',
      amount,
      requestedBy,
      requestedByRole: 'professional',
      actionBy: clientId,
      actionByRole: 'client',
      actionComplete: false,
    });

    try {
      const client = await this.prisma.user.findUnique({
        where: { id: clientId },
        select: { id: true, mobile: true },
      });

      if (client?.mobile) {
        const formatter = new Intl.NumberFormat('en-HK', {
          style: 'currency',
          currency: 'HKD',
          minimumFractionDigits: 0,
        });
        await this.notificationService.send({
          userId: client.id,
          phoneNumber: client.mobile,
          eventType: 'payment_request_created',
          message: `A new payment request for ${formatter.format(Number(amount))} is waiting for your approval on "${projectProf.project.projectName || 'Project'}".`,
        });
      }
    } catch (notificationError) {
      console.warn('[FinancialService] Failed to notify client about payment request:', notificationError);
    }

    return created;
  }

  /**
   * Approve advance payment request (client approves, creates release_payment for admin)
   */
  async approveAdvancePayment(transactionId: string, approvedBy: string, approverRole: 'client' | 'admin' = 'client') {
    const tx = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        projectProfessional: {
          include: {
            professional: true,
            project: true,
          },
        },
      },
    });

    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.type !== 'payment_request') {
      throw new BadRequestException('Only payment requests can be approved');
    }

    const status = String(tx.status || '').toLowerCase();
    if (status === 'rejected') {
      throw new BadRequestException('This payment request was already rejected');
    }
    if (status === 'confirmed' || tx.actionComplete) {
      return {
        updated: tx,
        releasePaymentTx: await this.prisma.financialTransaction.findFirst({
          where: {
            projectId: tx.projectId,
            projectProfessionalId: tx.projectProfessionalId,
            type: 'release_payment',
            notes: {
              contains: `source_payment_request:${tx.id}`,
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      };
    }

    if (
      approverRole === 'client' &&
      tx.actionBy &&
      tx.actionBy !== approvedBy
    ) {
      throw new ForbiddenException('You are not authorized to approve this payment request');
    }

    const result = await this.prisma.$transaction(async (prisma) => {
      const transition = await prisma.financialTransaction.updateMany({
        where: {
          id: transactionId,
          type: 'payment_request',
          status: 'pending',
          actionComplete: false,
        },
        data: {
          status: 'confirmed',
          actionBy: approvedBy,
          actionByRole: approverRole,
          actionAt: new Date(),
          actionComplete: true,
        },
      });

      if (transition.count === 0) {
        const latest = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
        if (latest && (String(latest.status || '').toLowerCase() === 'confirmed' || latest.actionComplete)) {
          const existingRelease = await prisma.financialTransaction.findFirst({
            where: {
              projectId: tx.projectId,
              projectProfessionalId: tx.projectProfessionalId,
              type: 'release_payment',
              notes: {
                contains: `source_payment_request:${tx.id}`,
              },
            },
            orderBy: { createdAt: 'desc' },
          });
          return { updated: latest, releasePaymentTx: existingRelease };
        }
        throw new BadRequestException('Payment request is no longer pending');
      }

      const updated = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
      if (!updated) {
        throw new NotFoundException('Transaction not found after approval');
      }

      const sourceMarker = `source_payment_request:${tx.id}`;

      let releasePaymentTx = await prisma.financialTransaction.findFirst({
        where: {
          projectId: tx.projectId,
          projectProfessionalId: tx.projectProfessionalId,
          type: 'release_payment',
          notes: {
            contains: sourceMarker,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!releasePaymentTx) {
        releasePaymentTx = await prisma.financialTransaction.create({
          data: {
            projectId: tx.projectId,
            projectProfessionalId: tx.projectProfessionalId,
            type: 'release_payment',
            description: `Client approved payment request: ${tx.description}`,
            amount: tx.amount,
            status: 'pending',
            requestedBy: approvedBy,
            requestedByRole: approverRole,
            actionBy: null,
            actionByRole: 'platform',
            actionComplete: false,
            notes: this.appendNote(
              this.appendNote(`Client approval for ${tx.description}`, tx.notes || ''),
              sourceMarker,
            ),
          },
        });
      }

      const pendingPaymentRequest = await (prisma as any).paymentRequest.findFirst({
        where: {
          projectProfessionalId: tx.projectProfessionalId || undefined,
          requestAmount: tx.amount,
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingPaymentRequest) {
        await (prisma as any).paymentRequest.update({
          where: { id: pendingPaymentRequest.id },
          data: {
            status: 'approved',
            approvedAmount: tx.amount,
          },
        });
      }

      // Send message to professional
      if (tx.projectProfessionalId) {
        await prisma.message.create({
          data: {
            projectProfessionalId: tx.projectProfessionalId,
            senderType: 'client',
            content: 'Client has approved your payment request.',
          },
        }).catch(() => void 0); // Don't fail if message creation fails
      }

      return { updated, releasePaymentTx };
    });

    try {
      const formatter = new Intl.NumberFormat('en-HK', {
        style: 'currency',
        currency: 'HKD',
        minimumFractionDigits: 0,
      });
      const formattedAmount = formatter.format(Number(tx.amount));
      const projectName = tx.projectProfessional?.project?.projectName || 'Project';

      const professional = tx.projectProfessional?.professional;
      if (professional?.id && professional?.phone) {
        await this.notificationService.send({
          professionalId: professional.id,
          phoneNumber: professional.phone,
          eventType: 'payment_request_approved',
          message: `Your payment request for ${formattedAmount} on "${projectName}" was approved and sent for admin release.`,
        });
      }

      const admins = await this.prisma.user.findMany({
        where: { role: 'admin', mobile: { not: null } },
        select: { id: true, mobile: true },
      });

      for (const admin of admins) {
        if (!admin.mobile) continue;
        await this.notificationService.send({
          userId: admin.id,
          phoneNumber: admin.mobile,
          eventType: 'payment_release_required',
          message: `Admin action required: release ${formattedAmount} for "${projectName}".`,
        });
      }
    } catch (notificationError) {
      console.warn('[FinancialService] Failed to send approval/release notifications:', notificationError);
    }

    await this.createFinancialAuditLog({
      transactionId,
      action: 'payment_request_approved',
      actorId: approvedBy,
      actorRole: approverRole,
      details: 'Payment request approved; release transaction queued',
      metadata: {
        originalTransactionStatus: tx.status,
        amount: tx.amount?.toString?.() || String(tx.amount),
        projectId: tx.projectId,
        projectProfessionalId: tx.projectProfessionalId,
        releaseTransactionId: result.releasePaymentTx?.id || null,
      },
    });

    return result;
  }

  /**
   * Reject advance payment request
   */
  async rejectAdvancePayment(transactionId: string, approvedBy: string, reason: string, approverRole: 'client' | 'admin' = 'client') {
    const tx = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }
    if (tx.type !== 'payment_request') {
      throw new BadRequestException('Only payment requests can be rejected');
    }
    const status = String(tx.status || '').toLowerCase();
    if (status === 'confirmed' || tx.actionComplete) {
      throw new BadRequestException('This payment request has already been approved');
    }
    if (status === 'rejected') {
      return tx;
    }
    if (
      approverRole === 'client' &&
      tx.actionBy &&
      tx.actionBy !== approvedBy
    ) {
      throw new ForbiddenException('You are not authorized to reject this payment request');
    }

    const result = await this.prisma.$transaction(async (prisma) => {
      const transition = await prisma.financialTransaction.updateMany({
        where: {
          id: transactionId,
          type: 'payment_request',
          status: 'pending',
          actionComplete: false,
        },
        data: {
          status: 'rejected',
          actionBy: approvedBy,
          actionByRole: approverRole,
          actionAt: new Date(),
          actionComplete: true,
          notes: this.appendNote(tx.notes, reason),
        },
      });

      if (transition.count === 0) {
        const latest = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
        if (latest && String(latest.status || '').toLowerCase() === 'rejected') {
          return latest;
        }
        throw new BadRequestException('Payment request is no longer pending');
      }

      const updated = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
      if (!updated) {
        throw new NotFoundException('Transaction not found after rejection');
      }

      const pendingPaymentRequest = await (prisma as any).paymentRequest.findFirst({
        where: {
          projectProfessionalId: tx.projectProfessionalId || undefined,
          requestAmount: tx.amount,
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingPaymentRequest) {
        await (prisma as any).paymentRequest.update({
          where: { id: pendingPaymentRequest.id },
          data: {
            status: 'rejected',
            rejectionReason: reason,
          },
        });
      }

      const milestoneMeta = this.parseMilestoneMetadata(tx.notes);
      if (milestoneMeta?.paymentMilestoneId) {
        await (prisma as any).paymentMilestone.update({
          where: { id: milestoneMeta.paymentMilestoneId },
          data: {
            status: 'scheduled',
            clientComment: reason,
            releaseRequestedAt: null,
          },
        });
      }

      return updated;
    });

    await this.createFinancialAuditLog({
      transactionId,
      action: 'payment_request_rejected',
      actorId: approvedBy,
      actorRole: approverRole,
      details: 'Payment request rejected',
      metadata: {
        reason,
        amount: tx.amount?.toString?.() || String(tx.amount),
        projectId: tx.projectId,
        projectProfessionalId: tx.projectProfessionalId,
      },
    });

    return result;
  }

  /**
   * Confirm escrow deposit
   */
  async confirmEscrowDeposit(transactionId: string, approvedBy: string) {
    // Load transaction with context for messaging
    const tx = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        projectProfessional: {
          include: {
            professional: true,
            project: { include: { user: true } },
          },
        },
      },
    });

    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    if (!['escrow_deposit', 'escrow_deposit_confirmation'].includes(tx.type)) {
      throw new BadRequestException('This transaction is not an escrow deposit');
    }

    const initialStatus = String(tx.status || '').toLowerCase();
    if (initialStatus === 'confirmed' || tx.actionComplete) {
      return tx;
    }
    if (!['pending', 'paid'].includes(initialStatus)) {
      throw new BadRequestException('Escrow deposit cannot be confirmed from current status');
    }

    const updated = await this.prisma.$transaction(async (prisma) => {
      const transition = await prisma.financialTransaction.updateMany({
        where: {
          id: transactionId,
          type: { in: ['escrow_deposit', 'escrow_deposit_confirmation'] },
          actionComplete: false,
          status: { in: ['pending', 'paid'] },
        },
        data: {
          status: 'confirmed',
          actionBy: approvedBy,
          actionByRole: 'admin',
          actionAt: new Date(),
          actionComplete: true,
        },
      });

      if (transition.count === 0) {
        const latest = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
        if (latest && (String(latest.status || '').toLowerCase() === 'confirmed' || latest.actionComplete)) {
          return latest;
        }
        throw new BadRequestException('Escrow deposit is no longer confirmable');
      }

      const updatedTx = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
      if (!updatedTx) {
        throw new NotFoundException('Transaction not found after confirmation');
      }

      // Write ledger entry (credit)
      await prisma.escrowLedger.create({
        data: {
          projectId: tx.projectId,
          projectProfessionalId: tx.projectProfessionalId,
          transactionId: tx.id,
          direction: 'credit',
          amount: tx.amount,
          currency: 'HKD',
          description: `Deposit confirmed: ${tx.description}`,
          createdBy: approvedBy,
        },
      });

      // Update escrowHeld on project
      const project = await prisma.project.findUnique({ where: { id: tx.projectId }, select: { escrowHeld: true } });
      const currentHeld = project?.escrowHeld ? Number(project.escrowHeld) : 0;
      const newHeld = currentHeld + Number(tx.amount);
      await prisma.project.update({
        where: { id: tx.projectId },
        data: {
          escrowHeld: newHeld,
          escrowHeldUpdatedAt: new Date(),
        },
      });

      // B.2: If this deposit request was linked to a rolling-policy milestone,
      // transition the milestone from escrow_requested → escrow_funded.
      const milestoneMeta = this.parseMilestoneMetadata(tx.notes);
      if (milestoneMeta?.paymentMilestoneId) {
        const currentMilestone = await (prisma as any).paymentMilestone.findUnique({
          where: { id: milestoneMeta.paymentMilestoneId },
          select: { status: true },
        });
        if (currentMilestone?.status === 'escrow_requested') {
          await (prisma as any).paymentMilestone.update({
            where: { id: milestoneMeta.paymentMilestoneId },
            data: {
              status: 'escrow_funded',
              escrowFundedAt: new Date(),
            },
          });
        }
      }

      return updatedTx;
    });

    // Project chat announcement
    if (tx.projectProfessional?.projectId) {
      const thread = await this.chatService.getOrCreateProjectThread(tx.projectProfessional.projectId);
      await this.chatService.addProjectMessage(
        (thread as any).id || (thread as any).threadId,
        'admin',
        null,
        null,
        'Funds secure in escrow, project can commence.',
        undefined,
      );
    }

    // Email notifications to client and professional
    // Note: Client is now stored as User (role='client'), access via project.user
    const clientEmail = tx.projectProfessional?.project?.user?.email;
    const professionalEmail = tx.projectProfessional?.professional?.email;
    const projectName = tx.projectProfessional?.project?.projectName || 'Project';
    const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';

    if (professionalEmail) {
      await this.emailService.sendFundsSecureNotification({
        to: professionalEmail,
        role: 'professional',
        projectName,
        projectUrl: `${webBaseUrl}/professional-projects/${tx.projectProfessionalId}`,
      }).catch(() => void 0);
    }
    if (clientEmail) {
      await this.emailService.sendFundsSecureNotification({
        to: clientEmail,
        role: 'client',
        projectName,
        projectUrl: `${webBaseUrl}/projects/${tx.projectProfessional?.projectId}`,
      }).catch(() => void 0);
    }

    try {
      const professional = tx.projectProfessional?.professional;
      if (professional?.id && professional?.phone) {
        await this.notificationService.send({
          professionalId: professional.id,
          phoneNumber: professional.phone,
          eventType: 'payment_received',
          message: `Payment is now secured in escrow for "${projectName}". You can proceed with project execution.`,
        });
      }

      const client = tx.projectProfessional?.project?.user;
      if (client?.id && client?.mobile) {
        await this.notificationService.send({
          userId: client.id,
          phoneNumber: client.mobile,
          eventType: 'escrow_confirmed',
          message: `Escrow is now confirmed for "${projectName}". Work can proceed safely.`,
        });
      }
    } catch (notificationError) {
      console.warn(
        '[FinancialService] Failed to send payment_received notification:',
        notificationError,
      );
    }

    await this.createFinancialAuditLog({
      transactionId,
      action: 'escrow_deposit_confirmed',
      actorId: approvedBy,
      actorRole: approvedBy === 'stripe-webhook' ? 'system' : 'admin',
      details: 'Escrow deposit confirmed and ledger credited',
      metadata: {
        amount: tx.amount?.toString?.() || String(tx.amount),
        projectId: tx.projectId,
        projectProfessionalId: tx.projectProfessionalId,
        source: approvedBy === 'stripe-webhook' ? 'stripe_webhook' : 'admin_action',
      },
    });

    return updated;
  }

  /**
   * Release payment (after escrow or advance payment)
   */
  async releasePayment(transactionId: string, releasedBy: string) {
    const tx = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        project: { select: { id: true, projectName: true, userId: true, user: { select: { id: true, mobile: true } } } },
        projectProfessional: { include: { professional: { select: { id: true, phone: true } } } },
      },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.type !== 'release_payment') {
      throw new BadRequestException('Only release_payment transactions can be released');
    }

    const initialStatus = String(tx.status || '').toLowerCase();
    if (initialStatus === 'confirmed' || tx.actionComplete) {
      return tx;
    }
    if (initialStatus !== 'pending') {
      throw new BadRequestException('Payment release is no longer pending');
    }

    const updated = await this.prisma.$transaction(async (prisma) => {
      const transition = await prisma.financialTransaction.updateMany({
        where: {
          id: transactionId,
          type: 'release_payment',
          status: 'pending',
          actionComplete: false,
        },
        data: {
          status: 'confirmed',
          actionBy: releasedBy,
          actionByRole: 'admin',
          actionAt: new Date(),
          actionComplete: true,
        },
      });

      if (transition.count === 0) {
        const latest = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
        if (latest && (String(latest.status || '').toLowerCase() === 'confirmed' || latest.actionComplete)) {
          return latest;
        }
        throw new BadRequestException('Payment release is no longer pending');
      }

      const updated = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
      if (!updated) {
        throw new NotFoundException('Transaction not found after release');
      }

      // If this is a release_payment transaction, also update the original payment_request to 'info' status
      // to indicate it has been fully processed and paid
      if (tx.type === 'release_payment') {
        // Find the matching payment_request
        const matchingRequests = await prisma.financialTransaction.findMany({
          where: {
            projectId: tx.projectId,
            projectProfessionalId: tx.projectProfessionalId,
            type: 'payment_request',
            amount: tx.amount,
            status: 'confirmed', // Only update if it was approved
          },
        });

        // Update each matching request
        for (const req of matchingRequests) {
          await prisma.financialTransaction.update({
            where: { id: req.id },
            data: {
              status: 'info', // Mark as informational/completed/paid
              notes: req.notes ? `${req.notes} [PAID]` : '[PAID]',
            },
          });
        }
      }

      const approvedPaymentRequest = await (prisma as any).paymentRequest.findFirst({
        where: {
          projectProfessionalId: tx.projectProfessionalId || undefined,
          requestAmount: tx.amount,
          status: 'approved',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (approvedPaymentRequest) {
        await (prisma as any).paymentRequest.update({
          where: { id: approvedPaymentRequest.id },
          data: {
            notes: approvedPaymentRequest.notes
              ? `${approvedPaymentRequest.notes} [RELEASED]`
              : '[RELEASED]',
          },
        });
      }

      const milestoneMeta = this.parseMilestoneMetadata(tx.notes);
      if (milestoneMeta?.paymentMilestoneId) {
        await (prisma as any).paymentMilestone.update({
          where: { id: milestoneMeta.paymentMilestoneId },
          data: {
            status: 'released',
            releasedAt: new Date(),
          },
        });
      }

      // Write ledger entry (debit)
      await prisma.escrowLedger.create({
        data: {
          projectId: tx.projectId,
          projectProfessionalId: tx.projectProfessionalId,
          transactionId: tx.id,
          direction: 'debit',
          amount: tx.amount,
          currency: 'HKD',
          description: `Payment released: ${tx.description}`,
          createdBy: releasedBy,
        },
      });

      // Update escrowHeld on project
      const project = await prisma.project.findUnique({ where: { id: tx.projectId }, select: { escrowHeld: true } });
      const currentHeld = project?.escrowHeld ? Number(project.escrowHeld) : 0;
      if (currentHeld < Number(tx.amount)) {
        throw new BadRequestException('Insufficient escrow balance for release');
      }
      const newHeld = Math.max(0, currentHeld - Number(tx.amount));
      await prisma.project.update({
        where: { id: tx.projectId },
        data: {
          escrowHeld: newHeld,
          escrowHeldUpdatedAt: new Date(),
        },
      });

      // Notify professional via project chat
      try {
        const formatter = new Intl.NumberFormat('en-HK', {
          style: 'currency',
          currency: 'HKD',
          minimumFractionDigits: 0,
        });

        const formattedAmount = formatter.format(Number(tx.amount));
        const projectName = tx.project?.projectName || 'Project';

        const thread = await this.chatService.getOrCreateProjectThread(tx.projectId);
        await this.chatService.addProjectMessage(
          (thread as any).id || (thread as any).threadId,
          'admin',
          null,
          null,
          `${projectName} — Your payment request for ${formattedAmount} has been released. Please check your account; if you don't see funds within 3 days, reply here or contact FOH at once.`,
          undefined,
        );
      } catch (error) {
        // Do not fail payment release if chat post fails
        // eslint-disable-next-line no-console
        console.warn('Failed to post release message to chat', error);
      }
      return updated;
    });

    try {
      const formatter = new Intl.NumberFormat('en-HK', {
        style: 'currency',
        currency: 'HKD',
        minimumFractionDigits: 0,
      });
      const formattedAmount = formatter.format(Number(tx.amount));
      const projectName = tx.project?.projectName || 'Project';

      const professional = tx.projectProfessional?.professional;
      if (professional?.id && professional?.phone) {
        await this.notificationService.send({
          professionalId: professional.id,
          phoneNumber: professional.phone,
          eventType: 'payment_released',
          message: `Payment released: ${formattedAmount} for "${projectName}" has been processed by admin.`,
        });
      }

      const client = tx.project?.user;
      if (client?.id && client?.mobile) {
        await this.notificationService.send({
          userId: client.id,
          phoneNumber: client.mobile,
          eventType: 'payment_released',
          message: `Payment of ${formattedAmount} was released to your professional for "${projectName}".`,
        });
      }
    } catch (notificationError) {
      console.warn('[FinancialService] Failed to send release notifications:', notificationError);
    }

    await this.createFinancialAuditLog({
      transactionId,
      action: 'payment_released',
      actorId: releasedBy,
      actorRole: 'admin',
      details: 'Payment released and escrow ledger debited',
      metadata: {
        amount: tx.amount?.toString?.() || String(tx.amount),
        projectId: tx.projectId,
        projectProfessionalId: tx.projectProfessionalId,
      },
    });

    return updated;
  }

  /**
   * B.2: Return milestones in release_requested status that have exceeded the SLA threshold.
   * Used by admin dashboard to surface overdue payment releases.
   *
   * @param daysThreshold - number of calendar days after which a pending release is considered overdue (default 3)
   */
  async getPendingReleaseSla(daysThreshold = 3) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysThreshold);

    const overdueMilestones = await (this.prisma as any).paymentMilestone.findMany({
      where: {
        status: 'release_requested',
        releaseRequestedAt: {
          lt: cutoff,
        },
      },
      include: {
        paymentPlan: {
          include: {
            project: {
              select: {
                id: true,
                projectName: true,
                currentStage: true,
              },
            },
          },
        },
      },
      orderBy: { releaseRequestedAt: 'asc' },
    });

    return overdueMilestones.map((m: any) => ({
      milestoneId: m.id,
      milestoneTitle: m.title,
      milestoneSequence: m.sequence,
      amount: m.amount,
      releaseRequestedAt: m.releaseRequestedAt,
      daysOverdue: Math.floor(
        (Date.now() - new Date(m.releaseRequestedAt).getTime()) / (1000 * 60 * 60 * 24),
      ),
      projectId: m.paymentPlan?.project?.id,
      projectName: m.paymentPlan?.project?.projectName,
      paymentPlanId: m.paymentPlanId,
    }));
  }

  async getProjectSlaPolicy(projectId: string) {
    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      select: {
        projectScale: true,
        adminComment: true,
      },
    });

    const project = !plan
      ? await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { projectScale: true },
        })
      : null;

    if (!plan && !project) {
      throw new NotFoundException('Project not found');
    }

    const scale = String(plan?.projectScale || project?.projectScale || 'SCALE_1');
    const stored = this.parseStoredSlaPolicy(plan?.adminComment);
    const effectivePolicy = this.mergeSlaPolicy(scale, stored);

    return {
      projectId,
      projectScale: scale,
      effectivePolicy,
      overrides: stored?.categories || {},
    };
  }

  async upsertProjectSlaPolicy(
    projectId: string,
    body: {
      categories?: Record<string, { mode: SlaMode; value: number }>;
    },
  ) {
    this.validateSlaCategories(body.categories);

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      select: {
        id: true,
        projectScale: true,
        adminComment: true,
      },
    });

    if (!plan) {
      throw new BadRequestException('Payment plan must exist before setting project SLA policy');
    }

    const stored: StoredSlaPolicy = {
      version: 1,
      categories: (body.categories || {}) as Partial<SlaCategoryPolicy>,
    };

    const cleanComment = this.stripSlaPolicyMarker(plan.adminComment);
    const nextComment = [
      cleanComment || null,
      `${this.slaMarker}${JSON.stringify(stored)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    await (this.prisma as any).projectPaymentPlan.update({
      where: { id: plan.id },
      data: {
        adminComment: nextComment,
      },
    });

    return this.getProjectSlaPolicy(projectId);
  }

  async getProjectSlaStatus(projectId: string, projectProfessionalId?: string | null) {
    const policy = await this.getProjectSlaPolicy(projectId);

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      select: {
        totalAmount: true,
        retentionReleaseAt: true,
      },
    });

    const transactions = await this.prisma.financialTransaction.findMany({
      where: {
        projectId,
        ...(projectProfessionalId ? { projectProfessionalId } : {}),
        status: 'pending',
        actionComplete: false,
      },
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        notes: true,
        actionByRole: true,
        projectProfessionalId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const planTotal = Number(plan?.totalAmount || 0);

    const rows = transactions
      .map((tx) => {
        const amount = Number(tx.amount || 0);
        const category = this.resolveSlaCategoryForTransaction({
          type: tx.type,
          notes: tx.notes,
          amount,
          planTotal,
          retentionReleaseAt: plan?.retentionReleaseAt || null,
        });

        if (!category) return null;
        const rule = policy.effectivePolicy[category];
        if (!rule) return null;

        const startsAt = new Date(tx.createdAt);
        const dueAt =
          rule.mode === 'hours'
            ? new Date(startsAt.getTime() + rule.value * 60 * 60 * 1000)
            : this.addWorkingDays(startsAt, rule.value);

        const totalMs = dueAt.getTime() - startsAt.getTime();
        const elapsedMs = now.getTime() - startsAt.getTime();

        const slaStatus: 'on_track' | 'at_risk' | 'breached' =
          now > dueAt
            ? 'breached'
            : totalMs > 0 && elapsedMs / totalMs >= 0.8
              ? 'at_risk'
              : 'on_track';

        return {
          transactionId: tx.id,
          projectProfessionalId: tx.projectProfessionalId,
          type: tx.type,
          amount,
          actionByRole: tx.actionByRole,
          slaCategory: category,
          slaRule: rule,
          slaStartsAt: startsAt,
          slaDueAt: dueAt,
          slaStatus,
          hoursRemaining: Number(((dueAt.getTime() - now.getTime()) / (1000 * 60 * 60)).toFixed(2)),
        };
      })
      .filter(Boolean);

    return {
      projectId,
      projectScale: policy.projectScale,
      effectivePolicy: policy.effectivePolicy,
      items: rows,
    };
  }

  /**
   * Get escrow statement (ledger) for a project
   */
  async getEscrowStatement(projectId: string) {
    const ledger = await this.prisma.escrowLedger.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        transaction: { select: { type: true, description: true } },
      },
    });

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { escrowHeld: true, escrowRequired: true, approvedBudget: true },
    });

    return {
      ledger,
      balance: project?.escrowHeld || 0,
      required: project?.escrowRequired || 0,
      approvedBudget: project?.approvedBudget || 0,
    };
  }

  /**
   * Get summary of project finances - optimized with database aggregation
   */
  async getProjectFinancialSummary(projectId: string) {
    // Fetch recent transactions + aggregate totals together to reduce round trips
    const [transactions, aggregation] = await this.retryWithBackoff(() =>
      this.prisma.$transaction([
        this.prisma.financialTransaction.findMany({
          where: { projectId },
          select: {
            id: true,
            projectProfessionalId: true,
            type: true,
            description: true,
            amount: true,
            status: true,
            requestedBy: true,
            requestedByRole: true,
            actionBy: true,
            actionByRole: true,
            actionAt: true,
            actionComplete: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        this.prisma.financialTransaction.groupBy({
          by: ['type', 'status'],
          where: { projectId },
          _sum: {
            amount: true,
          },
        }),
      ]),
    );

    const transactionsWithAudit = await this.attachAuditSummary(transactions as any[]);

    const summary = {
      totalEscrow: new Decimal(0),
      escrowConfirmed: new Decimal(0),
      advancePaymentRequested: new Decimal(0),
      advancePaymentApproved: new Decimal(0),
      paymentsReleased: new Decimal(0),
      transactions: transactionsWithAudit,
    };

    // Build summary from aggregated data
    for (const agg of aggregation) {
      const amount = agg._sum.amount ? new Decimal(agg._sum.amount.toString()) : new Decimal(0);
      const statusLower = agg.status?.toLowerCase() || '';

      switch (agg.type) {
        case 'escrow_deposit':
          summary.totalEscrow = summary.totalEscrow.plus(amount);
          if (statusLower === 'confirmed') {
            summary.escrowConfirmed = summary.escrowConfirmed.plus(amount);
          }
          break;
        case 'escrow_deposit_confirmation':
          // Only count as confirmed when admin has confirmed it (status='confirmed')
          // Pending confirmations do NOT secure funds yet
          if (statusLower === 'confirmed') {
            summary.escrowConfirmed = summary.escrowConfirmed.plus(amount);
          }
          break;
        case 'payment_request':
          summary.advancePaymentRequested = summary.advancePaymentRequested.plus(amount);
          break;
        case 'advance_payment_approval':
          if (statusLower === 'confirmed') {
            summary.advancePaymentApproved = summary.advancePaymentApproved.plus(amount);
          }
          break;
        case 'release_payment':
          if (statusLower === 'confirmed') {
            summary.paymentsReleased = summary.paymentsReleased.plus(amount);
          }
          break;
      }
    }

    return summary;
  }

  async transferProfessionalWalletBalance(input: {
    projectId: string;
    projectProfessionalId: string;
    amount: number;
    actorId: string;
    actorRole: 'professional' | 'admin';
  }) {
    const amount = Number(input.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Transfer amount must be greater than 0');
    }

    const projectProfessional = await this.prisma.projectProfessional.findFirst({
      where: {
        id: input.projectProfessionalId,
        projectId: input.projectId,
      },
      select: {
        id: true,
        professionalId: true,
      },
    });

    if (!projectProfessional) {
      throw new NotFoundException('Project professional not found for this project');
    }

    if (
      input.actorRole === 'professional' &&
      projectProfessional.professionalId !== input.actorId
    ) {
      throw new ForbiddenException('You can only transfer from your own professional wallet');
    }

    const walletBefore = await this.getProjectWalletSummary(input.projectId, input.projectProfessionalId);
    if (amount > Number(walletBefore.professionalAvailable || 0)) {
      throw new BadRequestException('Transfer amount exceeds available wallet balance');
    }

    const transaction = await this.prisma.financialTransaction.create({
      data: {
        projectId: input.projectId,
        projectProfessionalId: input.projectProfessionalId,
        type: 'professional_wallet_transfer',
        description: 'Professional wallet transfer request',
        amount: new Decimal(amount.toFixed(2)),
        status: 'pending',
        requestedBy: input.actorId,
        requestedByRole: input.actorRole,
        actionBy: null,
        actionByRole: 'admin',
        actionAt: null,
        actionComplete: false,
      },
    });

    await this.createFinancialAuditLog({
      transactionId: transaction.id,
      action: 'professional_wallet_transfer_requested',
      actorId: input.actorId,
      actorRole: input.actorRole,
      details: 'Professional wallet transfer requested and awaiting admin payout confirmation',
      metadata: {
        amount: amount.toFixed(2),
        projectId: input.projectId,
        projectProfessionalId: input.projectProfessionalId,
      },
    });

    const walletSummary = await this.getProjectWalletSummary(input.projectId, input.projectProfessionalId);

    return {
      transaction,
      walletSummary,
    };
  }

  async confirmProfessionalWalletTransfer(transactionId: string, adminId: string) {
    const tx = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }
    if (tx.type !== 'professional_wallet_transfer') {
      throw new BadRequestException('Only professional_wallet_transfer transactions can be confirmed');
    }

    const status = String(tx.status || '').toLowerCase();
    if (status === 'confirmed' || tx.actionComplete) {
      return tx;
    }
    if (status !== 'pending') {
      throw new BadRequestException('Wallet transfer is no longer pending');
    }

    const updated = await this.prisma.financialTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'confirmed',
        actionBy: adminId,
        actionByRole: 'admin',
        actionAt: new Date(),
        actionComplete: true,
      },
    });

    await this.createFinancialAuditLog({
      transactionId,
      action: 'professional_wallet_transfer_confirmed',
      actorId: adminId,
      actorRole: 'admin',
      details: 'Professional wallet transfer confirmed as paid out',
      metadata: {
        amount: tx.amount?.toString?.() || String(tx.amount),
        projectId: tx.projectId,
        projectProfessionalId: tx.projectProfessionalId,
      },
    });

    return updated;
  }

  async authorizeMilestoneFohCap(input: {
    projectId: string;
    milestoneId: string;
    actorId: string;
    actorRole: 'client' | 'admin';
    amount?: number;
    notes?: string;
  }) {
    const { paymentPlan, milestone, project, projectProfessional } =
      await this.getMilestoneProcurementContext(input.projectId, input.milestoneId);

    if (!['SCALE_1', 'SCALE_2'].includes(String(paymentPlan.projectScale || '').toUpperCase())) {
      throw new BadRequestException('Milestone 1 cap authorization is only required for Class 1 and 2 projects');
    }

    if (Number(milestone.sequence) !== 1) {
      throw new BadRequestException('Only milestone 1 supports procurement-gated cap authorization');
    }

    if (input.actorRole === 'client' && project?.userId !== input.actorId) {
      throw new ForbiddenException('Only the project client can authorize this cap');
    }

    if (!['escrow_funded', 'release_requested'].includes(String(milestone.status || ''))) {
      throw new BadRequestException(`Milestone is in status '${milestone.status}' and cannot be capped yet`);
    }

    const requestedAmount = Number(input.amount || milestone.amount || 0);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      throw new BadRequestException('Cap amount must be greater than 0');
    }

    const transaction = await this.prisma.financialTransaction.create({
      data: {
        projectId: input.projectId,
        projectProfessionalId: projectProfessional?.id || null,
        type: 'milestone_foh_allocation_cap',
        description: `Client authorized Milestone ${milestone.sequence} cap to professional FoH wallet`,
        amount: new Decimal(requestedAmount.toFixed(2)),
        status: 'confirmed',
        requestedBy: input.actorId,
        requestedByRole: input.actorRole,
        actionBy: input.actorId,
        actionByRole: input.actorRole,
        actionAt: new Date(),
        actionComplete: true,
        notes: [
          input.notes ? String(input.notes).trim() : null,
          this.serializeMilestoneMetadata({
            paymentMilestoneId: milestone.id,
            paymentPlanId: paymentPlan.id,
            milestoneSequence: milestone.sequence,
            milestoneTitle: milestone.title,
            context: 'foh_cap_authorized',
          }),
        ]
          .filter(Boolean)
          .join(' | '),
      },
    });

    await this.createFinancialAuditLog({
      transactionId: transaction.id,
      action: 'milestone_foh_cap_authorized',
      actorId: input.actorId,
      actorRole: input.actorRole,
      details: 'Milestone 1 FoH cap authorized by client/admin',
      metadata: {
        projectId: input.projectId,
        milestoneId: milestone.id,
        amount: requestedAmount,
      },
    });

    const formatter = new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: 'HKD',
      minimumFractionDigits: 0,
    });
    const formattedAmount = formatter.format(requestedAmount);
    const projectName = project?.projectName || 'Project';

    try {
      const thread = await this.chatService.getOrCreateProjectThread(input.projectId);
      await this.chatService.addProjectMessage(
        (thread as any).id || (thread as any).threadId,
        'admin',
        null,
        null,
        `${projectName} — The client transferred ${formattedAmount} to the milestone 1 materials holding wallet. Submit purchase invoices in financials to move approved amounts into your withdrawable wallet.`,
        undefined,
      );
    } catch (chatError) {
      console.warn('[FinancialService] Failed to post milestone cap authorization message to chat:', chatError);
    }

    try {
      const professional = projectProfessional?.professional;
      if (professional?.id) {
        const preference = await this.prisma.notificationPreference.findUnique({
          where: { professionalId: professional.id },
          select: {
            primaryChannel: true,
            fallbackChannel: true,
            enableWhatsApp: true,
            enableSMS: true,
          },
        });

        const isMessagingChannel = (channel?: NotificationChannel | null) =>
          channel === NotificationChannel.WHATSAPP || channel === NotificationChannel.SMS;

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
        if (isMessagingChannel(preference?.primaryChannel) && isChannelEnabled(preference?.primaryChannel)) {
          directChannel = preference!.primaryChannel as NotificationChannel;
        } else if (isMessagingChannel(preference?.fallbackChannel) && isChannelEnabled(preference?.fallbackChannel)) {
          directChannel = preference!.fallbackChannel as NotificationChannel;
        } else if (!preference) {
          directChannel = NotificationChannel.WHATSAPP;
        }

        const message = `Materials wallet funded: ${formattedAmount} for "${projectName}" is now reserved in your project wallet. Submit purchase invoices for client approval to release approved amounts.`;

        if (professional.phone && directChannel) {
          await this.notificationService.send({
            professionalId: professional.id,
            phoneNumber: professional.phone,
            channel: directChannel,
            eventType: 'materials_wallet_funded',
            message,
          });
        } else if (professional.email) {
          const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';
          await this.emailService.sendMaterialsWalletTransferAuthorizedNotification({
            to: professional.email,
            professionalName: professional.contactName || professional.companyName || 'Professional',
            projectName,
            amount: formattedAmount,
            projectUrl: `${webBaseUrl}/professional-projects/${projectProfessional.id}`,
          });
        }
      }
    } catch (notificationError) {
      console.warn('[FinancialService] Failed to send milestone cap authorization notifications:', notificationError);
    }

    return {
      success: true,
      transaction,
      walletSummary: await this.getProjectWalletSummary(input.projectId, projectProfessional?.id || null),
    };
  }

  async submitMilestoneProcurementEvidence(input: {
    projectId: string;
    milestoneId: string;
    actorId: string;
    actorRole: 'professional' | 'admin';
    claimedAmount: number;
    invoiceUrls?: string[];
    photoUrls?: string[];
    notes?: string;
  }) {
    const { paymentPlan, milestone, projectProfessional } =
      await this.getMilestoneProcurementContext(input.projectId, input.milestoneId);

    if (!['SCALE_1', 'SCALE_2'].includes(String(paymentPlan.projectScale || '').toUpperCase())) {
      throw new BadRequestException('Procurement evidence workflow is only for Class 1 and 2 projects');
    }
    if (Number(milestone.sequence) !== 1) {
      throw new BadRequestException('Only milestone 1 accepts procurement evidence');
    }

    if (
      input.actorRole === 'professional' &&
      projectProfessional?.professionalId &&
      projectProfessional.professionalId !== input.actorId
    ) {
      throw new ForbiddenException('You can only submit evidence for your awarded project');
    }

    const claimedAmount = Number(input.claimedAmount || 0);
    if (!Number.isFinite(claimedAmount) || claimedAmount <= 0) {
      throw new BadRequestException('claimedAmount must be greater than 0');
    }

    const invoiceUrls = (input.invoiceUrls || []).map((v) => String(v || '').trim()).filter(Boolean);
    const photoUrls = (input.photoUrls || []).map((v) => String(v || '').trim()).filter(Boolean);

    let evidence;
    try {
      evidence = await (this.prisma as any).milestoneProcurementEvidence.create({
        data: {
          projectId: input.projectId,
          paymentMilestoneId: milestone.id,
          projectProfessionalId: projectProfessional?.id || null,
          submittedBy: input.actorId,
          submittedByRole: input.actorRole,
          claimedAmount: new Decimal(claimedAmount.toFixed(2)),
          invoiceUrls,
          photoUrls,
          notes: input.notes?.trim() || null,
          status: 'pending',
        },
      });
    } catch (error) {
      this.rethrowProcurementEvidenceTableError(error);
    }

    return {
      success: true,
      evidence,
    };
  }

  async getMilestoneProcurementEvidence(projectId: string, milestoneId: string) {
    await this.getMilestoneProcurementContext(projectId, milestoneId);
    try {
      return await (this.prisma as any).milestoneProcurementEvidence.findMany({
        where: {
          projectId,
          paymentMilestoneId: milestoneId,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (this.isMissingProcurementEvidenceTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async reviewMilestoneProcurementEvidence(input: {
    projectId: string;
    milestoneId: string;
    evidenceId: string;
    actorId: string;
    actorRole: 'client' | 'admin';
    decision: 'approved' | 'rejected';
    approvedAmount?: number;
    reviewNotes?: string;
    titleTransferAcknowledged?: boolean;
  }) {
    const { paymentPlan, milestone, project, projectProfessional } =
      await this.getMilestoneProcurementContext(input.projectId, input.milestoneId);

    if (!['SCALE_1', 'SCALE_2'].includes(String(paymentPlan.projectScale || '').toUpperCase())) {
      throw new BadRequestException('Procurement evidence review is only for Class 1 and 2 projects');
    }
    if (Number(milestone.sequence) !== 1) {
      throw new BadRequestException('Only milestone 1 supports procurement evidence review');
    }
    if (input.actorRole === 'client' && project?.userId !== input.actorId) {
      throw new ForbiddenException('Only the project client can review this evidence');
    }

    let evidence;
    try {
      evidence = await (this.prisma as any).milestoneProcurementEvidence.findFirst({
        where: {
          id: input.evidenceId,
          projectId: input.projectId,
          paymentMilestoneId: milestone.id,
        },
      });
    } catch (error) {
      this.rethrowProcurementEvidenceTableError(error);
    }

    if (!evidence) {
      throw new NotFoundException('Procurement evidence not found');
    }
    if (String(evidence.status || '').toLowerCase() !== 'pending') {
      throw new BadRequestException('This evidence has already been reviewed');
    }

    const claimed = this.toAmount(evidence.claimedAmount);
    const requestedApproved =
      input.decision === 'approved'
        ? Number(input.approvedAmount ?? claimed)
        : 0;
    if (input.decision === 'approved') {
      if (!Number.isFinite(requestedApproved) || requestedApproved <= 0) {
        throw new BadRequestException('approvedAmount must be greater than 0 for approved evidence');
      }
      if (requestedApproved > claimed) {
        throw new BadRequestException('approvedAmount cannot exceed claimed amount');
      }
    }

    const [capAgg, approvedAgg, returnedAgg] = await this.retryWithBackoff(() =>
      this.prisma.$transaction([
        this.prisma.financialTransaction.aggregate({
          where: {
            projectId: input.projectId,
            type: 'milestone_foh_allocation_cap',
            status: 'confirmed',
            notes: { contains: milestone.id },
          },
          _sum: { amount: true },
        }),
        this.prisma.financialTransaction.aggregate({
          where: {
            projectId: input.projectId,
            type: 'milestone_procurement_approved',
            status: 'confirmed',
            notes: { contains: milestone.id },
          },
          _sum: { amount: true },
        }),
        this.prisma.financialTransaction.aggregate({
          where: {
            projectId: input.projectId,
            type: 'milestone_cap_remainder_return',
            status: 'confirmed',
            notes: { contains: milestone.id },
          },
          _sum: { amount: true },
        }),
      ]),
    );

    const capTotal = this.toAmount(capAgg?._sum?.amount || 0);
    const approvedTotal = this.toAmount(approvedAgg?._sum?.amount || 0);
    const returnedTotal = this.toAmount(returnedAgg?._sum?.amount || 0);
    const remainingCap = Math.max(capTotal - approvedTotal - returnedTotal, 0);

    if (input.decision === 'approved' && requestedApproved > remainingCap) {
      throw new BadRequestException('Approved amount exceeds remaining authorized cap');
    }

    const result = await this.prisma.$transaction(async (prisma) => {
      let updatedEvidence;
      try {
        updatedEvidence = await (prisma as any).milestoneProcurementEvidence.update({
          where: { id: evidence.id },
          data: {
            status: input.decision,
            approvedAmount: input.decision === 'approved' ? new Decimal(requestedApproved.toFixed(2)) : null,
            reviewedBy: input.actorId,
            reviewedByRole: input.actorRole,
            reviewedAt: new Date(),
            reviewNotes: input.reviewNotes?.trim() || null,
            titleTransferAcknowledged: Boolean(input.titleTransferAcknowledged),
          },
        });
      } catch (error) {
        this.rethrowProcurementEvidenceTableError(error);
      }

      let approvalTx: any = null;
      if (input.decision === 'approved') {
        approvalTx = await prisma.financialTransaction.create({
          data: {
            projectId: input.projectId,
            projectProfessionalId: projectProfessional?.id || null,
            type: 'milestone_procurement_approved',
            description: `Procurement approved for milestone ${milestone.sequence} and moved to transfer-ready`,
            amount: new Decimal(requestedApproved.toFixed(2)),
            status: 'confirmed',
            requestedBy: input.actorId,
            requestedByRole: input.actorRole,
            actionBy: input.actorId,
            actionByRole: input.actorRole,
            actionAt: new Date(),
            actionComplete: true,
            notes: [
              input.reviewNotes?.trim() || null,
              this.serializeMilestoneMetadata({
                paymentMilestoneId: milestone.id,
                paymentPlanId: paymentPlan.id,
                milestoneSequence: milestone.sequence,
                milestoneTitle: milestone.title,
                context: 'procurement_approved',
                procurementEvidenceId: evidence.id,
              }),
            ]
              .filter(Boolean)
              .join(' | '),
          },
        });
      }

      return { updatedEvidence, approvalTx };
    });

    if (result.approvalTx) {
      await this.createFinancialAuditLog({
        transactionId: result.approvalTx.id,
        action: 'milestone_procurement_approved',
        actorId: input.actorId,
        actorRole: input.actorRole,
        details: 'Procurement evidence approved and funds moved to transfer-ready',
        metadata: {
          evidenceId: evidence.id,
          approvedAmount: requestedApproved,
          titleTransferAcknowledged: Boolean(input.titleTransferAcknowledged),
        },
      });
    }

    return {
      success: true,
      evidence: result.updatedEvidence,
      transaction: result.approvalTx,
      walletSummary: await this.getProjectWalletSummary(input.projectId, projectProfessional?.id || null),
    };
  }

  async returnMilestoneFohCapRemainder(input: {
    projectId: string;
    milestoneId: string;
    actorId: string;
    actorRole: 'client' | 'admin';
    notes?: string;
  }) {
    const { paymentPlan, milestone, project, projectProfessional } =
      await this.getMilestoneProcurementContext(input.projectId, input.milestoneId);

    if (!['SCALE_1', 'SCALE_2'].includes(String(paymentPlan.projectScale || '').toUpperCase())) {
      throw new BadRequestException('Cap remainder return applies only to Class 1 and 2 projects');
    }
    if (Number(milestone.sequence) !== 1) {
      throw new BadRequestException('Only milestone 1 supports cap remainder return');
    }
    if (input.actorRole === 'client' && project?.userId !== input.actorId) {
      throw new ForbiddenException('Only the project client can return the cap remainder');
    }

    const [capAgg, approvedAgg, returnedAgg] = await this.retryWithBackoff(() =>
      this.prisma.$transaction([
        this.prisma.financialTransaction.aggregate({
          where: {
            projectId: input.projectId,
            type: 'milestone_foh_allocation_cap',
            status: 'confirmed',
            notes: { contains: milestone.id },
          },
          _sum: { amount: true },
        }),
        this.prisma.financialTransaction.aggregate({
          where: {
            projectId: input.projectId,
            type: 'milestone_procurement_approved',
            status: 'confirmed',
            notes: { contains: milestone.id },
          },
          _sum: { amount: true },
        }),
        this.prisma.financialTransaction.aggregate({
          where: {
            projectId: input.projectId,
            type: 'milestone_cap_remainder_return',
            status: 'confirmed',
            notes: { contains: milestone.id },
          },
          _sum: { amount: true },
        }),
      ]),
    );

    const capTotal = this.toAmount(capAgg?._sum?.amount || 0);
    const approvedTotal = this.toAmount(approvedAgg?._sum?.amount || 0);
    const returnedTotal = this.toAmount(returnedAgg?._sum?.amount || 0);
    const remainder = Math.max(capTotal - approvedTotal - returnedTotal, 0);

    if (remainder <= 0) {
      throw new BadRequestException('No remaining cap amount to return');
    }

    const transaction = await this.prisma.financialTransaction.create({
      data: {
        projectId: input.projectId,
        projectProfessionalId: projectProfessional?.id || null,
        type: 'milestone_cap_remainder_return',
        description: `Returned unspent milestone ${milestone.sequence} cap back to client escrow pool`,
        amount: new Decimal(remainder.toFixed(2)),
        status: 'confirmed',
        requestedBy: input.actorId,
        requestedByRole: input.actorRole,
        actionBy: input.actorId,
        actionByRole: input.actorRole,
        actionAt: new Date(),
        actionComplete: true,
        notes: [
          input.notes?.trim() || null,
          this.serializeMilestoneMetadata({
            paymentMilestoneId: milestone.id,
            paymentPlanId: paymentPlan.id,
            milestoneSequence: milestone.sequence,
            milestoneTitle: milestone.title,
            context: 'cap_remainder_returned',
          }),
        ]
          .filter(Boolean)
          .join(' | '),
      },
    });

    await this.createFinancialAuditLog({
      transactionId: transaction.id,
      action: 'milestone_foh_cap_remainder_returned',
      actorId: input.actorId,
      actorRole: input.actorRole,
      details: 'Returned remaining milestone cap to client escrow pool',
      metadata: {
        projectId: input.projectId,
        milestoneId: milestone.id,
        amount: remainder,
      },
    });

    return {
      success: true,
      transaction,
      walletSummary: await this.getProjectWalletSummary(input.projectId, projectProfessional?.id || null),
    };
  }

  async getProjectWalletSummary(projectId: string, projectProfessionalId?: string | null) {
    const [project, paymentPlan, transactions] = await this.retryWithBackoff(() =>
      this.prisma.$transaction([
        this.prisma.project.findUnique({
          where: { id: projectId },
          select: {
            id: true,
            approvedBudget: true,
            budget: true,
            escrowHeld: true,
          },
        }),
        (this.prisma as any).projectPaymentPlan.findUnique({
          where: { projectId },
          include: {
            milestones: {
              orderBy: { sequence: 'asc' },
            },
          },
        }),
        this.prisma.financialTransaction.findMany({
          where: {
            projectId,
            ...(projectProfessionalId ? { projectProfessionalId } : {}),
          },
          select: {
            id: true,
            type: true,
            status: true,
            amount: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]),
    );

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const contractValue = paymentPlan
      ? this.toAmount((paymentPlan as any).totalAmount)
      : this.toAmount(project.approvedBudget ?? project.budget ?? 0);

    const txByMilestone = new Map<string, Array<{ type: string; status: string; amount: number }>>();

    let clientFundedTotal = 0;
    let professionalEscrowAllocated = 0;
    let releasedToProfessionalWallet = 0;
    let procurementApprovedToTransferReady = 0;
    let capAllocatedTotal = 0;
    let capReturnedTotal = 0;
    let professionalInPayoutProcessing = 0;
    let professionalPaidOut = 0;

    for (const tx of transactions as Array<{ type: string; status: string; amount: unknown; notes?: string | null }>) {
      const amount = this.toAmount(tx.amount);
      const status = String(tx.status || '').toLowerCase();

      if (
        (tx.type === 'escrow_deposit' || tx.type === 'escrow_deposit_confirmation') &&
        status === 'confirmed'
      ) {
        clientFundedTotal += amount;
      }

      if (tx.type === 'release_payment') {
        if (status === 'pending') {
          professionalEscrowAllocated += amount;
        }
        if (status === 'confirmed') {
          releasedToProfessionalWallet += amount;
        }
      }

      if (tx.type === 'milestone_foh_allocation_cap' && status === 'confirmed') {
        capAllocatedTotal += amount;
      }
      if (tx.type === 'milestone_procurement_approved' && status === 'confirmed') {
        procurementApprovedToTransferReady += amount;
      }
      if (tx.type === 'milestone_cap_remainder_return' && status === 'confirmed') {
        capReturnedTotal += amount;
      }

      if (tx.type === 'professional_wallet_transfer') {
        if (status === 'pending') {
          professionalInPayoutProcessing += amount;
        }
        if (status === 'confirmed') {
          professionalPaidOut += amount;
        }
      }

      if (
        tx.type === 'release_payment' ||
        tx.type === 'professional_wallet_transfer' ||
        tx.type === 'milestone_foh_allocation_cap' ||
        tx.type === 'milestone_procurement_approved' ||
        tx.type === 'milestone_cap_remainder_return'
      ) {
        const milestoneMeta = this.parseMilestoneMetadata(tx.notes);
        if (milestoneMeta?.paymentMilestoneId) {
          const bucket = txByMilestone.get(milestoneMeta.paymentMilestoneId) || [];
          bucket.push({
            type: tx.type,
            status,
            amount,
          });
          txByMilestone.set(milestoneMeta.paymentMilestoneId, bucket);
        }
      }
    }

    const cappedAllocatedOutstanding = Math.max(
      capAllocatedTotal - procurementApprovedToTransferReady - capReturnedTotal,
      0,
    );
    professionalEscrowAllocated += cappedAllocatedOutstanding;

    const professionalAvailable = Math.max(
      releasedToProfessionalWallet + procurementApprovedToTransferReady - professionalInPayoutProcessing - professionalPaidOut,
      0,
    );
    const clientEscrowHeld = Math.max(
      clientFundedTotal - releasedToProfessionalWallet - procurementApprovedToTransferReady,
      0,
    );
    const clientEscrowUnallocated = Math.max(
      clientEscrowHeld - professionalEscrowAllocated,
      0,
    );
    const remainingToFund = Math.max(contractValue - clientFundedTotal, 0);

    const milestoneBreakdown = ((paymentPlan as any)?.milestones || []).map((milestone: any) => {
      const entries = txByMilestone.get(milestone.id) || [];

      let fundedAmount = 0;
      let allocatedAmount = 0;
      let paidOutAmount = 0;
      let availableAmount = 0;

      for (const entry of entries) {
        if (
          (entry.type === 'escrow_deposit' || entry.type === 'escrow_deposit_confirmation') &&
          entry.status === 'confirmed'
        ) {
          fundedAmount += entry.amount;
        }
        if (entry.type === 'release_payment' && entry.status === 'pending') {
          allocatedAmount += entry.amount;
        }
        if (entry.type === 'milestone_foh_allocation_cap' && entry.status === 'confirmed') {
          allocatedAmount += entry.amount;
        }
        if (entry.type === 'milestone_cap_remainder_return' && entry.status === 'confirmed') {
          allocatedAmount -= entry.amount;
        }
        if (entry.type === 'release_payment' && entry.status === 'confirmed') {
          availableAmount += entry.amount;
        }
        if (entry.type === 'milestone_procurement_approved' && entry.status === 'confirmed') {
          availableAmount += entry.amount;
        }
        if (entry.type === 'professional_wallet_transfer' && entry.status === 'confirmed') {
          paidOutAmount += entry.amount;
        }
      }

      return {
        id: milestone.id,
        sequence: milestone.sequence,
        title: milestone.title,
        plannedAmount: this.toAmount(milestone.amount),
        fundedAmount,
        allocatedAmount,
        availableAmount,
        paidOutAmount,
        status: milestone.status,
      };
    });

    return {
      currency: paymentPlan?.currency || 'HKD',
      contractValue,
      clientFundedTotal,
      clientEscrowHeld,
      clientEscrowUnallocated,
      professionalEscrowAllocated,
      professionalInPayoutProcessing,
      professionalAvailable,
      professionalPaidOut,
      remainingToFund,
      milestoneBreakdown,
    };
  }
}
