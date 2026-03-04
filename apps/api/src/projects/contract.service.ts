import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ContractService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate generic contract content
   * In the future, this can be extended to support different contract types
   */
  private generateContractContent(project: any, professional: any): string {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `
RENOVATION SERVICES AGREEMENT

This Renovation Services Agreement ("Agreement") is entered into as of ${today}, by and between:

CLIENT: ${project.clientName}
Email: ${project.user?.email || 'N/A'}

PROFESSIONAL: ${professional.professionalName || professional.professional?.businessName || 'N/A'}
Email: ${professional.professional?.user?.email || 'N/A'}
License: ${professional.professional?.licenseNumber || 'N/A'}

PROJECT: ${project.projectName}
Location: ${project.region}

1. SCOPE OF WORK
The Professional agrees to perform the renovation services as described in the project proposal and accepted quote for the above-referenced project. The work includes the following trades and services: ${project.tradesRequired?.join(', ') || 'As specified in proposal'}.

2. PAYMENT TERMS
Total Contract Amount: ${project.paymentCurrency} ${professional.agreedPrice?.toFixed(2) || '0.00'}
Budget: ${project.paymentCurrency} ${project.approvedBudget?.toFixed(2) || '0.00'}

Payment will be made according to the milestone schedule agreed upon by both parties. All payments will be processed through the FitOutHub platform's secure escrow system.

3. PROJECT TIMELINE
Estimated Start Date: ${project.startDate ? new Date(project.startDate).toLocaleDateString('en-US') : 'To be confirmed'}
Estimated Completion Date: ${project.endDate ? new Date(project.endDate).toLocaleDateString('en-US') : 'To be confirmed'}

The Professional will make reasonable efforts to complete the work within the estimated timeline, subject to unforeseen circumstances and approved change orders.

4. RESPONSIBILITIES

4.1 Professional's Responsibilities:
- Perform all work in a professional and workmanlike manner
- Comply with all applicable building codes and regulations
- Maintain required licenses and insurance coverage
- Provide all necessary labor, materials, and equipment unless otherwise specified
- Maintain a clean and safe work site
- Communicate progress updates through the FitOutHub platform

4.2 Client's Responsibilities:
- Provide access to the work site as required
- Make timely payment according to the milestone schedule
- Review and approve/reject milestone completions within reasonable timeframes
- Communicate any concerns or changes promptly through the platform

5. CHANGE ORDERS
Any changes to the scope of work must be agreed upon in writing by both parties through the FitOutHub platform. Additional work will be billed at agreed rates and added to the total contract amount.

6. WARRANTIES
The Professional warrants that all work will be performed in accordance with industry standards and will be free from defects in workmanship for a period of one (1) year from the date of project completion. This warranty does not cover normal wear and tear or damage caused by the Client or third parties.

7. INSURANCE AND LIABILITY
The Professional maintains general liability insurance and workers' compensation insurance as required by law. The Professional agrees to indemnify and hold harmless the Client from any claims arising from the Professional's negligence or willful misconduct.

8. DISPUTE RESOLUTION
In the event of any dispute arising from this Agreement, the parties agree to first attempt resolution through the FitOutHub platform's dispute resolution process. If the dispute cannot be resolved through the platform, the parties agree to pursue mediation before resorting to litigation.

9. TERMINATION
Either party may terminate this Agreement with written notice if the other party:
- Fails to perform material obligations under this Agreement
- Becomes insolvent or files for bankruptcy
- Violates applicable laws or regulations

Upon termination, the Client will pay for all work completed to date according to the milestone schedule.

10. ESCROW AND PAYMENTS
All payments will be processed through FitOutHub's secure escrow system. Funds will be held in escrow and released to the Professional upon Client approval of completed milestones. FitOutHub platform fees apply as specified in the platform's terms of service.

11. PLATFORM TERMS
This Agreement is subject to and incorporates by reference the FitOutHub Platform Terms of Service. In the event of any conflict between this Agreement and the Platform Terms, the Platform Terms shall control.

12. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements, whether written or oral. This Agreement may only be amended in writing signed by both parties through the FitOutHub platform.

13. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of Hong Kong.

BY SIGNING BELOW, BOTH PARTIES ACKNOWLEDGE THAT THEY HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THE TERMS OF THIS AGREEMENT.

---

DIGITAL SIGNATURES

Client Signature: ________________________________
Signed By: ${project.clientName}
Date: [To be filled upon signing]

Professional Signature: ________________________________
Signed By: ${professional.professionalName || professional.professional?.businessName || 'N/A'}
Date: [To be filled upon signing]

---

This is a legally binding contract. By digitally signing this agreement through the FitOutHub platform, you acknowledge that digital signatures have the same legal effect as handwritten signatures.
`.trim();
  }

  /**
   * Get contract for a project
   * Generates new contract if not already generated
   */
  async getContract(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, surname: true }
        },
        awardedProjectProfessional: {
          include: {
            professional: {
              include: {
                user: {
                  select: { id: true, email: true, firstName: true, surname: true }
                }
              }
            }
          }
        },
        clientSignedBy: {
          select: { id: true, firstName: true, surname: true, email: true }
        },
        professionalSignedBy: {
          select: { id: true, firstName: true, surname: true, email: true }
        }
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if user has access to this project
    const userRole = await this.getUserRole(project, userId);
    if (!userRole) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Check if project is in CONTRACT_PHASE or later
    if (!this.isContractPhase(project.currentStage)) {
      throw new BadRequestException(
        'Contract is not yet available for this project',
      );
    }

    // Check if project has an awarded professional
    if (!project.awardedProjectProfessional) {
      throw new BadRequestException(
        'No professional has been awarded this project yet',
      );
    }

    // Generate contract if not already generated
    if (!project.contractContent) {
      const contractContent = this.generateContractContent(
        project,
        project.awardedProjectProfessional
      );

      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          contractContent,
          contractType: 'STANDARD',
          contractGeneratedAt: new Date()
        }
      });

      project.contractContent = contractContent;
      project.contractType = 'STANDARD';
      project.contractGeneratedAt = new Date();
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
      isFullySigned: !!(project.clientSignedAt && project.professionalSignedAt),
      canSign: this.canUserSign(project, userId, userRole)
    };
  }

  /**
   * Sign contract (client or professional)
   */
  async signContract(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: true,
        awardedProjectProfessional: {
          include: {
            professional: {
              include: { user: true }
            }
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const userRole = await this.getUserRole(project, userId);
    if (!userRole) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Check if contract is generated
    if (!project.contractContent) {
      throw new BadRequestException('Contract has not been generated yet');
    }

    // Check if user already signed
    if (userRole === 'CLIENT' && project.clientSignedAt) {
      throw new BadRequestException('You have already signed this contract');
    }
    if (userRole === 'PROFESSIONAL' && project.professionalSignedAt) {
      throw new BadRequestException('You have already signed this contract');
    }

    // Sign the contract
    const updateData: any = {};
    if (userRole === 'CLIENT') {
      updateData.clientSignedAt = new Date();
      updateData.clientSignedById = userId;
    } else if (userRole === 'PROFESSIONAL') {
      updateData.professionalSignedAt = new Date();
      updateData.professionalSignedById = userId;
    }

    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: updateData,
      include: {
        clientSignedBy: {
          select: { id: true, firstName: true, surname: true, email: true }
        },
        professionalSignedBy: {
          select: { id: true, firstName: true, surname: true, email: true }
        }
      }
      updatedProject.clientSignedAt &&
      updatedProject.professionalSignedAt &&
      updatedProject.currentStage === 'CONTRACT_PHASE'
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
      isFullySigned: !!(
        updatedProject.clientSignedAt && updatedProject.professionalSignedAt
      ),
    project: any,
    userId: string,
  ): Promise<'CLIENT' | 'PROFESSIONAL' | null> {
    if (project.userId === userId || project.clientId === userId) {
      return 'CLIENT';
    }

    if (project.awardedProjectProfessional?.professional?.userId === userId) {
      return 'PROFESSIONAL';
    }

    return null;
  }

  /**
   * Helper: Check if project stage is CONTRACT_PHASE or later
   */
  private isContractPhase(stage: string): boolean {
    const contractPhaseStages = [
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
    ];
    return contractPhaseStages.includes(stage);
  }

  /**
   * Helper: Check if user can sign the contract
   */
  private canUserSign(
    project: any,
    userId: string,
    userRole: 'CLIENT' | 'PROFESSIONAL' | null,
  ): boolean {
    if (!userRole) return false;
    if (userRole === 'CLIENT' && project.clientSignedAt) return false;
    if (userRole === 'PROFESSIONAL' && project.professionalSignedAt)
     
    ];
    return contractPhaseStages.includes(stage);
  }

  /**
   * Helper: Check if user can sign the contract
   */
  private canUserSign(project: any, userId: string, userRole: 'CLIENT' | 'PROFESSIONAL' | null): boolean {
    if (!userRole) return false;
    if (userRole === 'CLIENT' && project.clientSignedAt) return false;
    if (userRole === 'PROFESSIONAL' && project.professionalSignedAt) return false;
    return true;
  }
}
