import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { FinancialService } from './financial.service';

describe('FinancialService Release A', () => {
  const makeService = () => {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      professional: {
        findUnique: jest.fn(),
      },
      activityLog: {
        create: jest.fn(),
      },
      milestoneProcurementEvidence: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      financialTransaction: {
        aggregate: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;

    prisma.$transaction.mockImplementation(async (input: any) => {
      if (typeof input === 'function') {
        return input(prisma);
      }
      return input;
    });

    const service = new FinancialService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, prisma };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authorizeMilestoneFohCap blocks non-owner client', async () => {
    const { service } = makeService();

    jest.spyOn(service as any, 'getMilestoneProcurementContext').mockResolvedValue({
      paymentPlan: {
        id: 'pp-1',
        projectScale: 'SCALE_1',
      },
      milestone: {
        id: 'm1',
        sequence: 1,
        title: 'Milestone 1',
        status: 'escrow_funded',
        amount: 1000,
      },
      project: {
        id: 'p1',
        userId: 'owner-client',
      },
      projectProfessional: {
        id: 'pprof-1',
      },
    });

    await expect(
      service.authorizeMilestoneFohCap({
        projectId: 'p1',
        milestoneId: 'm1',
        actorId: 'other-client',
        actorRole: 'client',
        amount: 500,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reviewMilestoneProcurementEvidence rejects approval above remaining cap', async () => {
    const { service, prisma } = makeService();

    jest.spyOn(service as any, 'getMilestoneProcurementContext').mockResolvedValue({
      paymentPlan: {
        id: 'plan-1',
        projectScale: 'SCALE_1',
      },
      milestone: {
        id: 'm1',
        sequence: 1,
        title: 'Milestone 1',
      },
      project: {
        id: 'p1',
        userId: 'client-1',
      },
      projectProfessional: {
        id: 'pprof-1',
      },
    });

    prisma.milestoneProcurementEvidence.findFirst.mockResolvedValue({
      id: 'e-1',
      status: 'pending',
      claimedAmount: new Decimal('900.00'),
    });

    jest.spyOn(service as any, 'retryWithBackoff').mockResolvedValue([
      { _sum: { amount: new Decimal('1000.00') } },
      { _sum: { amount: new Decimal('200.00') } },
      { _sum: { amount: new Decimal('100.00') } },
    ]);

    await expect(
      service.reviewMilestoneProcurementEvidence({
        projectId: 'p1',
        milestoneId: 'm1',
        evidenceId: 'e-1',
        actorId: 'client-1',
        actorRole: 'client',
        decision: 'approved',
        approvedAmount: 800,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returnMilestoneFohCapRemainder rejects when no remainder exists', async () => {
    const { service } = makeService();

    jest.spyOn(service as any, 'getMilestoneProcurementContext').mockResolvedValue({
      paymentPlan: {
        id: 'plan-1',
        projectScale: 'SCALE_2',
      },
      milestone: {
        id: 'm1',
        sequence: 1,
        title: 'Milestone 1',
      },
      project: {
        id: 'p1',
        userId: 'client-1',
      },
      projectProfessional: {
        id: 'pprof-1',
      },
    });

    jest.spyOn(service as any, 'retryWithBackoff').mockResolvedValue([
      { _sum: { amount: new Decimal('100.00') } },
      { _sum: { amount: new Decimal('60.00') } },
      { _sum: { amount: new Decimal('40.00') } },
    ]);

    await expect(
      service.returnMilestoneFohCapRemainder({
        projectId: 'p1',
        milestoneId: 'm1',
        actorId: 'client-1',
        actorRole: 'client',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('getProjectWalletSummary includes cap/approved/remainder transactions in buckets', async () => {
    const { service } = makeService();

    const milestone1Meta =
      '__FOH_MILESTONE__' + JSON.stringify({ paymentMilestoneId: 'm1', milestoneSequence: 1, milestoneTitle: 'Milestone 1' });
    const milestone2Meta =
      '__FOH_MILESTONE__' + JSON.stringify({ paymentMilestoneId: 'm2', milestoneSequence: 2, milestoneTitle: 'Milestone 2' });

    jest.spyOn(service as any, 'retryWithBackoff').mockResolvedValue([
      {
        id: 'p1',
        approvedBudget: new Decimal('1000.00'),
        budget: new Decimal('1000.00'),
        escrowHeld: new Decimal('1000.00'),
      },
      {
        id: 'plan-1',
        currency: 'HKD',
        totalAmount: new Decimal('1000.00'),
        milestones: [
          { id: 'm1', sequence: 1, title: 'Milestone 1', amount: new Decimal('400.00'), status: 'escrow_funded' },
          { id: 'm2', sequence: 2, title: 'Milestone 2', amount: new Decimal('600.00'), status: 'scheduled' },
        ],
      },
      [
        { id: 't1', type: 'escrow_deposit_confirmation', status: 'confirmed', amount: new Decimal('1000.00'), notes: null, createdAt: new Date().toISOString() },
        { id: 't2', type: 'milestone_foh_allocation_cap', status: 'confirmed', amount: new Decimal('400.00'), notes: milestone1Meta, createdAt: new Date().toISOString() },
        { id: 't3', type: 'milestone_procurement_approved', status: 'confirmed', amount: new Decimal('250.00'), notes: milestone1Meta, createdAt: new Date().toISOString() },
        { id: 't4', type: 'milestone_cap_remainder_return', status: 'confirmed', amount: new Decimal('150.00'), notes: milestone1Meta, createdAt: new Date().toISOString() },
        { id: 't5', type: 'release_payment', status: 'confirmed', amount: new Decimal('100.00'), notes: milestone2Meta, createdAt: new Date().toISOString() },
        { id: 't6', type: 'professional_wallet_transfer', status: 'pending', amount: new Decimal('50.00'), notes: milestone1Meta, createdAt: new Date().toISOString() },
      ],
    ]);

    const summary = await service.getProjectWalletSummary('p1', null);

    expect(summary.clientFundedTotal).toBe(1000);
    expect(summary.clientEscrowHeld).toBe(650);
    expect(summary.professionalEscrowAllocated).toBe(0);
    expect(summary.professionalAvailable).toBe(300);
    expect(summary.clientEscrowUnallocated).toBe(650);

    const m1 = summary.milestoneBreakdown.find((m) => m.id === 'm1');
    expect(m1).toBeTruthy();
    expect(m1?.allocatedAmount).toBe(250);
    expect(m1?.availableAmount).toBe(250);
  });

  it('runs full Release A lifecycle: authorize cap -> submit evidence -> approve evidence -> return remainder', async () => {
    const { service, prisma } = makeService();

    jest.spyOn(service as any, 'getMilestoneProcurementContext').mockResolvedValue({
      paymentPlan: {
        id: 'plan-1',
        projectScale: 'SCALE_1',
      },
      milestone: {
        id: 'm1',
        sequence: 1,
        title: 'Milestone 1',
        status: 'escrow_funded',
        amount: 1000,
      },
      project: {
        id: 'p1',
        userId: 'client-1',
      },
      projectProfessional: {
        id: 'pprof-1',
        professionalId: 'pro-1',
      },
    });

    jest.spyOn(service, 'getProjectWalletSummary').mockResolvedValue({
      currency: 'HKD',
      contractValue: 1000,
      clientFundedTotal: 1000,
      clientEscrowHeld: 1000,
      clientEscrowUnallocated: 1000,
      professionalEscrowAllocated: 0,
      professionalInPayoutProcessing: 0,
      professionalAvailable: 0,
      professionalPaidOut: 0,
      remainingToFund: 0,
      milestoneBreakdown: [],
    } as any);

    const txTypes: string[] = [];
    prisma.financialTransaction.create.mockImplementation(async ({ data }: any) => {
      txTypes.push(data.type);
      return {
        id: `tx-${txTypes.length}`,
        ...data,
      };
    });

    prisma.milestoneProcurementEvidence.create.mockResolvedValue({
      id: 'e-1',
      status: 'pending',
      claimedAmount: new Decimal('400.00'),
    });
    prisma.milestoneProcurementEvidence.findFirst.mockResolvedValue({
      id: 'e-1',
      status: 'pending',
      claimedAmount: new Decimal('400.00'),
    });
    prisma.milestoneProcurementEvidence.update.mockResolvedValue({
      id: 'e-1',
      status: 'approved',
      approvedAmount: new Decimal('300.00'),
    });

    jest.spyOn(service as any, 'retryWithBackoff')
      .mockResolvedValueOnce([
        { _sum: { amount: new Decimal('1000.00') } },
        { _sum: { amount: new Decimal('0.00') } },
        { _sum: { amount: new Decimal('0.00') } },
      ])
      .mockResolvedValueOnce([
        { _sum: { amount: new Decimal('1000.00') } },
        { _sum: { amount: new Decimal('300.00') } },
        { _sum: { amount: new Decimal('0.00') } },
      ]);

    await service.authorizeMilestoneFohCap({
      projectId: 'p1',
      milestoneId: 'm1',
      actorId: 'client-1',
      actorRole: 'client',
      amount: 1000,
    });

    await service.submitMilestoneProcurementEvidence({
      projectId: 'p1',
      milestoneId: 'm1',
      actorId: 'pro-1',
      actorRole: 'professional',
      claimedAmount: 400,
      invoiceUrls: ['https://example.com/invoice.pdf'],
      photoUrls: ['https://example.com/photo.jpg'],
      notes: 'submitted',
    });

    await service.reviewMilestoneProcurementEvidence({
      projectId: 'p1',
      milestoneId: 'm1',
      evidenceId: 'e-1',
      actorId: 'client-1',
      actorRole: 'client',
      decision: 'approved',
      approvedAmount: 300,
      titleTransferAcknowledged: true,
    });

    await service.returnMilestoneFohCapRemainder({
      projectId: 'p1',
      milestoneId: 'm1',
      actorId: 'client-1',
      actorRole: 'client',
    });

    expect(txTypes).toEqual([
      'milestone_foh_allocation_cap',
      'milestone_procurement_approved',
      'milestone_cap_remainder_return',
    ]);
    expect(prisma.milestoneProcurementEvidence.create).toHaveBeenCalledTimes(1);
    expect(prisma.milestoneProcurementEvidence.update).toHaveBeenCalledTimes(1);
  });
});
