import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ProjectStage } from '@prisma/client';

export interface NextStepAction {
  actionKey: string;
  actionLabel: string;
  description?: string;
  modalContent?: NextStepModalContent;
  isPrimary: boolean;
  isElective: boolean;
  requiresAction: boolean;
  estimatedDurationMinutes?: number;
  displayOrder: number;
}

export interface NextStepModalContent {
  title?: string;
  body?: string;
  detailsBody?: string;
  successTitle?: string;
  successBody?: string;
  successNextStepBody?: string;
  imageUrl?: string;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  primaryActionType?: string;
  primaryActionTarget?: string;
  secondaryActionType?: string;
  secondaryActionTarget?: string;
  detailsTarget?: string;
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

  private extractModalContent(config: any): NextStepModalContent | undefined {
    if (!config) return undefined;

    const modalContent: NextStepModalContent = {
      title: config.modalTitle || undefined,
      body: config.modalBody || undefined,
      detailsBody: config.modalDetailsBody || undefined,
      successTitle: config.modalSuccessTitle || undefined,
      successBody: config.modalSuccessBody || undefined,
      successNextStepBody: config.modalSuccessNextStepBody || undefined,
      imageUrl: config.modalImageUrl || undefined,
      primaryButtonLabel: config.modalPrimaryButtonLabel || undefined,
      secondaryButtonLabel: config.modalSecondaryButtonLabel || undefined,
      primaryActionType: config.modalPrimaryActionType || undefined,
      primaryActionTarget: config.modalPrimaryActionTarget || undefined,
      secondaryActionType: config.modalSecondaryActionType || undefined,
      secondaryActionTarget: config.modalSecondaryActionTarget || undefined,
      detailsTarget: config.detailsTarget || undefined,
    };

    return Object.values(modalContent).some((value) => value != null)
      ? modalContent
      : undefined;
  }

