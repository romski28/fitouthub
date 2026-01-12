import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { EmailService } from '../email/email.service';
import { ChatService } from '../chat/chat.service';

export interface CreateFinancialTransactionDto {
  projectId: string;
  projectProfessionalId?: string;
  type: 'escrow_deposit' | 'payment_request' | 'advance_payment_approval' | 'advance_payment_rejection' | 'release_payment' | 'escrow_confirmation' | 'escrow_deposit_request' | 'escrow_deposit_confirmation' | 'quotation_accepted';
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
  ) {}

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
      type: 'escrow_deposit',
      description: 'Escrow deposit for project initiation',
      amount: amountValue,
      requestedByRole: 'admin',
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
        project: { select: { clientId: true, userId: true } },
      },
    });

    if (!projectProf) {
      throw new Error('ProjectProfessional not found');
    }

    const clientId = projectProf.project?.clientId || projectProf.project?.userId || undefined;

    return this.createTransaction({
      projectId: projectProf.projectId,
      projectProfessionalId,
      type: 'payment_request',
      description: 'Payment request from professional',
      amount,
      requestedBy,
      requestedByRole: 'professional',
      actionBy: clientId,
      actionByRole: clientId ? 'client' : undefined,
      actionComplete: false,
    });
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

    if (!tx) throw new Error('Transaction not found');

    return this.prisma.$transaction(async (prisma) => {
      // Update original payment_request to approved
      const updated = await prisma.financialTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'confirmed',
          actionBy: approvedBy,
          actionByRole: approverRole,
          actionAt: new Date(),
          actionComplete: true,
        },
      });

      // Create new release_payment transaction for admin to action
      const releasePaymentTx = await prisma.financialTransaction.create({
        data: {
          projectId: tx.projectId,
          projectProfessionalId: tx.projectProfessionalId,
          type: 'release_payment',
          description: `Client approved payment request: ${tx.description}`,
          amount: tx.amount,
          status: 'pending',
          requestedBy: approvedBy,
          requestedByRole: approverRole,
          actionBy: null,  // No specific admin assigned; visible to all admins as platform task
          actionByRole: 'platform',  // Platform task visible to all admins
          actionComplete: false,
          notes: `Client approval for ${tx.description}`,
        },
      });

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
  }

  /**
   * Reject advance payment request
   */
  async rejectAdvancePayment(transactionId: string, approvedBy: string, reason: string, approverRole: 'client' | 'admin' = 'client') {
    return this.updateTransaction(transactionId, {
      status: 'rejected',
      actionBy: approvedBy,
      actionByRole: approverRole,
      actionAt: new Date(),
      actionComplete: true,

      notes: reason,
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
            project: { include: { client: true } },
          },
        },
      },
    });

    if (!tx) {
      throw new Error('Transaction not found');
    }

    if (!['escrow_deposit', 'escrow_deposit_confirmation'].includes(tx.type)) {
      throw new Error('This transaction is not an escrow deposit');
    }

    const updated = await this.prisma.$transaction(async (prisma) => {
      const updatedTx = await prisma.financialTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'confirmed',
          actionBy: approvedBy,
          actionByRole: 'admin',
          actionAt: new Date(),
          actionComplete: true,
        },
      });

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
      );
    }

    // Email notifications to client and professional
    const clientEmail = tx.projectProfessional?.project?.client?.email;
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

    return updated;
  }

  /**
   * Release payment (after escrow or advance payment)
   */
  async releasePayment(transactionId: string, releasedBy: string) {
    const tx = await this.prisma.financialTransaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new Error('Transaction not found');

    return this.prisma.$transaction(async (prisma) => {
      const updated = await prisma.financialTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'confirmed',
          actionBy: releasedBy,
          actionByRole: 'admin',
          actionAt: new Date(),
          actionComplete: true,
        },
      });

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
      const newHeld = Math.max(0, currentHeld - Number(tx.amount));
      await prisma.project.update({
        where: { id: tx.projectId },
        data: {
          escrowHeld: newHeld,
          escrowHeldUpdatedAt: new Date(),
        },
      });

      return updated;
    });
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
    // Get all transactions with minimal data
    const transactions = await this.getProjectTransactions(projectId);

    // Use database aggregation for summary instead of post-processing
    const aggregation = await this.retryWithBackoff(() =>
      this.prisma.financialTransaction.groupBy({
        by: ['type', 'status'],
        where: { projectId },
        _sum: {
          amount: true,
        },
      }),
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
