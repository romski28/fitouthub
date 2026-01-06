import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface CreateFinancialTransactionDto {
  projectId: string;
  projectProfessionalId?: string;
  type: 'escrow_deposit' | 'advance_payment_request' | 'advance_payment_approval' | 'advance_payment_rejection' | 'release_payment' | 'escrow_confirmation';
  description: string;
  amount: number | string;
  requestedBy?: string;
  requestedByRole?: 'client' | 'professional' | 'admin';
  notes?: string;
}

export interface UpdateFinancialTransactionDto {
  status?: 'pending' | 'confirmed' | 'completed' | 'rejected' | 'paid' | 'awaiting_confirmation' | 'info';
  approvedBy?: string;
  notes?: string;
}

@Injectable()
export class FinancialService {
  constructor(private prisma: PrismaService) {}

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
          approvedBy: true,
          approvedAt: true,
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
          approvedBy: data.approvedBy,
          approvedAt: data.approvedBy ? new Date() : undefined,
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
    });

    if (!projectProf) {
      throw new Error('ProjectProfessional not found');
    }

    return this.createTransaction({
      projectId: projectProf.projectId,
      projectProfessionalId,
      type: 'advance_payment_request',
      description: 'Advance payment request from professional',
      amount,
      requestedBy,
      requestedByRole: 'professional',
    });
  }

  /**
   * Approve advance payment request
   */
  async approveAdvancePayment(transactionId: string, approvedBy: string) {
    return this.updateTransaction(transactionId, {
      status: 'confirmed',
      approvedBy,
    });
  }

  /**
   * Reject advance payment request
   */
  async rejectAdvancePayment(transactionId: string, approvedBy: string, reason: string) {
    return this.updateTransaction(transactionId, {
      status: 'rejected',
      approvedBy,
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
            project: true,
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

    const updated = await this.updateTransaction(transactionId, {
      status: 'confirmed',
      approvedBy,
    });

    // Send a message to the awarded professional confirming deposit
    if (tx.projectProfessionalId && tx.projectProfessional?.project?.clientId) {
      const clientId = tx.projectProfessional.project.clientId;
      const professionalName =
        tx.projectProfessional.professional?.fullName ||
        tx.projectProfessional.professional?.businessName ||
        'Professional';

      await this.prisma.message.create({
        data: {
          projectProfessionalId: tx.projectProfessionalId,
          senderType: 'client',
          senderClientId: clientId,
          content: `Escrow deposit has been confirmed by Fitout Hub. Funds for ${professionalName} are now secured in escrow.`,
        },
      });
    }

    return updated;
  }

  /**
   * Release payment (after escrow or advance payment)
   */
  async releasePayment(transactionId: string, releasedBy: string) {
    return this.updateTransaction(transactionId, {
      status: 'completed',
      approvedBy: releasedBy,
    });
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

      switch (agg.type) {
        case 'escrow_deposit':
          summary.totalEscrow = summary.totalEscrow.plus(amount);
          if (agg.status === 'confirmed') {
            summary.escrowConfirmed = summary.escrowConfirmed.plus(amount);
          }
          break;
        case 'advance_payment_request':
          summary.advancePaymentRequested = summary.advancePaymentRequested.plus(amount);
          break;
        case 'advance_payment_approval':
          if (agg.status === 'confirmed') {
            summary.advancePaymentApproved = summary.advancePaymentApproved.plus(amount);
          }
          break;
        case 'release_payment':
          if (agg.status === 'completed') {
            summary.paymentsReleased = summary.paymentsReleased.plus(amount);
          }
          break;
      }
    }

    return summary;
  }
}