  private async getProfessionalWalletTransferPrerequisiteStatus(
    projectId: string,
  ): Promise<'not_required' | 'pending' | 'completed'> {
    const paymentPlan = await this.prisma.projectPaymentPlan.findUnique({
      where: { projectId },
      select: {
        projectScale: true,
        milestones: {
          where: { sequence: 1 },
          select: { id: true },
          take: 1,
        },
      },
    });

    const normalizedScale = String(paymentPlan?.projectScale || '').toUpperCase();
    const firstMilestoneId = paymentPlan?.milestones?.[0]?.id;

    if (!firstMilestoneId || !['SCALE_1', 'SCALE_2'].includes(normalizedScale)) {
      return 'not_required';
    }

    // For SCALE_1/2 the full prerequisite chain is:
    //   1. Client authorizes the milestone 1 cap (AUTHORIZE_MATERIALS_WALLET client step)
    //   2. Professional submits materials purchase evidence
    //   3. Client approves the evidence → proven amount moves to withdrawable wallet
    // The professional is always gated (pending) until step 3 is confirmed.
    // This is intentional: for all other scales 'not_required' is returned above.
    const approvedCount = await this.prisma.financialTransaction.count({
      where: {
        projectId,
        type: 'milestone_procurement_approved',
        status: 'confirmed',
        notes: { contains: firstMilestoneId },
      },
    });

    return approvedCount > 0 ? 'completed' : 'pending';
  }

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
    try {
    // Get project with current stage
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        currentStage: true,
        status: true,
        projectScale: true,
        userId: true,
        clientId: true,
        awardedProjectProfessionalId: true,
        clientSignedAt: true,
        professionalSignedAt: true,
        escrowHeld: true,
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

    // Verify user has access — project may use userId or clientId
    const isClient =
      (project.userId != null && project.userId === userId) ||
      ((project as any).clientId != null && (project as any).clientId === userId);

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

    // Guard against null currentStage (e.g. projects created before migration)
    const safeStage: ProjectStage = project.currentStage ?? ProjectStage.CREATED;

    const effectiveStage =
      project.status === 'awarded' &&
      awardedButPreContractStages.includes(safeStage)
        ? ProjectStage.CONTRACT_PHASE
        : safeStage;

    // Get available actions for this stage and role
    const nextSteps = await this.prisma.nextStepConfig.findMany({
      where: {
        projectStage: effectiveStage,
        role: role,
      },
      orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
    });

    const modalContentByActionKey = new Map<string, NextStepModalContent>();
    for (const step of nextSteps) {
      const modalContent = this.extractModalContent(step);
      if (modalContent) {
        modalContentByActionKey.set(step.actionKey, modalContent);
      }
    }

    const toApiAction = (step: any): NextStepAction => ({
      actionKey: step.actionKey,
      actionLabel: step.actionLabel,
      description: step.description || undefined,
      modalContent:
        this.extractModalContent(step) || modalContentByActionKey.get(step.actionKey),
      isPrimary: Boolean(step.isPrimary),
      isElective: Boolean(step.isElective),
      requiresAction: Boolean(step.requiresAction),
      estimatedDurationMinutes: step.estimatedDurationMinutes || undefined,
      displayOrder: Number(step.displayOrder || 0),
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

    if (
      role === 'PROFESSIONAL' &&
      isProfessional &&
      isProfessional.status === 'quoted' &&
      project.status !== 'awarded'
    ) {
      availableConfigSteps = [
        createSyntheticPrimaryStep(
          'WAIT_FOR_CLIENT_DECISION',
          'Wait for client review and decision',
          false,
          role,
          effectiveStage,
          'Your quote has been submitted. No action is needed from you until the client responds.',
        ),
      ];
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

      if (role === 'PROFESSIONAL' && !clientSigned && !professionalSigned) {
        const submitContractStep = nextSteps.find(
          (step) => step.actionKey === 'SUBMIT_CONTRACT',
        );
        availableConfigSteps = submitContractStep
          ? [submitContractStep]
          : [
              createSyntheticPrimaryStep(
                'SUBMIT_CONTRACT',
                'Review agreement',
                true,
                role,
                effectiveStage,
                'Submit your drafted agreement so the client can review and sign.',
              ),
            ];
      }

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
        const signContractStep =
          nextSteps.find((step) => step.actionKey === 'SIGN_CONTRACT') ||
          nextSteps.find((step) => step.actionKey === 'REVIEW_CONTRACT');
        availableConfigSteps = signContractStep
          ? [signContractStep]
          : [
              createSyntheticPrimaryStep(
                'SIGN_CONTRACT',
                'Sign contract',
                true,
                role,
                effectiveStage,
                'Sign the contract so the client can proceed to escrow funding.',
              ),
            ];
      }

      if (role === 'PROFESSIONAL' && clientSigned && professionalSigned) {
        // Check if professional has already confirmed the schedule
        const scheduleActions = await this.prisma.nextStepAction.findMany({
          where: { projectId, userId, projectStage: effectiveStage, actionKey: 'CONFIRM_SCHEDULE' },
          select: { userAction: true },
        });
        const scheduleConfirmed = scheduleActions.some((a) => a.userAction === 'COMPLETED');

        if (scheduleConfirmed) {
          const escrowFunded = Number(project.escrowHeld ?? 0) > 0;

          let walletTransferPrerequisite: 'not_required' | 'pending' | 'completed' = 'not_required';
          if (escrowFunded) {
            walletTransferPrerequisite = await this.getProfessionalWalletTransferPrerequisiteStatus(projectId);
          }

          const canStartProject = escrowFunded && walletTransferPrerequisite !== 'pending';

          availableConfigSteps = [
            createSyntheticPrimaryStep(
              canStartProject
                ? 'START_PROJECT'
                : escrowFunded
                  ? 'WAIT_FOR_MATERIALS_PROCESS'
                  : 'WAIT_FOR_CLIENT_FUNDS',
              canStartProject
                ? 'Start the project'
                : escrowFunded
                  ? 'Wait for milestone 1 materials process'
                  : 'Wait for client funds',
              canStartProject,
              role,
              effectiveStage,
              canStartProject
                ? 'Escrow is funded. You are ready to begin work on site.'
                : escrowFunded
                  ? 'Escrow is funded. The client is completing the milestone 1 materials wallet process. Submit your materials purchase receipts once you have purchased the required materials, then the client will release the confirmed amount to your withdrawable wallet.'
                  : 'Schedule confirmed. Waiting for client to fund escrow before work can begin.',
            ),
          ];
        } else {
          availableConfigSteps = [
            createSyntheticPrimaryStep(
              'CONFIRM_SCHEDULE',
              'Confirm schedule',
              true,
              role,
              effectiveStage,
              'Set the start date, build your milestone schedule, then confirm it is ready.',
            ),
          ];
        }
      }
    }

    if (role === 'CLIENT' && project.status === 'awarded') {
      const pendingPaymentRequest =
        await this.prisma.financialTransaction.findFirst({
          where: {
            projectId,
            type: 'payment_request',
            status: 'pending',
            actionComplete: false,
            actionBy: userId,
            actionByRole: 'client',
          },
          orderBy: { createdAt: 'desc' },
        });

      if (pendingPaymentRequest) {
        availableConfigSteps = [
          {
            actionKey: 'REVIEW_PAYMENT_REQUEST',
            actionLabel: 'Review payment request',
            description:
              'A professional has requested payment. Review and approve or reject the request.',
            isPrimary: true,
            isElective: false,
            requiresAction: true,
            estimatedDurationMinutes: 8,
            displayOrder: 1,
          } as any,
        ];
      }

      const contractFullySigned =
        Boolean(project.clientSignedAt) &&
        Boolean(project.professionalSignedAt);

      const acceptedStartProposal = contractFullySigned
        ? await this.prisma.projectStartProposal.findFirst({
            where: {
              projectId,
              status: 'accepted',
            },
            orderBy: { createdAt: 'desc' },
          })
        : null;

      const latestStartProposal = contractFullySigned
        ? await this.prisma.projectStartProposal.findFirst({
            where: {
              projectId,
              status: 'proposed',
            },
            orderBy: { createdAt: 'desc' },
          })
        : null;

      if (!pendingPaymentRequest && latestStartProposal) {
        availableConfigSteps = [
          {
            actionKey: 'CONFIRM_START_DETAILS',
            actionLabel: 'Confirm start details',
            description:
              latestStartProposal.proposedByRole === 'professional'
                ? 'Review the proposed start date and either accept it or send back an update.'
                : 'The client has sent back an updated start date. Review it and respond.',
            isPrimary: true,
            isElective: false,
            requiresAction: latestStartProposal.proposedByRole === 'professional',
            estimatedDurationMinutes: 5,
            displayOrder: 1,
          } as any,
        ];
      }

      // Only offer escrow deposit AFTER both parties have signed the contract.
      // Until then, the standard CONTRACT_PHASE step (sign contract) should show.
      if (!pendingPaymentRequest && contractFullySigned && !latestStartProposal) {
        const isScale3Project = project.projectScale === 'SCALE_3';

        if (isScale3Project && acceptedStartProposal) {
          const clientScheduleConfirmed = await this.prisma.nextStepAction.findFirst({
            where: {
              projectId,
              userId,
              actionKey: 'CONFIRM_SCHEDULE',
              userAction: 'COMPLETED',
              projectStage: effectiveStage,
            },
          });

          if (!clientScheduleConfirmed) {
            availableConfigSteps = [
              {
                actionKey: 'CONFIRM_SCHEDULE',
                actionLabel: 'Agree milestone schedule',
                description:
                  'Start date is agreed. Please review and confirm the milestone schedule before funding escrow.',
                isPrimary: true,
                isElective: false,
                requiresAction: true,
                estimatedDurationMinutes: 8,
                displayOrder: 1,
              } as any,
            ];
            return {
              PRIMARY: availableConfigSteps.map(toApiAction),
              ELECTIVE: [],
              status: project.status,
              stage: effectiveStage,
            };
          }
        }

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

        // For Class 1/2 projects, two sequential client steps apply after escrow is funded:
        //   Step A: Client authorizes the milestone 1 cap (no proof needed — nominal allocation).
        //   Step B: After professional submits purchase receipts, client reviews & approves.
        // These steps are only for milestone 1. Subsequent milestones use the normal
        // professional payment-request flow.
        const escrowNowFunded = Number(project.escrowHeld ?? 0) > 0;
        if (escrowNowFunded && !pendingEscrowRequest) {
          const projectScale = String(project.projectScale || '').toUpperCase();
          if (['SCALE_1', 'SCALE_2'].includes(projectScale)) {
            const procPlan = await this.prisma.projectPaymentPlan.findUnique({
              where: { projectId },
              select: {
                milestones: {
                  where: { sequence: 1 },
                  select: { id: true },
                  take: 1,
                },
              },
            });
            const m1Id = procPlan?.milestones?.[0]?.id;
            if (m1Id) {
              const [capCount, pendingEvidenceCount] = await this.prisma.$transaction([
                this.prisma.financialTransaction.count({
                  where: {
                    projectId,
                    type: 'milestone_foh_allocation_cap',
                    status: 'confirmed',
                    notes: { contains: m1Id },
                  },
                }),
                (this.prisma as any).milestoneProcurementEvidence.count({
                  where: {
                    projectId,
                    paymentMilestoneId: m1Id,
                    status: 'pending',
                  },
                }),
              ]);

              if (capCount === 0) {
                // Step A: client confirms the nominal wallet allocation (no proof needed).
                availableConfigSteps = [
                  {
                    actionKey: 'AUTHORIZE_MATERIALS_WALLET',
                    actionLabel: 'Transfer materials funds to professional wallet',
                    description:
                      "Escrow is funded. Transfer the agreed milestone 1 amount to the professional's project wallet so they can purchase materials. This makes the funds available to them but not yet withdrawable \u2014 withdrawal requires them to submit purchase receipts for your review.",
                    isPrimary: true,
                    isElective: false,
                    requiresAction: true,
                    estimatedDurationMinutes: 3,
                    displayOrder: 1,
                  } as any,
                ];
              } else if (pendingEvidenceCount > 0) {
                // Step B: professional has submitted receipts, client reviews.
                availableConfigSteps = [
                  {
                    actionKey: 'REVIEW_MATERIALS_PURCHASE',
                    actionLabel: 'Review materials purchase receipts',
                    description:
                      'The professional has submitted purchase receipts. Review and approve to move the confirmed amount to their withdrawable wallet. Any unspent balance will be returned to your escrow.',
                    isPrimary: true,
                    isElective: false,
                    requiresAction: true,
                    estimatedDurationMinutes: 5,
                    displayOrder: 1,
                  } as any,
                ];
              }
            }
          }
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
      .map(toApiAction);

    const elective = availableSteps
      .filter((s) => s.isElective)
      .map(toApiAction);

    return {
      PRIMARY: primary,
      ELECTIVE: elective,
      status: project.status,
      stage: effectiveStage,
    };
    } catch (error: any) {
      // Never crash the process — return empty steps so the page still loads
      console.error('[NextStepService.getNextSteps] error:', error?.message, { projectId, userId, role });
      return { PRIMARY: [], ELECTIVE: [], status: 'unknown', stage: ProjectStage.CREATED };
    }
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

  async listNextStepConfigs(filters?: {
    role?: string;
    projectStage?: ProjectStage;
    actionKey?: string;
  }) {
    return this.prisma.nextStepConfig.findMany({
      where: {
        role: filters?.role,
        projectStage: filters?.projectStage,
        actionKey: filters?.actionKey,
      },
      orderBy: [{ projectStage: 'asc' }, { role: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  async updateNextStepConfigModalContent(
    id: string,
    payload: {
      modalTitle?: string | null;
      modalBody?: string | null;
      modalDetailsBody?: string | null;
      modalSuccessTitle?: string | null;
      modalSuccessBody?: string | null;
      modalSuccessNextStepBody?: string | null;
      modalImageUrl?: string | null;
      modalPrimaryButtonLabel?: string | null;
      modalSecondaryButtonLabel?: string | null;
      modalPrimaryActionType?: string | null;
      modalPrimaryActionTarget?: string | null;
      modalSecondaryActionType?: string | null;
      modalSecondaryActionTarget?: string | null;
    },
  ) {
    return this.prisma.nextStepConfig.update({
      where: { id },
      data: {
        modalTitle: payload.modalTitle ?? null,
        modalBody: payload.modalBody ?? null,
        modalDetailsBody: payload.modalDetailsBody ?? null,
        modalSuccessTitle: payload.modalSuccessTitle ?? null,
        modalSuccessBody: payload.modalSuccessBody ?? null,
        modalSuccessNextStepBody: payload.modalSuccessNextStepBody ?? null,
        modalImageUrl: payload.modalImageUrl ?? null,
        modalPrimaryButtonLabel: payload.modalPrimaryButtonLabel ?? null,
        modalSecondaryButtonLabel: payload.modalSecondaryButtonLabel ?? null,
        modalPrimaryActionType: payload.modalPrimaryActionType ?? null,
        modalPrimaryActionTarget: payload.modalPrimaryActionTarget ?? null,
        modalSecondaryActionType: payload.modalSecondaryActionType ?? null,
        modalSecondaryActionTarget: payload.modalSecondaryActionTarget ?? null,
      },
    });
  }
}
