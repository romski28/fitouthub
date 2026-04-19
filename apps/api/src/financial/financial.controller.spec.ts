import { ForbiddenException } from '@nestjs/common';
import { FinancialController } from './financial.controller';

describe('FinancialController Release A', () => {
  const makeController = () => {
    const financialService = {
      authorizeMilestoneFohCap: jest.fn(),
      getMilestoneProcurementEvidence: jest.fn(),
      submitMilestoneProcurementEvidence: jest.fn(),
      reviewMilestoneProcurementEvidence: jest.fn(),
      returnMilestoneFohCapRemainder: jest.fn(),
    } as any;

    const stripePaymentsService = {} as any;
    const controller = new FinancialController(financialService, stripePaymentsService);

    return { controller, financialService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks professionals from authorizing milestone cap', async () => {
    const { controller } = makeController();

    await expect(
      controller.authorizeMilestoneFohCap(
        'project-1',
        'milestone-1',
        { amount: 1000 },
        { user: { id: 'pro-1', isProfessional: true, role: 'professional' } },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forwards cap authorization for client actor', async () => {
    const { controller, financialService } = makeController();
    financialService.authorizeMilestoneFohCap.mockResolvedValue({ success: true });

    await controller.authorizeMilestoneFohCap(
      'project-1',
      'milestone-1',
      { amount: 1200, notes: 'cap' },
      { user: { id: 'client-1', isProfessional: false, role: 'client' } },
    );

    expect(financialService.authorizeMilestoneFohCap).toHaveBeenCalledWith({
      projectId: 'project-1',
      milestoneId: 'milestone-1',
      actorId: 'client-1',
      actorRole: 'client',
      amount: 1200,
      notes: 'cap',
    });
  });

  it('blocks non professional/admin evidence submission', async () => {
    const { controller } = makeController();

    await expect(
      controller.submitMilestoneProcurementEvidence(
        'project-1',
        'milestone-1',
        { claimedAmount: 500 },
        { user: { id: 'u-1', isProfessional: false, role: 'client' } },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forwards evidence submission for professional actor', async () => {
    const { controller, financialService } = makeController();
    financialService.submitMilestoneProcurementEvidence.mockResolvedValue({ success: true });

    await controller.submitMilestoneProcurementEvidence(
      'project-1',
      'milestone-1',
      {
        claimedAmount: 700,
        invoiceUrls: ['https://example.com/invoice.pdf'],
        photoUrls: ['https://example.com/photo.jpg'],
        notes: 'materials onsite',
      },
      { user: { id: 'pro-1', isProfessional: true, role: 'professional' } },
    );

    expect(financialService.submitMilestoneProcurementEvidence).toHaveBeenCalledWith({
      projectId: 'project-1',
      milestoneId: 'milestone-1',
      actorId: 'pro-1',
      actorRole: 'professional',
      claimedAmount: 700,
      invoiceUrls: ['https://example.com/invoice.pdf'],
      photoUrls: ['https://example.com/photo.jpg'],
      notes: 'materials onsite',
    });
  });

  it('blocks professionals from reviewing evidence', async () => {
    const { controller } = makeController();

    await expect(
      controller.reviewMilestoneProcurementEvidence(
        'project-1',
        'milestone-1',
        'evidence-1',
        { decision: 'approved', approvedAmount: 200 },
        { user: { id: 'pro-1', isProfessional: true, role: 'professional' } },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forwards evidence review for admin actor', async () => {
    const { controller, financialService } = makeController();
    financialService.reviewMilestoneProcurementEvidence.mockResolvedValue({ success: true });

    await controller.reviewMilestoneProcurementEvidence(
      'project-1',
      'milestone-1',
      'evidence-1',
      {
        decision: 'approved',
        approvedAmount: 450,
        reviewNotes: 'verified',
        titleTransferAcknowledged: true,
      },
      { user: { id: 'admin-1', isProfessional: false, role: 'admin' } },
    );

    expect(financialService.reviewMilestoneProcurementEvidence).toHaveBeenCalledWith({
      projectId: 'project-1',
      milestoneId: 'milestone-1',
      evidenceId: 'evidence-1',
      actorId: 'admin-1',
      actorRole: 'admin',
      decision: 'approved',
      approvedAmount: 450,
      reviewNotes: 'verified',
      titleTransferAcknowledged: true,
    });
  });

  it('blocks professionals from returning cap remainder', async () => {
    const { controller } = makeController();

    await expect(
      controller.returnMilestoneFohCapRemainder(
        'project-1',
        'milestone-1',
        { notes: 'closeout' },
        { user: { id: 'pro-1', isProfessional: true, role: 'professional' } },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forwards cap remainder return for client actor', async () => {
    const { controller, financialService } = makeController();
    financialService.returnMilestoneFohCapRemainder.mockResolvedValue({ success: true });

    await controller.returnMilestoneFohCapRemainder(
      'project-1',
      'milestone-1',
      { notes: 'release unused' },
      { user: { id: 'client-1', isProfessional: false, role: 'client' } },
    );

    expect(financialService.returnMilestoneFohCapRemainder).toHaveBeenCalledWith({
      projectId: 'project-1',
      milestoneId: 'milestone-1',
      actorId: 'client-1',
      actorRole: 'client',
      notes: 'release unused',
    });
  });
});
