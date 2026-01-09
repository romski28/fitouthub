import { Controller, Get, Post, Put, Param, Body, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CreateFinancialTransactionDto, UpdateFinancialTransactionDto } from './financial.service';
import { FinancialService } from './financial.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  /**
   * GET /financial/project/:projectId - Get all financial transactions for a project
   * Requires authentication
   */
  @Get('project/:projectId')
  @UseGuards(CombinedAuthGuard)
  async getProjectTransactions(@Param('projectId') projectId: string) {
    return this.financialService.getProjectTransactions(projectId);
  }

  /**
   * GET /financial/project/:projectId/summary - Get financial summary for a project
   * Requires authentication
   */
  @Get('project/:projectId/summary')
  @UseGuards(CombinedAuthGuard)
  async getProjectFinancialSummary(@Param('projectId') projectId: string) {
    return this.financialService.getProjectFinancialSummary(projectId);
  }

  /**
   * GET /financial/:transactionId - Get a single transaction
   * Requires authentication
   */
  @Get(':transactionId')
  @UseGuards(CombinedAuthGuard)
  async getTransaction(@Param('transactionId') transactionId: string) {
    return this.financialService.getTransaction(transactionId);
  }

  /**
   * POST /financial - Create a new financial transaction
   * Requires authentication
   */
  @Post()
  @UseGuards(CombinedAuthGuard)
  async createTransaction(@Body() body: CreateFinancialTransactionDto, @Request() req: any) {
    if (!body.projectId || !body.type || !body.description || body.amount === undefined) {
      throw new BadRequestException('Missing required fields');
    }

    // Set who requested this
    if (!body.requestedBy) {
      body.requestedBy = req.user.id;
    }
    if (!body.requestedByRole) {
      body.requestedByRole = req.user.isProfessional ? 'professional' : 'client';
    }

    return this.financialService.createTransaction(body);
  }

  /**
   * PUT /financial/:transactionId - Update a transaction
   * Requires authentication (admin only)
   */
  @Put(':transactionId')
  @UseGuards(AuthGuard('jwt'))
  async updateTransaction(
    @Param('transactionId') transactionId: string,
    @Body() body: UpdateFinancialTransactionDto,
    @Request() req: any,
  ) {
    if (!body.status) {
      throw new BadRequestException('Status is required');
    }

    return this.financialService.updateTransaction(transactionId, body);
  }

  /**
   * POST /financial/:transactionId/confirm-deposit - Confirm escrow deposit
   * Admin only
   */
  @Post(':transactionId/confirm-deposit')
  @UseGuards(AuthGuard('jwt'))
  async confirmEscrowDeposit(@Param('transactionId') transactionId: string, @Request() req: any) {
    const transaction = await this.financialService.getTransaction(transactionId);
    
    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    if (!['escrow_deposit', 'escrow_deposit_confirmation'].includes(transaction.type)) {
      throw new BadRequestException('This transaction is not an escrow deposit');
    }

    return this.financialService.confirmEscrowDeposit(transactionId, req.user.id);
  }

  /**
   * POST /financial/:transactionId/approve - Approve advance payment
   * Client only
   */
  @Post(':transactionId/approve')
  @UseGuards(CombinedAuthGuard)
  async approvePayment(@Param('transactionId') transactionId: string, @Request() req: any) {
    const transaction = await this.financialService.getTransaction(transactionId);
    
    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    if (transaction.type !== 'advance_payment_request') {
      throw new BadRequestException('This transaction is not an advance payment request');
    }

    if (req.user.isProfessional) {
      throw new BadRequestException('Professionals cannot approve payments');
    }

    const approverRole = req.user.role === 'admin' ? 'admin' : 'client';
    return this.financialService.approveAdvancePayment(transactionId, req.user.id, approverRole);
  }

  /**
   * POST /financial/:transactionId/reject - Reject advance payment
   * Client only
   */
  @Post(':transactionId/reject')
  @UseGuards(CombinedAuthGuard)
  async rejectPayment(
    @Param('transactionId') transactionId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    const transaction = await this.financialService.getTransaction(transactionId);
    
    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    if (transaction.type !== 'advance_payment_request') {
      throw new BadRequestException('This transaction is not an advance payment request');
    }

    if (req.user.isProfessional) {
      throw new BadRequestException('Professionals cannot reject payments');
    }

    const approverRole = req.user.role === 'admin' ? 'admin' : 'client';
    return this.financialService.rejectAdvancePayment(
      transactionId,
      req.user.id,
      body.reason || 'Rejected by client',
      approverRole,
    );
  }

  /**
   * POST /financial/:transactionId/release - Release payment (admin)
   * Admin only
   */
  @Post(':transactionId/release')
  @UseGuards(AuthGuard('jwt'))
  async releasePayment(@Param('transactionId') transactionId: string, @Request() req: any) {
    return this.financialService.releasePayment(transactionId, req.user.id);
  }

  /**
   * POST /financial/project-professional/:projectProfessionalId/advance-request - Professional requests advance payment
   */
  @Post('project-professional/:projectProfessionalId/advance-request')
  @UseGuards(CombinedAuthGuard)
  async requestAdvancePayment(
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: { amount: number },
    @Request() req: any,
  ) {
    if (!req.user.isProfessional) {
      throw new BadRequestException('Only professionals can request advance payment');
    }
    if (!body.amount || Number(body.amount) <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    return this.financialService.createAdvancePaymentRequest(
      projectProfessionalId,
      Number(body.amount),
      req.user.id,
    );
  }
}
