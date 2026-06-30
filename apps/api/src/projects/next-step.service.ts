import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ProjectStage } from '@prisma/client';

// ── In-memory cache for NextStepConfig (changes only on manual SQL deployment) ──
interface CachedConfig {
  steps: any[];
  timestamp: number;
}
const configCache = new Map<string, CachedConfig>();
const CACHE_TTL_MS = 60_000; // 60 seconds — short enough to pick up new configs after deploy

function getCachedConfig(cacheKey: string): any[] | null {
  const cached = configCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.steps;
  }
  configCache.delete(cacheKey);
  return null;
}

function setCachedConfig(cacheKey: string, steps: any[]): void {
  configCache.set(cacheKey, { steps, timestamp: Date.now() });
}

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

  private async buildInspectSiteStep(
    projectProfessionalId: string,
  ): Promise<any | null> {
    const approvedAccess = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId,
        status: { in: ['approved_visit_scheduled', 'approved_no_visit'] },
      },
      select: { visitScheduledAt: true, visitScheduledFor: true },
      orderBy: { respondedAt: 'desc' },
    });
    if (!approvedAccess) return null;
    const visitDateTime = approvedAccess.visitScheduledAt || approvedAccess.visitScheduledFor;
    const timeLabel = visitDateTime
      ? new Date(visitDateTime).toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: true })
      : null;
    const dateLabel = visitDateTime
      ? new Date(visitDateTime).toLocaleDateString('en-HK', { weekday: 'short', day: '2-digit', month: 'short' })
      : 'site';
    const label = timeLabel
      ? `Visit site at ${timeLabel} on ${dateLabel}`
      : `Visit site on ${dateLabel}`;
    return createSyntheticPrimaryStep(
      'INSPECT_SITE',
      label,
      true,
      'PROFESSIONAL',
      ProjectStage.BIDDING_ACTIVE,
      'Address access granted. View details on the Site Access tab.',
    );
  }

  private async getProfessionalWalletTransferPrerequisiteStatus(
    projectId: string,
    preFetchedPlan?: { projectScale?: string | null; milestones?: { id: string }[] } | null,
  ): Promise<'not_required' | 'pending' | 'completed' | 'skipped'> {
    const plan = preFetchedPlan ?? await this.prisma.projectPaymentPlan.findUnique({
      where: { projectId },
      select: {
        projectScale: true,
        milestones: {
          select: { id: true },
        },
      },
    });

    const normalizedScale = String(plan?.projectScale || '').toUpperCase();
    const milestones = plan?.milestones || [];
    const firstMilestoneId = milestones[0]?.id;

    // Single-milestone projects don't have a milestone 1 wallet transfer
    const isSingleMilestone = milestones.length <= 1;
    if (!firstMilestoneId || !['SCALE_1', 'SCALE_2'].includes(normalizedScale) || isSingleMilestone) {
      return 'not_required';
    }

    // Check cap authorization and whether the cap was subsequently returned (skip).
    const [capCount, returnCount] = await this.prisma.$transaction([
      this.prisma.financialTransaction.count({
        where: { projectId, type: 'milestone_foh_allocation_cap', status: 'confirmed', notes: { contains: firstMilestoneId } },
      }),
      this.prisma.financialTransaction.count({
        where: { projectId, type: 'milestone_cap_remainder_return', status: 'confirmed', notes: { contains: firstMilestoneId } },
      }),
    ]);

    if (capCount === 0) return 'pending';
    // Cap has been returned → professional skipped the materials workflow.
    if (returnCount > 0) return 'skipped';
    return 'completed';
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
    // Get project + professional assignment in parallel (independent queries)
    const [project, isProfessional] = await Promise.all([
      this.prisma.project.findUnique({
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
          startDate: true,
          siteStartedAt: true,
          siteInspectionAvailableOn: true,
          nextStepCache: true,
          updatedAt: true,
          _count: {
            select: {
              professionals: true,
            },
          },
        },
      }),
      this.prisma.projectProfessional.findFirst({
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
        select: {
          id: true,
          status: true,
          professionalId: true,
          addressVisible: true,
          addressVisibleAt: true,
          siteVisitedAt: true,
          professional: {
            select: {
              userId: true,
            },
          },
        },
      }),
    ]);

    if (!project) {
      throw new Error('Project not found');
    }

    // Verify user has access — project may use userId or clientId
    const isClient =
      (project.userId != null && project.userId === userId) ||
      ((project as any).clientId != null && (project as any).clientId === userId);

    if (!isClient && !isProfessional && role !== 'ADMIN') {
      throw new Error('User does not have access to this project');
    }

    // ── Compute effective stage early (before cache check) so overrides take effect ──
    const awardedButPreContractStages: ProjectStage[] = [
      ProjectStage.CREATED,
      ProjectStage.BIDDING_ACTIVE,
      ProjectStage.SITE_VISIT_SCHEDULED,
      ProjectStage.SITE_VISIT_COMPLETE,
      ProjectStage.QUOTE_RECEIVED,
      ProjectStage.BIDDING_CLOSED,
    ];
    const safeStage: ProjectStage = project.currentStage ?? ProjectStage.CREATED;
    const effectiveStage =
      project.status === 'awarded' &&
      awardedButPreContractStages.includes(safeStage)
        ? ProjectStage.CONTRACT_PHASE
        : safeStage;

    // ── Cache check: keyed by userId+role+effectiveStage ──
    const cache = project.nextStepCache as Record<string, any> | null;
    const cacheKey = `${userId}:${role}:${effectiveStage}`;
    if (cache?.[cacheKey]?.computedAt && project.updatedAt && new Date(cache[cacheKey].computedAt) > new Date(project.updatedAt)) {
      return cache[cacheKey].result as NextStepResult;
    }

    // Helper to save cache for this user+role
    const saveCache = (result: NextStepResult) => {
      void this.prisma.project.update({
        where: { id: projectId },
        data: {
          nextStepCache: {
            ...(project.nextStepCache as any || {}),
            [cacheKey]: { result, computedAt: new Date().toISOString() },
          },
        } as any,
      }).catch(() => {});
    };
    const returnWithCache = (r: NextStepResult): NextStepResult => { saveCache(r); return r; };

    // ── Pre-fetch payment plan once (used in multiple branches) ──
    const paymentPlan = await this.prisma.projectPaymentPlan.findUnique({
      where: { projectId },
      select: {
        id: true,
        projectScale: true,
        milestones: {
          select: { id: true, sequence: true, title: true, status: true },
          orderBy: { sequence: 'asc' },
        },
      },
    }).catch(() => null); // non-fatal — some projects may not have a plan yet

    // ── Pre-fetch start proposals once (used in CONTRACT_PHASE + PRE_WORK) ──
    const [acceptedStartProposal, latestStartProposal] = await Promise.all([
      this.prisma.projectStartProposal.findFirst({
        where: { projectId, status: 'accepted' },
        orderBy: { createdAt: 'desc' },
      }).catch(() => null),
      this.prisma.projectStartProposal.findFirst({
        where: { projectId, status: 'proposed' },
        orderBy: { createdAt: 'desc' },
      }).catch(() => null),
    ]);

    const actionActorWhere =
      role === 'PROFESSIONAL'
        ? { professionalId: isProfessional?.professionalId || userId }
        : { userId };

    // Get available actions for this stage and role (cached — NextStepConfig rarely changes)
    const configCacheKey = `config:${effectiveStage}:${role}`;
    let nextSteps = getCachedConfig(configCacheKey);
    if (!nextSteps) {
      nextSteps = await this.prisma.nextStepConfig.findMany({
        where: {
          projectStage: effectiveStage,
          role: role,
        },
        orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
      });
      setCachedConfig(configCacheKey, nextSteps);
    }

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

    // Legacy action key still exists in some seeded configs, but client-side site
    // access is now driven by explicit professional proposals/requests.
    if (role === 'CLIENT') {
      availableConfigSteps = availableConfigSteps.filter(
        (step) => step.actionKey !== 'REQUEST_SITE_VISIT',
      );
    }

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
      const biddingCacheKey = `config:${ProjectStage.BIDDING_ACTIVE}:PROFESSIONAL`;
      let biddingActiveSteps = getCachedConfig(biddingCacheKey);
      if (!biddingActiveSteps) {
        biddingActiveSteps = await this.prisma.nextStepConfig.findMany({
          where: {
            projectStage: ProjectStage.BIDDING_ACTIVE,
            role: 'PROFESSIONAL',
          },
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
        });
        setCachedConfig(biddingCacheKey, biddingActiveSteps);
      }
      availableConfigSteps = biddingActiveSteps;
    }

    // ── Professional bidding-phase steps (before award) ──
    if (
      role === 'PROFESSIONAL' &&
      isProfessional &&
      project.status !== 'awarded'
    ) {
      // Clear all DB-seeded steps — we'll rebuild with synthetic equivalents
      availableConfigSteps = [];

      const inspectionDate = (project as any).siteInspectionAvailableOn;

      // ── Quoted pros: waiting for client decision ──
      if (isProfessional.status === 'quoted') {
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
        // If address is visible, add INSPECT_SITE as elective (only if pro hasn't already skipped)
        if (isProfessional.addressVisible && !isProfessional.siteVisitedAt) {
          const skipCheck = await this.prisma.siteAccessRequest.findFirst({
            where: {
              projectProfessionalId: isProfessional.id,
              status: { in: ['skipped', 'approved_no_visit'] },
            },
            select: { id: true },
          });
          if (!skipCheck) {
            const step = await this.buildInspectSiteStep(isProfessional.id);
            if (step) {
              availableConfigSteps.push({ ...step, isPrimary: false, isElective: true } as any);
            }
          }
        }
      } else {
      // ── Accepted pros: site inspection OR quote, never both ──

      const quoteStep = {
        ...createSyntheticPrimaryStep(
          'SUBMIT_QUOTE',
          'Submit quote',
          true,
          role,
          effectiveStage,
          'Submit your quotation for this project.',
        ),
        isPrimary: true,
        displayOrder: 10,
      } as any;

      const declineStep = {
        ...createSyntheticPrimaryStep(
          'DECLINE_PROJECT',
          'Decline project',
          true,
          role,
          effectiveStage,
          'Decline this project invitation.',
        ),
        isPrimary: false,
        isElective: true,
        displayOrder: 20,
      } as any;

      // Date-gate: check if inspection date has passed without pro engagement
      if (
        inspectionDate &&
        !isProfessional.siteVisitedAt &&
        new Date(inspectionDate).toDateString() < new Date().toDateString()
      ) {
        const existingAccessReq = await this.prisma.siteAccessRequest.findFirst({
          where: {
            projectProfessionalId: isProfessional.id,
            status: { in: ['approved_visit_scheduled', 'approved_no_visit', 'visited', 'skipped', 'missed'] },
          },
          select: { id: true, status: true },
        });

        if (!existingAccessReq) {
          availableConfigSteps = [{
            ...createSyntheticPrimaryStep(
              'SITE_INSPECTION_EXPIRED',
              'Site inspection closed',
              true,
              role,
              effectiveStage,
              'The inspection date has passed and you did not book or skip a visit. We\'ll mark your record as missed and move you to the next step.',
            ),
            isPrimary: true,
            displayOrder: 0,
            modalTitle: 'Site inspection is now closed',
            modalBody: 'The inspection date has passed and you did not book or skip a visit. We\'ll mark your record as missed and move you to the next step.',
            modalPrimaryButtonLabel: 'Continue',
            modalPrimaryActionType: 'mark_site_inspection_expired',
            modalSecondaryButtonLabel: 'Cancel',
            modalSecondaryActionType: 'close_modal',
          } as any, declineStep];
        } else {
          // Already engaged (e.g. skipped) — go to quote
          availableConfigSteps = [quoteStep, declineStep];
        }
      }
      // If address is visible and not yet visited — INSPECT_SITE only
      else if (
        isProfessional.addressVisible === true &&
        !isProfessional.siteVisitedAt
      ) {
        const inspectStep = await this.buildInspectSiteStep(isProfessional.id);
        availableConfigSteps = inspectStep
          ? [{ ...inspectStep, isPrimary: true }]
          : [quoteStep, declineStep];
      }
      // If client set inspection date — site access loop
      else if (inspectionDate) {
        const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
          where: {
            projectProfessionalId: isProfessional.id,
            status: { notIn: ['cancelled', 'denied'] },
          },
          select: { id: true, status: true, visitDetails: true },
          orderBy: { requestedAt: 'desc' },
        });

        const latestStatus = (latestAccessRequest?.status || '').toLowerCase();
        const rescheduleRequired = Boolean(
          latestAccessRequest?.visitDetails?.includes('Site availability changed to'),
        );

        if (latestStatus === 'skipped') {
          // Pro chose not to visit — go to quote
          availableConfigSteps = [quoteStep, declineStep];
        } else if (latestStatus === 'pending') {
          // Awaiting approval
          availableConfigSteps = [{
            ...createSyntheticPrimaryStep(
              'AWAIT_SITE_ACCESS_APPROVAL',
              'Await approval of site inspection',
              false,
              role,
              effectiveStage,
              'Your site inspection request has been submitted. The client will review and respond shortly.',
            ),
            isPrimary: true,
            isElective: false,
            displayOrder: 0,
          } as any];
        } else if (
          !['approved_visit_scheduled', 'approved_no_visit', 'visited'].includes(latestStatus) ||
          rescheduleRequired
        ) {
          // Need to request
          const inspectionLabel = new Date(inspectionDate).toLocaleDateString('en-HK', {
            weekday: 'short', day: '2-digit', month: 'short',
          });
          availableConfigSteps = [{
            ...createSyntheticPrimaryStep(
              'REQUEST_SITE_ACCESS',
              `Book site inspection — ${inspectionLabel}`,
              true,
              role,
              effectiveStage,
              `The client has made the site available on ${inspectionLabel}. You can book a visit or choose to skip.`,
            ),
            isPrimary: true,
            displayOrder: 0,
          } as any];
        } else {
          // Approved but not addressVisible? fallback to quote
          availableConfigSteps = [quoteStep, declineStep];
        }
      }
      // No inspection date — straight to quote
      else {
        availableConfigSteps = [quoteStep, declineStep];
      }
      } // end accepted-pros flow
    }

    if (role === 'CLIENT') {
      let surveyBookingDescription: string | null = null;

      try {
        const surveyExtras = await this.prisma.$queryRaw<Array<{
          status: string;
          metadata: Record<string, unknown> | null;
          scheduledAt: Date | null;
          requestedAt: Date | null;
        }>>`
          SELECT
            status,
            metadata,
            "scheduledAt" as "scheduledAt",
            "requestedAt" as "requestedAt"
          FROM mimo_project_extras
          WHERE "projectId" = ${projectId}
            AND "extraType" = 'survey'
          ORDER BY "requestedAt" DESC
          LIMIT 1
        `;

        const surveyExtra = surveyExtras[0];
        if (surveyExtra) {
          const normalizedSurveyStatus = String(surveyExtra.status || '').toLowerCase();
          const blockedSurveyStatuses = new Set(['declined', 'cancelled', 'completed']);
          const isSurveyBookable = !blockedSurveyStatuses.has(normalizedSurveyStatus);
          const alreadyScheduled = Boolean(surveyExtra.scheduledAt) || normalizedSurveyStatus === 'scheduled';

          if (isSurveyBookable && !alreadyScheduled) {
            const requestedAtLabel = surveyExtra.requestedAt
              ? new Date(surveyExtra.requestedAt).toLocaleDateString('en-HK', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'recently';
            const existingRooms = Number((surveyExtra.metadata as any)?.rooms || 0);
            const roomHint = Number.isFinite(existingRooms) && existingRooms > 0
              ? ` Current room count: ${existingRooms}.`
              : '';

            surveyBookingDescription =
              `Mimo Surveying+ was requested ${requestedAtLabel}. Book your site survey by confirming room count and a preferred date.${roomHint}`;
          }
        }
      } catch {
        // Extras table may not be present in all environments.
      }

      let manageSiteRequestsDescription: string | null = null;

      const pendingClientAccessRequest = await this.prisma.siteAccessRequest.findFirst({
        where: {
          projectId,
          status: 'pending',
        },
        select: { id: true, requestedAt: true },
        orderBy: { requestedAt: 'asc' },
      });

      if (pendingClientAccessRequest) {
        const requestedAtLabel = new Date(
          pendingClientAccessRequest.requestedAt,
        ).toLocaleString('en-HK', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        manageSiteRequestsDescription =
          `A professional requested site access on ${requestedAtLabel}. Review and respond in the site-access tab.`;
      }

      const pendingClientVisitResponse = await this.prisma.siteAccessVisit.findFirst({
        where: {
          projectId,
          status: 'proposed',
          proposedByRole: 'professional',
        },
        select: { id: true, proposedAt: true },
        orderBy: { createdAt: 'asc' },
      });

      if (pendingClientVisitResponse) {
        const proposedAtLabel = new Date(
          pendingClientVisitResponse.proposedAt,
        ).toLocaleString('en-HK', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        if (!manageSiteRequestsDescription) {
          manageSiteRequestsDescription =
            `A professional proposed a site visit for ${proposedAtLabel}. Confirm or decline this request.`;
        }
      }

      // Show button when there are upcoming site inspections to manage (QR scan, etc.)
      if (!manageSiteRequestsDescription) {
        const upcomingInspection = await this.prisma.siteAccessRequest.findFirst({
          where: {
            projectId,
            status: 'approved_visit_scheduled',
          },
          select: { id: true, visitScheduledAt: true, professional: { select: { businessName: true, fullName: true } } },
          orderBy: { visitScheduledAt: 'asc' },
        });

        if (upcomingInspection) {
          const proName = upcomingInspection.professional?.businessName || upcomingInspection.professional?.fullName || 'A professional';
          const timeLabel = upcomingInspection.visitScheduledAt
            ? new Date(upcomingInspection.visitScheduledAt).toLocaleString('en-HK', {
                weekday: 'short', day: '2-digit', month: 'short',
                hour: '2-digit', minute: '2-digit', hour12: true,
              })
            : 'upcoming';
          manageSiteRequestsDescription =
            `${proName} is scheduled to visit on ${timeLabel}. Manage site inspections or scan their QR badge.`;
        }
      }

      if (manageSiteRequestsDescription) {
        availableConfigSteps = [
          createSyntheticPrimaryStep(
            'CONFIRM_SITE_VISIT',
            'Manage site requests',
            true,
            role,
            effectiveStage,
            manageSiteRequestsDescription,
          ),
          ...availableConfigSteps.filter((step) => step.actionKey !== 'CONFIRM_SITE_VISIT'),
        ];
      }

      if (surveyBookingDescription) {
        availableConfigSteps = [
          createSyntheticPrimaryStep(
            'BOOK_MIMO_SURVEY',
            'Book in your site survey',
            true,
            role,
            effectiveStage,
            surveyBookingDescription,
          ),
          ...availableConfigSteps.filter((step) => step.actionKey !== 'BOOK_MIMO_SURVEY'),
        ];
      }
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

        // If address is visible, add INSPECT_SITE as elective (only if pro hasn't already skipped)
        if (
          isProfessional?.addressVisible === true &&
          !isProfessional?.siteVisitedAt
        ) {
          const siteSkipped = await this.prisma.siteAccessRequest.findFirst({
            where: {
              projectProfessionalId: isProfessional.id,
              status: { in: ['skipped', 'approved_no_visit'] },
            },
            select: { id: true },
          });
          if (!siteSkipped) {
            const approvedAccess = await this.prisma.siteAccessRequest.findFirst({
              where: {
                projectProfessionalId: isProfessional.id,
                status: { in: ['approved_visit_scheduled', 'approved_no_visit'] },
              },
              select: { visitScheduledAt: true, visitScheduledFor: true },
              orderBy: { respondedAt: 'desc' },
            });
            const visitDateTime = approvedAccess?.visitScheduledAt || approvedAccess?.visitScheduledFor;
            const timeLabel = visitDateTime
              ? new Date(visitDateTime).toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: true })
              : null;
            const dateLabel = visitDateTime
              ? new Date(visitDateTime).toLocaleDateString('en-HK', { weekday: 'short', day: '2-digit', month: 'short' })
              : 'site';
            const inspectLabel = timeLabel
              ? `Visit site at ${timeLabel} on ${dateLabel}`
              : `Visit site on ${dateLabel}`;
            availableConfigSteps = [
              ...availableConfigSteps,
              {
                ...createSyntheticPrimaryStep(
                  'INSPECT_SITE',
                  inspectLabel,
                  false,
                  role,
                  effectiveStage,
                  'Address access granted. View details on the Site Access tab.',
                ),
                isPrimary: false,
                isElective: true,
                displayOrder: 2,
              } as any,
            ];
          } // closes if (!siteSkipped)
        }
      }

      if (role === 'CLIENT' && !clientSigned) {
        // Client hasn't signed yet — only the review/sign step is relevant.
        // Materials-claim and escrow steps must not appear before escrow is funded.
        const reviewStep =
          nextSteps.find((step) => step.actionKey === 'REVIEW_AGREEMENT') ||
          nextSteps.find((step) => step.actionKey === 'SIGN_CONTRACT') ||
          nextSteps.find((step) => step.actionKey === 'REVIEW_CONTRACT');
        availableConfigSteps = reviewStep
          ? [reviewStep]
          : [
              createSyntheticPrimaryStep(
                'REVIEW_AGREEMENT',
                'Review agreement',
                true,
                role,
                effectiveStage,
                'The professional has submitted a contract for your review. Sign to proceed to escrow funding.',
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
        // If site has already been started on-site, show a non-actionable status step
        if (project.siteStartedAt) {
          return returnWithCache({
            PRIMARY: [toApiAction(createSyntheticPrimaryStep(
              'SITE_STARTED',
              'Project started on site',
              false,
              role,
              effectiveStage,
              `On-site start confirmed on ${new Date(project.siteStartedAt).toLocaleDateString('en-HK')}.`,
            ))],
            ELECTIVE: [],
            status: project.status,
            stage: effectiveStage,
          });
        }

        const normalizedScale = String(project.projectScale || '').toUpperCase();
        const requiresClientScheduleAgreement = ['SCALE_2', 'SCALE_3'].includes(normalizedScale);
        const clientActorId = (project as any).clientId || project.userId;

        // Treat project.startDate being set as equivalent to an accepted proposal
        // (covers legacy projects that agreed the date before the proposal system existed)
        const startDateAgreed = Boolean(acceptedStartProposal) || Boolean(project.startDate);

        if (latestStartProposal && !startDateAgreed) {
          availableConfigSteps = [
            createSyntheticPrimaryStep(
              'CONFIRM_START_DATE',
              'Agree start date',
              latestStartProposal.proposedByRole === 'client',
              role,
              effectiveStage,
              latestStartProposal.proposedByRole === 'client'
                ? 'The client proposed an updated start date. Review it and confirm or counter.'
                : 'Start date proposal sent. Waiting for the client to confirm or update.',
            ),
          ];

          return returnWithCache({
            PRIMARY: availableConfigSteps.map(toApiAction),
            ELECTIVE: [],
            status: project.status,
            stage: effectiveStage,
          });
        }

        if (!startDateAgreed) {
          availableConfigSteps = [
            createSyntheticPrimaryStep(
              'CONFIRM_START_DATE',
              'Agree start date',
              true,
              role,
              effectiveStage,
              'Propose and agree the kickoff start date with the client before final schedule sign-off.',
            ),
          ];

          return returnWithCache({
            PRIMARY: availableConfigSteps.map(toApiAction),
            ELECTIVE: [],
            status: project.status,
            stage: effectiveStage,
          });
        }

        // Check if professional has already confirmed the schedule
        const scheduleActions = await this.prisma.nextStepAction.findMany({
          where: {
            projectId,
            actionKey: 'CONFIRM_SCHEDULE',
            projectStage: effectiveStage,
            ...actionActorWhere,
          },
          select: { userAction: true },
        });
        const scheduleConfirmed = scheduleActions.some((a) => a.userAction === 'COMPLETED');

        let clientScheduleConfirmed = false;
        if (requiresClientScheduleAgreement && clientActorId) {
          const clientScheduleAction = await this.prisma.nextStepAction.findFirst({
            where: {
              projectId,
              userId: clientActorId,
              actionKey: 'CONFIRM_SCHEDULE',
              userAction: 'COMPLETED',
              projectStage: effectiveStage,
            },
            select: { id: true },
          });
          clientScheduleConfirmed = Boolean(clientScheduleAction);
        }

        const escrowFunded = Number(project.escrowHeld ?? 0) > 0;

        let walletTransferPrerequisite: 'not_required' | 'pending' | 'completed' | 'skipped' = 'not_required';
        if (escrowFunded) {
          walletTransferPrerequisite = await this.getProfessionalWalletTransferPrerequisiteStatus(projectId, paymentPlan);
        }

        const canStartProject = escrowFunded && walletTransferPrerequisite !== 'pending';

        if (!scheduleConfirmed) {
          availableConfigSteps = [
            createSyntheticPrimaryStep(
              'CONFIRM_SCHEDULE',
              'Agree milestone schedule',
              true,
              role,
              effectiveStage,
              'Start date is agreed. Finalize and agree the detailed milestone schedule.',
            ),
          ];

          if (canStartProject && !requiresClientScheduleAgreement) {
            availableConfigSteps.push({
              ...createSyntheticPrimaryStep(
                'START_PROJECT',
                'Start work on site',
                true,
                role,
                effectiveStage,
                'Escrow prerequisites are ready. You may begin work on site while finalizing the detailed schedule.',
              ),
              isPrimary: false,
              isElective: true,
              displayOrder: 2,
            } as any);
          }
        } else if (requiresClientScheduleAgreement && !clientScheduleConfirmed) {
          availableConfigSteps = [
            createSyntheticPrimaryStep(
              'WAIT_FOR_CLIENT_FUNDS',
              'Wait for client schedule agreement',
              false,
              role,
              effectiveStage,
              'You shared the milestone schedule. Waiting for the client to review and confirm it before escrow funding can proceed.',
            ),
          ];
        } else {
          let hasPendingMaterialsClaim = false;
          let procurementApproved = false;
          let isSingleMilestoneMaterial = false;
          if (escrowFunded && ['SCALE_1', 'SCALE_2'].includes(normalizedScale)) {
            const allMilestones = paymentPlan?.milestones || [];
            isSingleMilestoneMaterial = allMilestones.length <= 1;
            const firstMilestoneId = allMilestones.find((m) => m.sequence === 1)?.id;
            if (firstMilestoneId) {
              const [pendingCount, approvedCount] = await this.prisma.$transaction([
                (this.prisma as any).milestoneProcurementEvidence.count({
                  where: {
                    projectId,
                    paymentMilestoneId: firstMilestoneId,
                    status: 'pending',
                  },
                }),
                this.prisma.financialTransaction.count({
                  where: {
                    projectId,
                    type: 'milestone_procurement_approved',
                    status: 'confirmed',
                    notes: { contains: firstMilestoneId },
                  },
                }),
              ]);
              hasPendingMaterialsClaim = pendingCount > 0;
              procurementApproved = approvedCount > 0;
            }
          }

          availableConfigSteps = [
            createSyntheticPrimaryStep(
              canStartProject
                ? 'START_PROJECT'
                : hasPendingMaterialsClaim
                  ? 'RESPOND_TO_MATERIALS_QUESTIONS'
                : escrowFunded
                  ? 'WAIT_FOR_MATERIALS_PROCESS'
                  : 'WAIT_FOR_CLIENT_FUNDS',
              canStartProject
                ? 'Start the project'
                : hasPendingMaterialsClaim
                  ? 'Respond to client questions on materials claim'
                : escrowFunded
                  ? 'Wait for milestone 1 materials process'
                  : 'Wait for client funds',
              canStartProject,
              role,
              effectiveStage,
              canStartProject
                ? 'Escrow is funded. You are ready to begin work on site.'
                : hasPendingMaterialsClaim
                  ? 'Your materials claim is under client review. Respond to any questions in the claim thread so authorization can proceed.'
                : escrowFunded
                  ? 'Escrow is funded. The client is completing the milestone 1 materials wallet process. Submit your materials purchase receipts once you have purchased the required materials, then the client will release the confirmed amount to your withdrawable wallet.'
                  : 'Schedule confirmed. Waiting for client to fund escrow before work can begin.',
            ),
          ];
          // If all prerequisites met (schedule confirmed + escrow funded + no pending claim):
          // Show both START_PROJECT and MAKE_MILESTONE_1_CLAIM as independent actions
          if (canStartProject && !hasPendingMaterialsClaim) {
            availableConfigSteps = [];

            // Primary action 1: Start the project on site
            availableConfigSteps.push(
              createSyntheticPrimaryStep(
                'START_PROJECT',
                'Start project on site',
                true,
                role,
                effectiveStage,
                'Escrow is funded and schedule confirmed. You may begin work on site and proceed with milestone 1.',
              ),
            );

            // Primary action 2: Make milestone 1 claim (if applicable, not skipped, and not yet approved)
            if (['SCALE_1', 'SCALE_2'].includes(normalizedScale) && walletTransferPrerequisite !== 'skipped' && !procurementApproved) {
              availableConfigSteps.push({
                id: 'synthetic-MAKE_MILESTONE_1_CLAIM',
                createdAt: new Date(),
                updatedAt: new Date(),
                role,
                projectStage: effectiveStage,
                actionKey: 'MAKE_MILESTONE_1_CLAIM',
                actionLabel: 'Submit materials claim',
                description: 'Submit purchase receipts and claimed amount for milestone 1 materials.',
                isPrimary: true,
                isElective: false,
                requiresAction: true,
                estimatedDurationMinutes: 10,
                displayOrder: 2,
              } as any);
            }
          } else if (hasPendingMaterialsClaim) {
            // If pending claim exists, show respond action (primary focus)
            availableConfigSteps = [
              createSyntheticPrimaryStep(
                'RESPOND_TO_MATERIALS_QUESTIONS',
                'Respond to client questions on materials claim',
                true,
                role,
                effectiveStage,
                'Your materials claim is under client review. Respond to any questions in the claim thread so authorization can proceed.',
              ),
            ];
          }
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

      // Use pre-fetched start proposals (already fetched at top of getNextSteps)

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

      // ── Schedule → escrow → materials: gated in order ──
      if (!pendingPaymentRequest && contractFullySigned && !latestStartProposal) {
        const normalizedScale = String(project.projectScale || '').toUpperCase();
        const requiresProfessionalScheduleFirst = ['SCALE_2', 'SCALE_3'].includes(normalizedScale);
        const startDateAgreed = Boolean(acceptedStartProposal) || Boolean(project.startDate);

        let clientScheduleConfirmed = true; // default: no schedule gate needed
        let professionalScheduleConfirmed = true;

        if (startDateAgreed) {
          // Check professional schedule confirmation (CLASS 2/3)
          if (requiresProfessionalScheduleFirst) {
            const profSched = await this.prisma.nextStepAction.findFirst({
              where: {
                projectId,
                professionalId: project.awardedProjectProfessionalId || undefined,
                actionKey: 'CONFIRM_SCHEDULE',
                userAction: 'COMPLETED',
                projectStage: effectiveStage,
              },
              select: { id: true },
            });
            professionalScheduleConfirmed = Boolean(profSched);
            if (!professionalScheduleConfirmed) {
              availableConfigSteps = [{
                actionKey: 'WAIT_FOR_CLIENT_FUNDS',
                actionLabel: 'Wait for professional schedule',
                description: 'The professional is preparing the milestone schedule. You can review details in the schedule tab while waiting for their confirmation.',
                isPrimary: true, isElective: false, requiresAction: false,
                estimatedDurationMinutes: 2, displayOrder: 1,
              } as any];
              return returnWithCache({
                PRIMARY: availableConfigSteps.map(toApiAction),
                ELECTIVE: [],
                status: project.status,
                stage: effectiveStage,
              });
            }
          }

          // Check client schedule confirmation (CLASS 1 & 2)
          if (['SCALE_1', 'SCALE_2'].includes(normalizedScale) && professionalScheduleConfirmed) {
            const clientSched = await this.prisma.nextStepAction.findFirst({
              where: {
                projectId,
                userId,
                actionKey: 'CONFIRM_SCHEDULE',
                userAction: 'COMPLETED',
              },
              select: { id: true },
            });
            clientScheduleConfirmed = Boolean(clientSched);
            if (!clientScheduleConfirmed) {
              availableConfigSteps = [{
                actionKey: 'CONFIRM_SCHEDULE',
                actionLabel: normalizedScale === 'SCALE_1'
                  ? 'Review project timeline end date'
                  : 'Agree milestone schedule',
                description: normalizedScale === 'SCALE_1'
                  ? 'Start date is agreed. Review the calculated project end date/time and confirm the timeline before funding escrow.'
                  : 'Start date is agreed. Please review and confirm the milestone schedule before funding escrow.',
                isPrimary: true, isElective: false, requiresAction: true,
                estimatedDurationMinutes: 8, displayOrder: 1,
              } as any];
              return returnWithCache({
                PRIMARY: availableConfigSteps.map(toApiAction),
                ELECTIVE: [],
                status: project.status,
                stage: effectiveStage,
              });
            }
          }
        }

        // ── Escrow deposit (only after client has confirmed schedule) ──
        const pendingEscrowRequest = clientScheduleConfirmed
          ? await this.prisma.financialTransaction.findFirst({
              where: {
                projectId,
                type: 'escrow_deposit_request',
                status: 'pending',
                actionComplete: false,
                OR: [{ actionBy: userId }, { actionBy: null }],
              },
              orderBy: { createdAt: 'desc' },
            })
          : null;

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

        // ── Materials workflow (only after client has confirmed schedule) ──
        const hasReleasePayment = await this.prisma.financialTransaction.findFirst({
          where: { projectId, type: 'release_payment', status: 'confirmed' },
          select: { id: true },
        });
        const escrowNowFunded = Number(project.escrowHeld ?? 0) > 0;
        const projectFullyPaid = Boolean(hasReleasePayment) && !escrowNowFunded;
        const isPreCompletion = effectiveStage !== ProjectStage.COMPLETE
          && effectiveStage !== ProjectStage.NEAR_COMPLETION
          && !projectFullyPaid;

        if (escrowNowFunded && !pendingEscrowRequest && isPreCompletion && clientScheduleConfirmed) {
          const projectScale = String(project.projectScale || '').toUpperCase();
          if (['SCALE_1', 'SCALE_2'].includes(projectScale)) {
            const allMilestones = paymentPlan?.milestones || [];
            const isSingleMilestone = allMilestones.length <= 1;
            const m1Id = allMilestones.find((m) => m.sequence === 1)?.id;
            if (m1Id) {
              const [capCount, pendingEvidenceCount, procurementApprovedCount, capReturnedCount] =
                await this.prisma.$transaction([
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
                  this.prisma.financialTransaction.count({
                    where: {
                      projectId,
                      type: 'milestone_procurement_approved',
                      status: 'confirmed',
                      notes: { contains: m1Id },
                    },
                  }),
                  this.prisma.financialTransaction.count({
                    where: {
                      projectId,
                      type: 'milestone_cap_remainder_return',
                      status: 'confirmed',
                      notes: { contains: m1Id },
                    },
                  }),
                ]);

              const materialsClaimDone = procurementApprovedCount > 0 || capReturnedCount > 0;

              if (capCount === 0 && !isSingleMilestone) {
                // Step A: client confirms the nominal wallet allocation (no proof needed).
                // Skip for single-milestone projects — funds stay in escrow.
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
              } else if (materialsClaimDone) {
                // Claim approved or cap returned — materials workflow complete. Only show start on site.
                availableConfigSteps = [
                  {
                    actionKey: 'START_PROJECT_ON_SITE',
                    actionLabel: 'Start project on site',
                    description:
                      'Materials claim is settled. You are ready to begin work on site with the professional.',
                    isPrimary: true,
                    isElective: false,
                    requiresAction: true,
                    estimatedDurationMinutes: 5,
                    displayOrder: 1,
                  } as any,
                ];
              } else if (pendingEvidenceCount > 0) {
                // Step B: professional has submitted receipts, client reviews — show both review and start on site.
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
                  {
                    actionKey: 'START_PROJECT_ON_SITE',
                    actionLabel: 'Start project on site',
                    description:
                      'You can also start work on site with the professional independently of the materials receipt review.',
                    isPrimary: true,
                    isElective: false,
                    requiresAction: true,
                    estimatedDurationMinutes: 5,
                    displayOrder: 2,
                  } as any,
                ];
              } else {
                // Wallet transferred but professional hasn't submitted claim yet.
                // Show START_PROJECT_ON_SITE so the on-site QR exchange can happen in parallel.
                availableConfigSteps = [
                  {
                    actionKey: 'START_PROJECT_ON_SITE',
                    actionLabel: 'Start project on site',
                    description:
                      "Funds are in the professional's project wallet. Start the project on site while waiting for them to submit their materials purchase receipts.",
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

      // Filter out START_PROJECT_ON_SITE if site has already been started (client scanned QR)
      if (project.siteStartedAt) {
        availableConfigSteps = availableConfigSteps.filter((s) => s.actionKey !== 'START_PROJECT_ON_SITE');
      }
    }

    // ── PRE_WORK stage: dynamic overrides (mirrors post-contract logic) ──────────────────────────
    // The DB seed always emits CONFIRM_START_DATE / CONFIRM_START_DETAILS for PRE_WORK, but by
    // the time we reach this stage both parties have signed and the start date may already be set.
    if (effectiveStage === ProjectStage.PRE_WORK && project.status === 'awarded') {
      const preWorkNormalizedScale = String(project.projectScale || '').toUpperCase();

      // Use pre-fetched start proposals (already fetched at top of getNextSteps)
      const preWorkStartDateAgreed = Boolean(acceptedStartProposal) || Boolean(project.startDate);

      if (role === 'PROFESSIONAL') {
        if (latestStartProposal && !preWorkStartDateAgreed) {
          // Still negotiating start date
          availableConfigSteps = [
            createSyntheticPrimaryStep(
              'CONFIRM_START_DATE',
              'Agree start date',
              latestStartProposal.proposedByRole === 'client',
              role,
              effectiveStage,
              latestStartProposal.proposedByRole === 'client'
                ? 'The client proposed an updated start date. Review it and confirm or counter.'
                : 'Start date proposal sent. Waiting for the client to confirm or update.',
            ),
          ];
        } else if (!preWorkStartDateAgreed) {
          availableConfigSteps = [
            createSyntheticPrimaryStep(
              'CONFIRM_START_DATE',
              'Agree start date',
              true,
              role,
              effectiveStage,
              'Propose and agree the kickoff start date with the client before final schedule sign-off.',
            ),
          ];
        } else {
          // Start date agreed — check schedule + escrow and show correct action(s)
          const requiresClientSched = ['SCALE_2', 'SCALE_3'].includes(preWorkNormalizedScale);
          const clientActorIdPreWork = (project as any).clientId || project.userId;

          const schedActionsPreWork = await this.prisma.nextStepAction.findMany({
            where: {
              projectId,
              actionKey: 'CONFIRM_SCHEDULE',
              projectStage: { in: [ProjectStage.CONTRACT_PHASE, ProjectStage.PRE_WORK] },
              ...actionActorWhere,
            },
            select: { userAction: true },
          });
          const schedConfirmedPreWork = schedActionsPreWork.some((a) => a.userAction === 'COMPLETED');

          let clientSchedConfirmedPreWork = false;
          if (requiresClientSched && clientActorIdPreWork) {
            const csa = await this.prisma.nextStepAction.findFirst({
              where: {
                projectId,
                userId: clientActorIdPreWork,
                actionKey: 'CONFIRM_SCHEDULE',
                userAction: 'COMPLETED',
                projectStage: { in: [ProjectStage.CONTRACT_PHASE, ProjectStage.PRE_WORK] },
              },
              select: { id: true },
            });
            clientSchedConfirmedPreWork = Boolean(csa);
          }

          const escrowPreWork = Number(project.escrowHeld ?? 0) > 0;
          let walletPreWork: 'not_required' | 'pending' | 'completed' | 'skipped' = 'not_required';
          if (escrowPreWork) walletPreWork = await this.getProfessionalWalletTransferPrerequisiteStatus(projectId, paymentPlan);
          const canStartPreWork = escrowPreWork && walletPreWork !== 'pending';

          if (!schedConfirmedPreWork) {
            availableConfigSteps = [
              createSyntheticPrimaryStep('CONFIRM_SCHEDULE', 'Agree milestone schedule', true, role, effectiveStage,
                'Start date is agreed. Finalize and agree the detailed milestone schedule.'),
            ];
            if (canStartPreWork && !requiresClientSched) {
              availableConfigSteps.push({ ...createSyntheticPrimaryStep('START_PROJECT', 'Start work on site', true, role, effectiveStage,
                'Escrow prerequisites are ready. You may begin work on site while finalizing the schedule.'),
                isPrimary: false, isElective: true, displayOrder: 2 } as any);
            }
          } else if (requiresClientSched && !clientSchedConfirmedPreWork) {
            availableConfigSteps = [
              createSyntheticPrimaryStep('WAIT_FOR_CLIENT_FUNDS', 'Wait for client schedule agreement', false, role, effectiveStage,
                'You shared the milestone schedule. Waiting for the client to review and confirm it.'),
            ];
          } else {
            // Schedule confirmed — check for pending materials claim and whether procurement is already approved
            let hasPendingClaimPreWork = false;
            let procurementApprovedPreWork = false;
            let isSingleMilestonePreWork = false;
            if (escrowPreWork && ['SCALE_1', 'SCALE_2'].includes(preWorkNormalizedScale)) {
              const allMilestonesPreWork = paymentPlan?.milestones || [];
              isSingleMilestonePreWork = allMilestonesPreWork.length <= 1;
              const m1 = allMilestonesPreWork.find((m) => m.sequence === 1)?.id;
              if (m1) {
                const [pendingCountPw, approvedCountPw] = await this.prisma.$transaction([
                  (this.prisma as any).milestoneProcurementEvidence.count({ where: { projectId, paymentMilestoneId: m1, status: 'pending' } }),
                  this.prisma.financialTransaction.count({
                    where: { projectId, type: 'milestone_procurement_approved', status: 'confirmed', notes: { contains: m1 } },
                  }),
                ]);
                hasPendingClaimPreWork = pendingCountPw > 0;
                procurementApprovedPreWork = approvedCountPw > 0;
              }
            }

            if (canStartPreWork && !hasPendingClaimPreWork) {
              availableConfigSteps = [
                createSyntheticPrimaryStep('START_PROJECT', 'Start project on site', true, role, effectiveStage,
                  'Escrow is funded and schedule confirmed. You may begin work on site.'),
              ];
              // Show MAKE_MILESTONE_1_CLAIM only if not skipped and procurement not yet approved
              if (['SCALE_1', 'SCALE_2'].includes(preWorkNormalizedScale) && walletPreWork !== 'skipped' && !procurementApprovedPreWork) {
                availableConfigSteps.push({
                  id: 'synthetic-MAKE_MILESTONE_1_CLAIM', createdAt: new Date(), updatedAt: new Date(), role,
                  projectStage: effectiveStage, actionKey: 'MAKE_MILESTONE_1_CLAIM',
                  actionLabel: 'Submit materials claim',
                  description: 'Submit purchase receipts and claimed amount for milestone 1 materials.',
                  isPrimary: true, isElective: false, requiresAction: true, estimatedDurationMinutes: 10, displayOrder: 2,
                } as any);
              }
            } else if (hasPendingClaimPreWork) {
              availableConfigSteps = [
                createSyntheticPrimaryStep('RESPOND_TO_MATERIALS_QUESTIONS', 'Respond to client questions on materials claim', true, role, effectiveStage,
                  'Your materials claim is under client review. Respond to any questions in the claim thread.'),
              ];
            } else {
              availableConfigSteps = [
                createSyntheticPrimaryStep(
                  escrowPreWork ? 'WAIT_FOR_MATERIALS_PROCESS' : 'WAIT_FOR_CLIENT_FUNDS',
                  escrowPreWork ? 'Wait for milestone 1 materials process' : 'Wait for client funds',
                  false, role, effectiveStage,
                  escrowPreWork
                    ? 'Escrow is funded. The client is completing the milestone 1 materials wallet process.'
                    : 'Schedule confirmed. Waiting for client to fund escrow before work can begin.',
                ),
              ];
            }
          }
        }
      }

      if (role === 'CLIENT') {
        if (!latestStartProposal && preWorkStartDateAgreed) {
          // Start date is agreed — don't show CONFIRM_START_DETAILS; show schedule review then escrow.
          const escrowClientPreWork = Number(project.escrowHeld ?? 0) > 0;
          if (!escrowClientPreWork) {
            // Still waiting for escrow — check schedule confirmation gates
            const requiresProfSchedFirst = ['SCALE_2', 'SCALE_3'].includes(preWorkNormalizedScale);
            let profSchedDone = true; // default: not required
            if (requiresProfSchedFirst) {
              const profAction = await this.prisma.nextStepAction.findFirst({
                where: {
                  projectId,
                  professionalId: project.awardedProjectProfessionalId || undefined,
                  actionKey: 'CONFIRM_SCHEDULE',
                  userAction: 'COMPLETED',
                  projectStage: { in: [ProjectStage.CONTRACT_PHASE, ProjectStage.PRE_WORK] },
                },
                select: { id: true },
              });
              profSchedDone = Boolean(profAction);
              if (!profSchedDone) {
                availableConfigSteps = [{
                  actionKey: 'WAIT_FOR_CLIENT_FUNDS', actionLabel: 'Wait for professional schedule',
                  description: 'The professional is preparing the milestone schedule. Review in the schedule tab while waiting.',
                  isPrimary: true, isElective: false, requiresAction: false, estimatedDurationMinutes: 2, displayOrder: 1,
                } as any];
              }
            }

            // For CLASS 1 (always) and CLASS 2 (only after pro has confirmed):
            // client must review and confirm the schedule before escrow.
            if (['SCALE_1', 'SCALE_2'].includes(preWorkNormalizedScale) && profSchedDone) {
              const clientSchedConfirmed = await this.prisma.nextStepAction.findFirst({
                where: {
                  projectId,
                  userId,
                  actionKey: 'CONFIRM_SCHEDULE',
                  userAction: 'COMPLETED',
                },
                select: { id: true },
              });
              if (!clientSchedConfirmed) {
                availableConfigSteps = [{
                  actionKey: 'CONFIRM_SCHEDULE',
                  actionLabel: preWorkNormalizedScale === 'SCALE_1'
                    ? 'Review project timeline end date'
                    : 'Agree milestone schedule',
                  description: preWorkNormalizedScale === 'SCALE_1'
                    ? 'Start date is agreed. Review the calculated project end date/time and confirm the timeline before funding escrow.'
                    : 'Start date is agreed. Please review and confirm the milestone schedule before funding escrow.',
                  isPrimary: true, isElective: false, requiresAction: true,
                  estimatedDurationMinutes: 5, displayOrder: 1,
                } as any];
                return returnWithCache({
                  PRIMARY: availableConfigSteps.map(toApiAction),
                  ELECTIVE: [],
                  status: project.status,
                  stage: effectiveStage,
                });
              }
            }
          } else {
            // Escrow funded — show passive wait or materials actions (handled by existing CLIENT block below)
            // Just clear any CONFIRM_START_DETAILS that seeded config might set
            availableConfigSteps = availableConfigSteps.filter((s) => s.actionKey !== 'CONFIRM_START_DETAILS');
          }
        }
        // If latestStartProposal and !preWorkStartDateAgreed → keep seed CONFIRM_START_DETAILS (fall through)
      }
    }
    // ────────────────────────────────────────────────────────────────────────────────────────────

    // Synthetic UX survey step — shown alongside "In warranty period" for completed projects
    if (role === 'CLIENT' && effectiveStage === ProjectStage.COMPLETE) {
      availableConfigSteps.push({
        ...createSyntheticPrimaryStep(
          'UX_SURVEY',
          'Share your feedback',
          true,
          role,
          effectiveStage,
          'Help us improve MIMO — take a quick 2-minute survey about your renovation experience.',
        ),
        isPrimary: false,
        isElective: true,
        displayOrder: 2,
      } as any);
    }

    if (role === 'CLIENT' && effectiveStage === ProjectStage.MILESTONE_PENDING) {
      const hasApproveMilestone = availableConfigSteps.some(
        (step) => step.actionKey === 'APPROVE_MILESTONE',
      );
      const hasReviewProgress = availableConfigSteps.some(
        (step) => step.actionKey === 'REVIEW_PROGRESS',
      );

      if (hasApproveMilestone && !hasReviewProgress) {
        availableConfigSteps.push({
          ...createSyntheticPrimaryStep(
            'REVIEW_PROGRESS',
            'Review work progress',
            true,
            role,
            effectiveStage,
            'Review the latest updates and progress evidence before approving the milestone.',
          ),
          displayOrder: 2,
        } as any);
      }
    }

    // Check if any of these actions have already been completed
    const userActions = await this.prisma.nextStepAction.findMany({
      where: {
        projectId,
        projectStage: effectiveStage,
        ...actionActorWhere,
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

    // Diagnostic: log action keys when multiple primary quote-related actions appear
    const quoteKeys = primary.filter(a => a.actionLabel?.toLowerCase().includes('quote') || a.actionLabel?.toLowerCase().includes('review'));
    if (quoteKeys.length > 1) {
      console.warn(`[NextStepService] Multiple quote PRIMARY actions for ${role}/${projectId}: ${JSON.stringify(quoteKeys.map(a => ({ key: a.actionKey, label: a.actionLabel })))}`);
    }
    const electiveQuoteKeys = elective.filter(a => a.actionLabel?.toLowerCase().includes('quote') || a.actionLabel?.toLowerCase().includes('review'));
    if (electiveQuoteKeys.length > 0) {
      console.warn(`[NextStepService] Quote ELECTIVE actions for ${role}/${projectId}: ${JSON.stringify(electiveQuoteKeys.map(a => ({ key: a.actionKey, label: a.actionLabel })))}`);
    }

    // Keep SITE_STARTED as a fallback status for client only when there are no active actions.
    // Never show for completed/near-complete projects — they have their own next steps.
    const isCompletedStage = effectiveStage === ProjectStage.COMPLETE || effectiveStage === ProjectStage.NEAR_COMPLETION;
    if (role === 'CLIENT' && project.siteStartedAt && primary.length === 0 && elective.length === 0 && !isCompletedStage) {
      primary.push(
        toApiAction(
          createSyntheticPrimaryStep(
            'SITE_STARTED',
            'Project started on site',
            false,
            role,
            effectiveStage,
            `On-site start confirmed on ${new Date(project.siteStartedAt).toLocaleDateString('en-HK')}. Work is in progress and no action is required right now.`,
          ),
        ),
      );
    }

    const result: NextStepResult = {
      PRIMARY: primary,
      ELECTIVE: elective,
      status: project.status,
      stage: effectiveStage,
    };
    saveCache(result);
    return result;
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
    role?: string,
  ) {
    const normalizedRole = (role || '').toUpperCase();

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
        ...(normalizedRole === 'PROFESSIONAL'
          ? { professionalId: userId }
          : { userId }),
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
  async getUserActionHistory(projectId: string, userId: string, role?: string) {
    const normalizedRole = (role || '').toUpperCase();
    return this.prisma.nextStepAction.findMany({
      where: {
        projectId,
        ...(normalizedRole === 'PROFESSIONAL'
          ? { professionalId: userId }
          : { userId }),
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

  // ── NextStep Cache ──────────────────────────────────────────
  /** Invalidate the cached next-step state for a project (call after any mutation) */
  async invalidateNextStepCache(projectId: string): Promise<void> {
    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { nextStepCache: null as any },
      });
    } catch {
      // Non-critical — cache will self-correct on next read
    }
  }

  /** Rebuild cache for all projects (admin backfill) */
  async backfillNextStepCache(): Promise<{ processed: number; errors: number }> {
    const projects = await this.prisma.project.findMany({ select: { id: true } });
    let processed = 0;
    let errors = 0;

    for (const p of projects) {
      try {
        // Simply invalidate — cache rebuilds on next real read
        await this.prisma.project.update({
          where: { id: p.id },
          data: { nextStepCache: null as any },
        });
        processed++;
      } catch {
        errors++;
      }
    }
    return { processed, errors };
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
