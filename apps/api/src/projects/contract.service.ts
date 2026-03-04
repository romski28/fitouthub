import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ContractService {
  constructor(private readonly prisma: PrismaService) {}

  private generateContractContent(project: any, awardedProfessional: any): string {
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
Total Contract Amount: ${project.paymentCurrency} ${awardedProfessional?.agreedPrice?.toFixed?.(2) || '0.00'}
Budget: ${project.paymentCurrency} ${project.approvedBudget?.toFixed?.(2) || '0.00'}

Payment is made according to the milestone schedule agreed by both parties through FitOutHub.

3. TIMELINE
Estimated Start Date: ${project.startDate ? new Date(project.startDate).toLocaleDateString('en-US') : 'To be confirmed'}
Estimated Completion Date: ${project.endDate ? new Date(project.endDate).toLocaleDateString('en-US') : 'To be confirmed'}

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
                  select: { id: true, email: true, firstName: true, surname: true },
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

    if (!this.isContractPhase(project.currentStage)) {
      throw new BadRequestException('Contract is not yet available for this project');
    }

    if (!project.awardedProjectProfessional) {
      throw new BadRequestException('No professional has been awarded this project yet');
    }

    if (!project.contractContent) {
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
      isFullySigned: Boolean(project.clientSignedAt && project.professionalSignedAt),
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

    const updateData: any =
      userRole === 'CLIENT'
        ? {
            clientSignedAt: new Date(),
            clientSignedById: userId,
          }
        : {
            professionalSignedAt: new Date(),
            professionalSignedById: userId,
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

    if (
      updatedProject.currentStage === 'CONTRACT_PHASE' &&
      updatedProject.clientSignedAt &&
      updatedProject.professionalSignedAt
    ) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          currentStage: 'PRE_WORK',
          stageStartedAt: new Date(),
        },
      });
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

    if (project.awardedProjectProfessional?.professional?.userId === userId) {
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

  private canUserSign(project: any, userRole: 'CLIENT' | 'PROFESSIONAL' | null): boolean {
    if (!userRole) return false;
    if (userRole === 'CLIENT' && project.clientSignedAt) return false;
    if (userRole === 'PROFESSIONAL' && project.professionalSignedAt) return false;
    return true;
  }
}
