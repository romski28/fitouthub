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
  status?: 'pending' | 'confirmed' | 'completed' | 'rejected';
  approvedBy?: string;
  notes?: string;
}

@Injectable()
export class FinancialService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new financial transaction
   */
  async createTransaction(data: CreateFinancialTransactionDto) {
    return this.prisma.financialTransaction.create({
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
      include: {
        project: true,
        projectProfessional: {
          include: {
            professional: true,
          },
        },
      },
    });
  }

  /**
   * Get all transactions for a project
   */
  async getProjectTransactions(projectId: string) {
    return this.prisma.financialTransaction.findMany({
      where: { projectId },
      include: {
        projectProfessional: {
          include: {
            professional: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single transaction
   */
  async getTransaction(transactionId: string) {
    return this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        project: true,
        projectProfessional: {
          include: {
            professional: true,
          },
        },
      },
    });
  }

  /**
   * Update a transaction (typically for status changes)
   */
  async updateTransaction(transactionId: string, data: UpdateFinancialTransactionDto) {
    return this.prisma.financialTransaction.update({
      where: { id: transactionId },
      data: {
        status: data.status,
        approvedBy: data.approvedBy,
        approvedAt: data.approvedBy ? new Date() : undefined,
        notes: data.notes,
      },
      include: {
        project: true,
        projectProfessional: {
          include: {
            professional: true,
          },
        },
      },
    });
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
    return this.updateTransaction(transactionId, {
      status: 'confirmed',
      approvedBy,
    });
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
   * Get summary of project finances
   */
  async getProjectFinancialSummary(projectId: string) {
    const transactions = await this.getProjectTransactions(projectId);
    
    const summary = {
      totalEscrow: new Decimal(0),
      escrowConfirmed: new Decimal(0),
      advancePaymentRequested: new Decimal(0),
      advancePaymentApproved: new Decimal(0),
      paymentsReleased: new Decimal(0),
      transactions,
    };

    for (const tx of transactions) {
      const amount = new Decimal(tx.amount);
      
      switch (tx.type) {
        case 'escrow_deposit':
          summary.totalEscrow = summary.totalEscrow.plus(amount);
          if (tx.status === 'confirmed') {
            summary.escrowConfirmed = summary.escrowConfirmed.plus(amount);
          }
          break;
        case 'advance_payment_request':
          summary.advancePaymentRequested = summary.advancePaymentRequested.plus(amount);
          break;
        case 'advance_payment_approval':
          if (tx.status === 'confirmed') {
            summary.advancePaymentApproved = summary.advancePaymentApproved.plus(amount);
          }
          break;
        case 'release_payment':
          if (tx.status === 'completed') {
            summary.paymentsReleased = summary.paymentsReleased.plus(amount);
          }
          break;
      }
    }

    return summary;
  }
}
