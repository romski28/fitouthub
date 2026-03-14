import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ProjectStage } from '@prisma/client';

export interface NextStepAction {
  actionKey: string;
  actionLabel: string;
  description?: string;
  isPrimary: boolean;
  isElective: boolean;
  requiresAction: boolean;
  estimatedDurationMinutes?: number;
  displayOrder: number;
}

export interface NextStepResult {
  PRIMARY: NextStepAction[];
  ELECTIVE: NextStepAction[];
  status: string;
  stage: ProjectStage;
}

const createSyntheticPrimaryStep = (
  actionKey: string,
  actionLabel: string,
  requiresAction: boolean,
  role: string,
  projectStage: ProjectStage,
  description?: string,
): any => ({
  id: `synthetic-${actionKey}`,
  createdAt: new Date(),
  updatedAt: new Date(),
  role,
  projectStage,
  actionKey,
  actionLabel,
  description,
  isPrimary: true,
  isElective: false,
  requiresAction,
  estimatedDurationMinutes: null,
  displayOrder: 1,
});

@Injectable()
export class NextStepService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get available next step actions for a user in a project
   * @param projectId - Project ID
   * @param userId - User ID
   * @param role - 'CLIENT' or 'PROFESSIONAL' or 'ADMIN'
   * @returns NextStepResult with primary and elective actions
   */
  async getNextSteps(
    projectId: string,
    userId: string,
    role: string,
  ): Promise<NextStepResult> {
    // Get project with current stage
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        currentStage: true,
        status: true,
        userId: true,
        awardedProjectProfessionalId: true,
        clientSignedAt: true,
        professionalSignedAt: true,
        _count: {
          select: {
            professionals: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Verify user has access to this project
    const isClient = project.userId === userId;

    // Check if user is a professional on this project
    const isProfessional = await this.prisma.projectProfessional.findFirst({
      where: {
        projectId,
        OR: [
          { professionalId: userId },
          {
            professional: {
              userId,
            },
          },
        ],
      },
    });

    if (!isClient && !isProfessional && role !== 'ADMIN') {
      throw new Error('User does not have access to this project');
    }

    const awardedButPreContractStages: ProjectStage[] = [
      ProjectStage.CREATED,
      ProjectStage.BIDDING_ACTIVE,
      ProjectStage.SITE_VISIT_SCHEDULED,
      ProjectStage.SITE_VISIT_COMPLETE,
      ProjectStage.QUOTE_RECEIVED,
      ProjectStage.BIDDING_CLOSED,
    ];

    const effectiveStage =
      project.status === 'awarded' &&
      awardedButPreContractStages.includes(project.currentStage)
        ? ProjectStage.CONTRACT_PHASE
        : project.currentStage;

    // Get available actions for this stage and role
    const nextSteps = await this.prisma.nextStepConfig.findMany({
      where: {
        projectStage: effectiveStage,
        role: role,
      },
      orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
    });

    let availableConfigSteps = nextSteps;

    // If a professional has already accepted the invitation but the project stage is still CREATED,
    // they should see SUBMIT_QUOTE (BIDDING_ACTIVE steps) rather than REPLY_TO_INVITATION.
    if (
      role === 'PROFESSIONAL' &&
      isProfessional &&
      effectiveStage === ProjectStage.CREATED &&
      ['accepted', 'quoted', 'counter_requested', 'awarded'].includes(
        isProfessional.status,
      )
    ) {
      const biddingActiveSteps = await this.prisma.nextStepConfig.findMany({
        where: {
          projectStage: ProjectStage.BIDDING_ACTIVE,
          role: 'PROFESSIONAL',
        },
        orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
      });
      availableConfigSteps = biddingActiveSteps;
    }

    if (role === 'CLIENT' && effectiveStage === ProjectStage.CREATED) {
      const invitedProfessionalCount = project._count.professionals;

      if (invitedProfessionalCount === 0) {
        availableConfigSteps = nextSteps
          .filter((step) => step.actionKey === 'INVITE_PROFESSIONALS')
          .map((step) => ({
            ...step,
            isPrimary: true,
            isElective: false,
            requiresAction: true,
            description:
              step.description ||
              'Invite professionals so they can start quoting on your project.',
          }));
      } else {
        availableConfigSteps = nextSteps.map((step) =>
          step.actionKey === 'WAIT_FOR_QUOTES'
            ? {
                ...step,
                isPrimary: true,
                isElective: false,
                requiresAction: false,
              }
            : step,
        );
      }
    }

    if (
      effectiveStage === ProjectStage.CONTRACT_PHASE &&
      project.status === 'awarded'
    ) {
      const clientSigned = Boolean(project.clientSignedAt);
      const professionalSigned = Boolean(project.professionalSignedAt);

      if (role === 'CLIENT' && clientSigned && !professionalSigned) {
        availableConfigSteps = [
          createSyntheticPrimaryStep(
            'WAIT_FOR_PROFESSIONAL_SIGNATURE',
            'Wait for professional signature',
            false,
            role,
            effectiveStage,
            "The contract has been signed by you and is awaiting the professional's signature.",
          ),
        ];
      }

      if (role === 'PROFESSIONAL' && professionalSigned && !clientSigned) {
        availableConfigSteps = [
          createSyntheticPrimaryStep(
            'WAIT_FOR_CLIENT_SIGNATURE',
            'Wait for client signature',
            false,
            role,
            effectiveStage,
            "The contract has been signed by you and is awaiting the client's signature.",
          ),
        ];
      }

      if (role === 'PROFESSIONAL' && clientSigned && !professionalSigned) {
        availableConfigSteps = nextSteps.filter((step) =>
          ['REVIEW_CONTRACT', 'SIGN_CONTRACT'].includes(step.actionKey),
        );
      }
    }

    if (role === 'CLIENT' && project.status === 'awarded') {
      const contractFullySigned =
        Boolean(project.clientSignedAt) &&
        Boolean(project.professionalSignedAt);

      // Only offer escrow deposit AFTER both parties have signed the contract.
      // Until then, the standard CONTRACT_PHASE step (sign contract) should show.
      if (contractFullySigned) {
        const pendingEscrowRequest =
          await this.prisma.financialTransaction.findFirst({
            where: {
              projectId,
              type: 'escrow_deposit_request',
              status: 'pending',
              actionComplete: false,
              OR: [{ actionBy: userId }, { actionBy: null }],
            },
            orderBy: { createdAt: 'desc' },
          });

        if (pendingEscrowRequest) {
          availableConfigSteps = [
            {
              actionKey: 'DEPOSIT_ESCROW_FUNDS',
              actionLabel: 'Deposit funds to escrow',
              description:
                'Both parties have signed the contract. Confirm your escrow deposit so work can begin.',
              isPrimary: true,
              isElective: false,
              requiresAction: true,
              estimatedDurationMinutes: 10,
              displayOrder: 1,
            } as any,
          ];
        }
      }
    }

    // Check if any of these actions have already been completed
    const userActions = await this.prisma.nextStepAction.findMany({
      where: {
        projectId,
        userId,
        projectStage: effectiveStage,
      },
      select: { actionKey: true, userAction: true },
    });

    const completedActions = new Set(
      userActions
        .filter((a) => a.userAction === 'COMPLETED')
        .map((a) => a.actionKey),
    );

    // Filter out completed primary actions
    const availableSteps = availableConfigSteps.filter(
      (step) => !(step.isPrimary && completedActions.has(step.actionKey)),
    );

    // Split into primary and elective
    const primary = availableSteps
      .filter((s) => s.isPrimary)
      .map((s) => ({
        actionKey: s.actionKey,
        actionLabel: s.actionLabel,
        description: s.description || undefined,
        isPrimary: s.isPrimary,
        isElective: s.isElective,
        requiresAction: s.requiresAction,
        estimatedDurationMinutes: s.estimatedDurationMinutes || undefined,
        displayOrder: s.displayOrder,
      }));

    const elective = availableSteps
      .filter((s) => !s.isPrimary)
      .map((s) => ({
        actionKey: s.actionKey,
        actionLabel: s.actionLabel,
        description: s.description || undefined,
        isPrimary: s.isPrimary,
        isElective: s.isElective,
        requiresAction: s.requiresAction,
        estimatedDurationMinutes: s.estimatedDurationMinutes || undefined,
        displayOrder: s.displayOrder,
      }));

    return {
      PRIMARY: primary,
      ELECTIVE: elective,
      status: project.status,
      stage: effectiveStage,
    };
  }

  /**
   * Record user action on a next step suggestion
   * @param projectId - Project ID
   * @param userId - User ID
   * @param actionKey - Action identifier
   * @param userAction - COMPLETED, SKIPPED, DEFERRED, ALTERNATIVE
   * @param metadata - Optional additional data
   */
  async recordNextStepAction(
    projectId: string,
    userId: string,
    actionKey: string,
    userAction: 'COMPLETED' | 'SKIPPED' | 'DEFERRED' | 'ALTERNATIVE',
    metadata?: Record<string, any>,
  ) {
    // Get project stage
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { currentStage: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Record the action
    const action = await this.prisma.nextStepAction.create({
      data: {
        projectId,
        userId,
        actionKey,
        projectStage: project.currentStage,
        userAction,
        completedAt: userAction === 'COMPLETED' ? new Date() : null,
        metadata,
      },
    });

    return action;
  }

  /**
   * Get user's action history for a project
   */
  async getUserActionHistory(projectId: string, userId: string) {
    return this.prisma.nextStepAction.findMany({
      where: {
        projectId,
        userId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get analytics on which next steps users typically complete/skip
   */
  async getNextStepAnalytics(projectStage?: ProjectStage, role?: string) {
    const where: any = {};
    if (projectStage) where.projectStage = projectStage;
    if (role) where.role = role;

    const actions = await this.prisma.nextStepAction.findMany({
      where,
    });

    const stats: Record<string, any> = {};

    for (const action of actions) {
      const key = `${action.actionKey}`;
      if (!stats[key]) {
        stats[key] = {
          total: 0,
          completed: 0,
          skipped: 0,
          deferred: 0,
          alternative: 0,
        };
      }
      stats[key].total++;
      stats[key][action.userAction.toLowerCase()] =
        (stats[key][action.userAction.toLowerCase()] || 0) + 1;
    }

    return stats;
  }

  /**
   * Bulk populate NextStepConfig with seed data
   * (Called during application setup)
   */
  async initializeDefaultConfigs() {
    // Check if already initialized
    const existing = await this.prisma.nextStepConfig.count();
    if (existing > 0) return; // Already initialized

    // Will be populated by separate seed function
    return { message: 'NextStepConfig ready for seeding' };
  }
}
