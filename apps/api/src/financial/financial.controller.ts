import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Request, BadRequestException, Headers, Req, HttpException, HttpStatus, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CreateFinancialTransactionDto, UpdateFinancialTransactionDto } from './financial.service';
import { FinancialService } from './financial.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { StripePaymentsService } from './stripe-payments.service';
import type { Request as ExpressRequest } from 'express';
import type { RawBodyRequest } from '@nestjs/common';

// v2: wallet-summary, professional-wallet/transfer, confirm-wallet-transfer, sla-policy, sla-status
@Controller('financial')
export class FinancialController {
  constructor(
    private readonly financialService: FinancialService,
    private readonly stripePaymentsService: StripePaymentsService,
  ) {}

  @Post(':transactionId/checkout-session')
  @UseGuards(CombinedAuthGuard)
  async createEscrowCheckoutSession(@Param('transactionId') transactionId: string, @Request() req: any) {
    if (req.user?.isProfessional) {
      throw new BadRequestException('Professionals cannot pay escrow deposits');
    }

    const role = req.user?.role === 'admin' ? 'admin' : 'client';
    return this.financialService.createEscrowCheckoutSession(transactionId, req.user.id, role);
  }

  @Post(':transactionId/checkout-otp/request')
  @UseGuards(CombinedAuthGuard)
  async requestEscrowCheckoutOtp(
    @Param('transactionId') transactionId: string,
    @Request() req: any,
  ) {
    if (req.user?.isProfessional) {
      throw new BadRequestException('Professionals cannot pay escrow deposits');
    }

    const role = req.user?.role === 'admin' ? 'admin' : 'client';
    return this.financialService.requestEscrowCheckoutOtp(transactionId, req.user.id, role);
  }

  @Post(':transactionId/checkout-otp/verify')
  @UseGuards(CombinedAuthGuard)
  async verifyEscrowCheckoutOtp(
    @Param('transactionId') transactionId: string,
    @Body() body: { code?: string },
    @Request() req: any,
  ) {
    if (req.user?.isProfessional) {
      throw new BadRequestException('Professionals cannot pay escrow deposits');
    }

    const code = String(body?.code || '').trim();
    if (!code) {
      throw new BadRequestException('OTP code is required');
    }

    const role = req.user?.role === 'admin' ? 'admin' : 'client';
    return this.financialService.verifyEscrowCheckoutOtp(
      transactionId,
      req.user.id,
      role,
      code,
    );
  }

  @Post('stripe/webhook')
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<ExpressRequest>,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    if (!this.stripePaymentsService.isConfigured()) {
      throw new HttpException('Stripe not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (!stripeSignature) {
      throw new BadRequestException('Missing Stripe signature');
    }

    const rawPayload = req.rawBody;
    if (!rawPayload || !(rawPayload instanceof Buffer)) {
      throw new BadRequestException('Missing raw request payload for Stripe webhook');
    }

    const event = this.stripePaymentsService.constructWebhookEvent(rawPayload, stripeSignature);
    const result = await this.financialService.handleStripeWebhookEvent(event as any);
    return { received: true, ...result };
  }

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
   * GET /financial/project/:projectId/wallet-summary - Get derived wallet buckets for project cashflow UI
   * Requires authentication
   */
  @Get('project/:projectId/wallet-summary')
  @UseGuards(CombinedAuthGuard)
  async getProjectWalletSummary(
    @Param('projectId') projectId: string,
    @Query('projectProfessionalId') projectProfessionalId?: string,
  ) {
    return this.financialService.getProjectWalletSummary(projectId, projectProfessionalId);
  }

  /**
   * GET /financial/project/:projectId/sla-policy - Get project SLA policy
   */
  @Get('project/:projectId/sla-policy')
  @UseGuards(CombinedAuthGuard)
  async getProjectSlaPolicy(@Param('projectId') projectId: string) {
    return this.financialService.getProjectSlaPolicy(projectId);
  }

