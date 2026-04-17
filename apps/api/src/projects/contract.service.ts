import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ContractService {
  constructor(private readonly prisma: PrismaService) {}

  private generateContractContent(
    project: any,
    awardedProfessional: any,
  ): string {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const professionalName =
      awardedProfessional?.professionalName ||
      awardedProfessional?.professional?.businessName ||
      'N/A';

    const professionalEmail =
      awardedProfessional?.professional?.user?.email || 'N/A';

    const quotedAmount =
      awardedProfessional?.quoteAmount instanceof Decimal
        ? awardedProfessional.quoteAmount.toFixed(2)
        : Number(awardedProfessional?.quoteAmount ?? 0).toFixed(2);

    const quoteStartAt = awardedProfessional?.quoteEstimatedStartAt
      ? new Date(awardedProfessional.quoteEstimatedStartAt)
      : null;

    const quoteDurationMinutes = Number(
      awardedProfessional?.quoteEstimatedDurationMinutes ?? NaN,
    );

    const quoteEndAt =
      quoteStartAt && Number.isFinite(quoteDurationMinutes) && quoteDurationMinutes > 0
        ? new Date(quoteStartAt.getTime() + quoteDurationMinutes * 60_000)
        : null;

    const estimatedStartDate =
      quoteStartAt && !Number.isNaN(quoteStartAt.getTime())
        ? quoteStartAt.toLocaleDateString('en-US')
        : 'To be confirmed';

    const estimatedEndDate =
      quoteEndAt && !Number.isNaN(quoteEndAt.getTime())
        ? quoteEndAt.toLocaleDateString('en-US')
        : 'To be confirmed';

    return `
RENOVATION SERVICES AGREEMENT

This Renovation Services Agreement ("Agreement") is entered into as of ${today}, by and between:

CLIENT: ${project.clientName}
Email: ${project.user?.email || 'N/A'}

PROFESSIONAL: ${professionalName}
Email: ${professionalEmail}
License: ${awardedProfessional?.professional?.licenseNumber || 'N/A'}

PROJECT: ${project.projectName}
Location: ${project.region}

1. SCOPE OF WORK
The Professional agrees to perform the renovation services as described in the project proposal and accepted quote for the above-referenced project.

2. PAYMENT TERMS
Total Contract Amount: ${project.paymentCurrency} ${quotedAmount}

Payment is made according to the milestone schedule agreed by both parties through FitOutHub.

3. TIMELINE
Estimated Start Date: ${estimatedStartDate}
Estimated Completion Date: ${estimatedEndDate}

4. RESPONSIBILITIES
- Professional performs work to industry standard and legal requirements.
- Client provides site access and milestone approvals/payments on time.

5. CHANGE ORDERS
All scope and pricing changes must be approved by both parties via the platform.

6. DISPUTES
Parties first use FitOutHub dispute resolution before legal escalation.

7. GOVERNING LAW
This Agreement is governed by the laws of Hong Kong.

By digitally signing this agreement in FitOutHub, each party acknowledges acceptance of these terms.
`.trim();
  }

  async getContract(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, surname: true },
        },
        awardedProjectProfessional: {
          include: {
            professional: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    surname: true,
                  },
                },
              },
            },
          },
        },
        clientSignedBy: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
        professionalSignedBy: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const userRole = this.getUserRole(project, userId);
    if (!userRole) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Projects awarded before the CONTRACT_PHASE stage fix may still carry a
    // pre-contract currentStage.  Treat them as CONTRACT_PHASE so the contract
    // can be loaded and signed.
    const preContractStages = [
      'CREATED',
      'BIDDING_ACTIVE',
      'SITE_VISIT_SCHEDULED',
      'SITE_VISIT_COMPLETE',
      'QUOTE_RECEIVED',
      'BIDDING_CLOSED',
    ];
    const effectiveStage =
      project.status === 'awarded' &&
      preContractStages.includes(project.currentStage)
        ? 'CONTRACT_PHASE'
        : project.currentStage;

    if (!this.isContractPhase(effectiveStage)) {
      throw new BadRequestException(
        'Contract is not yet available for this project',
      );
    }

    if (!project.awardedProjectProfessional) {
      throw new BadRequestException(
        'No professional has been awarded this project yet',
      );
    }

    const shouldRefreshLegacyUnsignedContract =
      Boolean(project.contractContent) &&
      !project.clientSignedAt &&
      !project.professionalSignedAt &&
      (project.contractContent?.includes('Budget:') ?? false);

    if (!project.contractContent || shouldRefreshLegacyUnsignedContract) {
      const contractContent = this.generateContractContent(
        project,
        project.awardedProjectProfessional,
      );

      const updated = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          contractContent,
          contractType: 'STANDARD',
          contractGeneratedAt: new Date(),
        },
      });

      project.contractContent = updated.contractContent;
      project.contractType = updated.contractType;
      project.contractGeneratedAt = updated.contractGeneratedAt;
    }

    return {
      projectId: project.id,
      projectName: project.projectName,
      contractType: project.contractType,
      contractContent: project.contractContent,
      contractGeneratedAt: project.contractGeneratedAt,
      clientSignedAt: project.clientSignedAt,
      clientSignedBy: project.clientSignedBy,
      professionalSignedAt: project.professionalSignedAt,
      professionalSignedBy: project.professionalSignedBy,
      isFullySigned: Boolean(
        project.clientSignedAt && project.professionalSignedAt,
      ),
      canSign: this.canUserSign(project, userRole),
    };
  }

  async signContract(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        awardedProjectProfessional: {
          include: {
            professional: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const userRole = this.getUserRole(project, userId);
    if (!userRole) {
      throw new ForbiddenException('You do not have access to this project');
    }

    if (!project.contractContent) {
      throw new BadRequestException('Contract has not been generated yet');
    }

    if (userRole === 'CLIENT' && project.clientSignedAt) {
      throw new BadRequestException('You have already signed this contract');
    }

    if (userRole === 'PROFESSIONAL' && project.professionalSignedAt) {
      throw new BadRequestException('You have already signed this contract');
    }

    const professionalSignerUserId =
      project.awardedProjectProfessional?.professional?.userId || null;

    const updateData: any =
      userRole === 'CLIENT'
        ? {
            clientSignedAt: new Date(),
            clientSignedById: userId,
          }
        : {
            professionalSignedAt: new Date(),
            professionalSignedById: professionalSignerUserId,
          };

    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: updateData,
      include: {
        clientSignedBy: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
        professionalSignedBy: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
      },
    });

    const preContractStages = [
      'CREATED',
      'BIDDING_ACTIVE',
      'SITE_VISIT_SCHEDULED',
      'SITE_VISIT_COMPLETE',
      'QUOTE_RECEIVED',
      'BIDDING_CLOSED',
    ];
    const effectiveStage =
      updatedProject.status === 'awarded' &&
      preContractStages.includes(updatedProject.currentStage)
        ? 'CONTRACT_PHASE'
        : updatedProject.currentStage;

    if (
      effectiveStage === 'CONTRACT_PHASE' &&
      updatedProject.clientSignedAt &&
      updatedProject.professionalSignedAt
    ) {
      const existingEscrowRequest =
        await this.prisma.financialTransaction.findFirst({
          where: {
            projectId,
            type: 'escrow_deposit_request',
            status: { in: ['pending', 'paid'] },
          },
        });

      if (!existingEscrowRequest) {
        const escrowAmount =
          updatedProject.approvedBudget ||
          project.awardedProjectProfessional?.quoteAmount ||
          null;

        if (escrowAmount) {
          const clientId = updatedProject.clientId || updatedProject.userId;
          await this.prisma.financialTransaction.create({
            data: {
              projectId,
              projectProfessionalId: project.awardedProjectProfessionalId,
              type: 'escrow_deposit_request',
              description: 'Request to deposit project fees to escrow',
              amount: new Decimal(escrowAmount.toString()),
              status: 'pending',
              requestedBy: 'foh',
              requestedByRole: 'platform',
              actionBy: clientId,
              actionByRole: 'client',
              actionComplete: false,
              notes: `Quote amount for project ${updatedProject.projectName || 'Project'}`,
            },
          });
        }
      }
    }

    return {
      success: true,
      signedAt:
        userRole === 'CLIENT'
          ? updatedProject.clientSignedAt
          : updatedProject.professionalSignedAt,
      signedBy:
        userRole === 'CLIENT'
          ? updatedProject.clientSignedBy
          : updatedProject.professionalSignedBy,
      isFullySigned: Boolean(
        updatedProject.clientSignedAt && updatedProject.professionalSignedAt,
      ),
    };
  }

  private getUserRole(
    project: any,
    userId: string,
  ): 'CLIENT' | 'PROFESSIONAL' | null {
    if (project.userId === userId || project.clientId === userId) {
      return 'CLIENT';
    }

    const awardedProfessional = project.awardedProjectProfessional;
    if (
      awardedProfessional?.professionalId === userId ||
      awardedProfessional?.professional?.userId === userId
    ) {
      return 'PROFESSIONAL';
    }

    return null;
  }

  private isContractPhase(stage: string): boolean {
    return [
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
    ].includes(stage);
  }

  private canUserSign(
    project: any,
    userRole: 'CLIENT' | 'PROFESSIONAL' | null,
  ): boolean {
    if (!userRole) return false;
    if (userRole === 'CLIENT' && project.clientSignedAt) return false;
    if (userRole === 'PROFESSIONAL' && project.professionalSignedAt)
      return false;
    return true;
  }
}
