import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { NotificationChannel, ProjectStage } from '@prisma/client';
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

@Injectable()
export class FinancialService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private chatService: ChatService,
    private notificationService: NotificationService,
    private stripePaymentsService: StripePaymentsService,
  ) {}

  private appendNote(existing: string | null | undefined, extra: string) {
    const trimmedExtra = String(extra || '').trim();
    if (!trimmedExtra) {
      return existing || '';
    }
    return existing ? `${existing} | ${trimmedExtra}` : trimmedExtra;
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
    return this.retryWithBackoff(() =>
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
  }

  /**
   * Get a single transaction
   */
  async getTransaction(transactionId: string) {
    return this.retryWithBackoff(() =>
      this.prisma.financialTransaction.findUnique({
        where: { id: transactionId },
      }),
    );
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

    return this.prisma.$transaction(async (prisma) => {
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

    const summary = {
      totalEscrow: new Decimal(0),
      escrowConfirmed: new Decimal(0),
      advancePaymentRequested: new Decimal(0),
      advancePaymentApproved: new Decimal(0),
      paymentsReleased: new Decimal(0),
      transactions,
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
}