  /**
   * PUT /financial/project/:projectId/sla-policy - Upsert project SLA policy overrides
   * Admin only
   */
  @Put('project/:projectId/sla-policy')
  @UseGuards(AuthGuard('jwt'))
  async upsertProjectSlaPolicy(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      categories?: Record<
        string,
        {
          mode: 'hours' | 'working_days';
          value: number;
        }
      >;
    },
    @Request() req: any,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can update SLA policy');
    }
    return this.financialService.upsertProjectSlaPolicy(projectId, body || {});
  }

  /**
   * GET /financial/project/:projectId/sla-status - Get SLA status for pending financial actions
   */
  @Get('project/:projectId/sla-status')
  @UseGuards(CombinedAuthGuard)
  async getProjectSlaStatus(
    @Param('projectId') projectId: string,
    @Query('projectProfessionalId') projectProfessionalId?: string,
  ) {
    return this.financialService.getProjectSlaStatus(projectId, projectProfessionalId);
  }

  /**
   * GET /financial/project/:projectId/statement - Get escrow statement (ledger) for a project
   * Requires authentication
   */
  @Get('project/:projectId/statement')
  @UseGuards(CombinedAuthGuard)
  async getEscrowStatement(@Param('projectId') projectId: string) {
    return this.financialService.getEscrowStatement(projectId);
  }

  /**
   * GET /financial/:transactionId/audit-trail - Get immutable audit trail for a transaction
   * Requires authentication
   */
  @Get(':transactionId/audit-trail')
  @UseGuards(CombinedAuthGuard)
  async getTransactionAuditTrail(@Param('transactionId') transactionId: string) {
    return this.financialService.getTransactionAuditTrail(transactionId);
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
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can confirm escrow deposits');
    }

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

    if (transaction.type !== 'payment_request') {
      throw new BadRequestException('This transaction is not a payment request');
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

    if (transaction.type !== 'payment_request') {
      throw new BadRequestException('This transaction is not a payment request');
    }

    if (req.user.isProfessional) {
      throw new BadRequestException('Professionals cannot decline payments');
    }

    const approverRole = req.user.role === 'admin' ? 'admin' : 'client';
    return this.financialService.rejectAdvancePayment(
      transactionId,
      req.user.id,
      body.reason || 'Declined by client',
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
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can release payments');
    }

    return this.financialService.releasePayment(transactionId, req.user.id);
  }

  /**
   * POST /financial/project/:projectId/professional-wallet/transfer
   * Professional (or admin) transfers available wallet balance to external payout account
   */
  @Post('project/:projectId/professional-wallet/transfer')
  @UseGuards(CombinedAuthGuard)
  async transferProfessionalWalletBalance(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      projectProfessionalId?: string;
      amount: number;
    },
    @Request() req: any,
  ) {
    const actorRole: 'professional' | 'admin' | 'client' = req.user?.isProfessional
      ? 'professional'
      : req.user?.role === 'admin'
        ? 'admin'
        : 'client';

    if (actorRole === 'client') {
      throw new ForbiddenException('Clients cannot transfer professional wallet funds');
    }

    if (!body?.projectProfessionalId) {
      throw new BadRequestException('projectProfessionalId is required');
    }

    if (!body?.amount || Number(body.amount) <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    return this.financialService.transferProfessionalWalletBalance({
      projectId,
      projectProfessionalId: body.projectProfessionalId,
      amount: Number(body.amount),
      actorId: req.user.id,
      actorRole,
    });
  }

  /**
   * POST /financial/:transactionId/confirm-wallet-transfer - mark pending wallet transfer as paid out
   * Admin only
   */
  @Post(':transactionId/confirm-wallet-transfer')
  @UseGuards(AuthGuard('jwt'))
  async confirmProfessionalWalletTransfer(
    @Param('transactionId') transactionId: string,
    @Request() req: any,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can confirm wallet transfers');
    }

    return this.financialService.confirmProfessionalWalletTransfer(transactionId, req.user.id);
  }

  @Post('project/:projectId/milestones/:milestoneId/authorize-foh-cap')
  @UseGuards(CombinedAuthGuard)
  async authorizeMilestoneFohCap(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: { amount?: number; notes?: string },
    @Request() req: any,
  ) {
    const actorRole: 'client' | 'admin' = req.user?.role === 'admin' ? 'admin' : 'client';
    if (req.user?.isProfessional) {
      throw new ForbiddenException('Professionals cannot authorize milestone cap');
    }

    return this.financialService.authorizeMilestoneFohCap({
      projectId,
      milestoneId,
      actorId: req.user.id,
      actorRole,
      amount: body?.amount,
      notes: body?.notes,
    });
  }

  @Get('project/:projectId/milestones/:milestoneId/procurement-evidence')
  @UseGuards(CombinedAuthGuard)
  async getMilestoneProcurementEvidence(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.financialService.getMilestoneProcurementEvidence(projectId, milestoneId);
  }

  @Post('project/:projectId/milestones/:milestoneId/procurement-evidence')
  @UseGuards(CombinedAuthGuard)
  async submitMilestoneProcurementEvidence(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body()
    body: {
      claimedAmount: number;
      invoiceUrls?: string[];
      photoUrls?: string[];
      openingMessage?: string;
      notes?: string;
    },
    @Request() req: any,
  ) {
    const actorRole: 'professional' | 'admin' = req.user?.role === 'admin' ? 'admin' : 'professional';
    if (!req.user?.isProfessional && req.user?.role !== 'admin') {
      throw new ForbiddenException('Only professionals or admins can submit procurement evidence');
    }

    return this.financialService.submitMilestoneProcurementEvidence({
      projectId,
      milestoneId,
      actorId: req.user.id,
      actorRole,
      claimedAmount: Number(body?.claimedAmount || 0),
      invoiceUrls: Array.isArray(body?.invoiceUrls) ? body.invoiceUrls : [],
      photoUrls: Array.isArray(body?.photoUrls) ? body.photoUrls : [],
      openingMessage: body?.openingMessage,
      notes: body?.notes,
    });
  }

  @Post('project/:projectId/milestones/:milestoneId/procurement-evidence/:evidenceId/message')
  @UseGuards(CombinedAuthGuard)
  async addProcurementEvidenceMessage(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Param('evidenceId') evidenceId: string,
    @Body() body: { content: string; attachments?: { url: string; filename: string }[] },
    @Request() req: any,
  ) {
    const content = String(body?.content || '').trim();
    if (!content) throw new BadRequestException('Message content is required');
    const actorRole: 'client' | 'professional' | 'admin' =
      req.user?.role === 'admin' ? 'admin' : req.user?.isProfessional ? 'professional' : 'client';
    return this.financialService.addProcurementEvidenceMessage({
      projectId,
      milestoneId,
      evidenceId,
      actorId: req.user.id,
      actorRole,
      content,
      attachments: Array.isArray(body?.attachments) ? body.attachments : [],
    });
  }

  @Post('project/:projectId/milestones/:milestoneId/procurement-evidence/:evidenceId/review')
  @UseGuards(CombinedAuthGuard)
  async reviewMilestoneProcurementEvidence(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Param('evidenceId') evidenceId: string,
    @Body()
    body: {
      decision: 'approved' | 'rejected';
      approvedAmount?: number;
      reviewNotes?: string;
      titleTransferAcknowledged?: boolean;
    },
    @Request() req: any,
  ) {
    if (req.user?.isProfessional) {
      throw new ForbiddenException('Professionals cannot review procurement evidence');
    }

    const actorRole: 'client' | 'admin' = req.user?.role === 'admin' ? 'admin' : 'client';
    return this.financialService.reviewMilestoneProcurementEvidence({
      projectId,
      milestoneId,
      evidenceId,
      actorId: req.user.id,
      actorRole,
      decision: body?.decision,
      approvedAmount: body?.approvedAmount,
      reviewNotes: body?.reviewNotes,
      titleTransferAcknowledged: Boolean(body?.titleTransferAcknowledged),
    });
  }

  @Post('project/:projectId/milestones/:milestoneId/professional-skip-materials')
  @UseGuards(CombinedAuthGuard)
  async professionalSkipMaterialsClaim(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: { notes?: string },
    @Request() req: any,
  ) {
    if (!req.user?.isProfessional) {
      throw new ForbiddenException('Only professionals can skip a materials claim');
    }
    return this.financialService.professionalSkipMaterialsClaim({
      projectId,
      milestoneId,
      professionalId: req.user.id,
      notes: body?.notes,
    });
  }

  @Post('project/:projectId/milestones/:milestoneId/return-foh-cap-remainder')
  @UseGuards(CombinedAuthGuard)
  async returnMilestoneFohCapRemainder(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: { notes?: string },
    @Request() req: any,
  ) {
    if (req.user?.isProfessional) {
      throw new ForbiddenException('Professionals cannot return cap remainder');
    }
    const actorRole: 'client' | 'admin' = req.user?.role === 'admin' ? 'admin' : 'client';
    return this.financialService.returnMilestoneFohCapRemainder({
      projectId,
      milestoneId,
      actorId: req.user.id,
      actorRole,
      notes: body?.notes,
    });
  }

  /**
   * GET /financial/pending-release-sla - Admin: milestones awaiting release beyond SLA threshold
   * Admin only
   */
  @Get('pending-release-sla')
  @UseGuards(AuthGuard('jwt'))
  async getPendingReleaseSla(
    @Request() req: any,
    @Query('days') days?: string,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can view pending release SLA data');
    }
    const daysThreshold = days ? Math.max(1, parseInt(days, 10) || 3) : 3;
    return this.financialService.getPendingReleaseSla(daysThreshold);
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
