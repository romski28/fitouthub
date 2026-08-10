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
    // Check for approved access first
    const approvedAccess = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId,
        status: { in: ['approved_visit_scheduled', 'approved_no_visit'] },
      },
      select: { visitScheduledAt: true, visitScheduledFor: true },
      orderBy: { respondedAt: 'desc' },
    });

    if (approvedAccess) {
      const visitDateTime = approvedAccess.visitScheduledAt || approvedAccess.visitScheduledFor;
      const timeLabel = visitDateTime
        ? new Date(visitDateTime).toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Hong_Kong' })
        : null;
      const dateLabel = visitDateTime
        ? new Date(visitDateTime).toLocaleDateString('en-HK', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Hong_Kong' })
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

    // Check for pending access request — pro has booked, awaiting client approval
    const pendingAccess = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId,
        status: 'pending',
      },
      select: { visitScheduledAt: true, visitScheduledFor: true, requestedAt: true },
      orderBy: { requestedAt: 'desc' },
    });

    if (pendingAccess) {
      const visitDateTime = pendingAccess.visitScheduledAt || pendingAccess.visitScheduledFor;
      const timeLabel = visitDateTime
        ? new Date(visitDateTime).toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Hong_Kong' })
        : null;
      const dateLabel = visitDateTime
        ? new Date(visitDateTime).toLocaleDateString('en-HK', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Hong_Kong' })
        : null;
      const label = timeLabel && dateLabel
        ? `Inspection booked — ${timeLabel} on ${dateLabel}. Awaiting client approval`
        : 'Inspection booked — awaiting client approval';
      return createSyntheticPrimaryStep(
        'AWAIT_SITE_ACCESS_APPROVAL',
        label,
        false,
        'PROFESSIONAL',
        ProjectStage.BIDDING_ACTIVE,
        'Your site inspection request has been submitted. The client will review and respond shortly.',
      );
    }

    return null;
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
          stageStartedAt: true,
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
    // Use stageStartedAt as the invalidation gate — only stage transitions bump it.
    // Non-stage mutations (contract signing, schedule confirm, etc.) explicitly null
    // the cache via invalidateNextStepCache(), so they also trigger a recompute.
    const CACHE_VERSION = 7; // bump to invalidate all caches
    const cache = project.nextStepCache as Record<string, any> | null;
    const cacheKey = `${userId}:${role}:${effectiveStage}`;
    const invalidationThreshold = project.stageStartedAt ?? project.updatedAt;
    if (
      cache?.[cacheKey]?.computedAt &&
      invalidationThreshold &&
      (cache[cacheKey] as any)?.version === CACHE_VERSION &&
      new Date(cache[cacheKey].computedAt) > new Date(invalidationThreshold)
    ) {
      return cache[cacheKey].result as NextStepResult;
    }

    // Helper to save cache for this user+role
    const saveCache = (result: NextStepResult) => {
      void this.prisma.project.update({
        where: { id: projectId },
        data: {
          nextStepCache: {
            ...(project.nextStepCache as any || {}),
            [cacheKey]: { result, version: CACHE_VERSION, computedAt: new Date().toISOString() },
          },
        } as any,
      }).catch(() => {});
    };
    const returnWithCache = (r: NextStepResult): NextStepResult => { saveCache(r); return r; };

    // ── Pre-fetch payment plan once (used in multiple branches, only needed from CONTRACT_PHASE onward) ──
    const needsPaymentPlan = effectiveStage !== ProjectStage.CREATED
      && effectiveStage !== ProjectStage.BIDDING_ACTIVE
      && effectiveStage !== ProjectStage.SITE_VISIT_SCHEDULED
      && effectiveStage !== ProjectStage.SITE_VISIT_COMPLETE
      && effectiveStage !== ProjectStage.QUOTE_RECEIVED
      && effectiveStage !== ProjectStage.BIDDING_CLOSED;
    const paymentPlan = needsPaymentPlan
      ? await this.prisma.projectPaymentPlan.findUnique({
          where: { projectId },
          select: {
            id: true,
            projectScale: true,
            milestones: {
              select: { id: true, sequence: true, title: true, status: true },
              orderBy: { sequence: 'asc' },
            },
          },
        }).catch(() => null)
      : null;

    // ── Pre-fetch start proposals once (used in CONTRACT_PHASE + PRE_WORK) ──
    const needsStartProposals = needsPaymentPlan;
    const [acceptedStartProposal, latestStartProposal] = needsStartProposals
      ? await Promise.all([
          this.prisma.projectStartProposal.findFirst({
            where: { projectId, status: 'accepted' },
            orderBy: { createdAt: 'desc' },
          }).catch(() => null),
          this.prisma.projectStartProposal.findFirst({
            where: { projectId, status: 'proposed' },
            orderBy: { createdAt: 'desc' },
          }).catch(() => null),
        ])
      : [null, null];

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
      const inspectionDateObj = inspectionDate ? new Date(inspectionDate) : null;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const inspectionDayStart = inspectionDateObj ? new Date(inspectionDateObj) : null;
      if (inspectionDayStart) inspectionDayStart.setHours(0, 0, 0, 0);

      if (
        inspectionDayStart &&
        !isProfessional.siteVisitedAt &&
        inspectionDayStart.getTime() < todayStart.getTime()
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
            timeZone: 'Asia/Hong_Kong',
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

    if (role === 'CLIENT' && project.status !== 'awarded') {
      // ── Dynamic quote count for review label ──
      const quotedCount = await this.prisma.projectProfessional.count({
        where: {
          projectId,
          status: { in: ['quoted', 'counter_requested', 'awarded'] },
        },
      });

      // Update REVIEW_INCOMING_QUOTES label based on how many quotes received
      const reviewStep = availableConfigSteps.find((s) => (s as any).actionKey === 'REVIEW_INCOMING_QUOTES');
      if (reviewStep) {
        (reviewStep as any).actionLabel = quotedCount > 0
          ? `${quotedCount} quote${quotedCount === 1 ? '' : 's'} received`
          : 'Awaiting quotes';
        (reviewStep as any).description = quotedCount > 0
          ? 'Compare submitted pricing and notes.'
          : 'No quotes received yet. Professionals are preparing their bids.';
        (reviewStep as any).requiresAction = quotedCount > 0;
      }

      // ── Surface manage site requests when pros have booked inspections ──
      const pendingSiteCount = await this.prisma.siteAccessRequest.count({
        where: { projectId, status: 'pending' },
      });
      const proposedVisitCount = await this.prisma.siteAccessVisit.count({
        where: { projectId, status: 'proposed', proposedByRole: 'professional' },
      });

      if (pendingSiteCount > 0 || proposedVisitCount > 0) {
        availableConfigSteps = [
          createSyntheticPrimaryStep(
            'CONFIRM_SITE_VISIT',
            pendingSiteCount > 0
              ? `Manage site requests (${pendingSiteCount})`
              : 'Manage site requests',
            true,
            role,
            effectiveStage,
            pendingSiteCount > 0
              ? `${pendingSiteCount} professional${pendingSiteCount === 1 ? ' has' : 's have'} requested a site inspection. Review and respond.`
              : 'A professional proposed a site visit. Confirm or decline.',
          ),
          ...availableConfigSteps.filter((step) => step.actionKey !== 'CONFIRM_SITE_VISIT'),
        ];
      }

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

      // Show button when there are upcoming confirmed inspections (QR scan, etc.)
      // Pending requests and proposed visits are handled above.
      if (pendingSiteCount === 0 && proposedVisitCount === 0) {
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
                timeZone: 'Asia/Hong_Kong',
              })
            : 'upcoming';
          availableConfigSteps = [
            createSyntheticPrimaryStep(
              'CONFIRM_SITE_VISIT',
              'Manage site requests',
              true,
              role,
              effectiveStage,
              `${proName} is scheduled to visit on ${timeLabel}. Manage site inspections or scan their QR badge.`,
            ),
            ...availableConfigSteps.filter((step) => step.actionKey !== 'CONFIRM_SITE_VISIT'),
          ];
        }
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


    // CONTRACT_PHASE removed - projects now go straight to PRE_WORK on quote acceptance.
    // Legacy projects in CONTRACT_PHASE are handled by PRE_WORK block below.
    // Original code preserved in git history (backup/pre-contract-removal-2026-08-03).

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
          const isScale1PreWork = preWorkNormalizedScale === 'SCALE_1';
          const clientActorIdPreWork = (project as any).clientId || project.userId;

          // SCALE_1: no schedule to agree
          let schedConfirmedPreWork = false;
          let clientSchedConfirmedPreWork = false;

          if (isScale1PreWork) {
            schedConfirmedPreWork = true;
            clientSchedConfirmedPreWork = true;
          } else {
          // Fetch pro + client schedule confirmations in parallel
          const [schedActionsPreWork, clientSchedPreWork] = await Promise.all([
            this.prisma.nextStepAction.findMany({
              where: {
                projectId,
                actionKey: 'CONFIRM_SCHEDULE',
                projectStage: { in: [ProjectStage.CONTRACT_PHASE, ProjectStage.PRE_WORK] },
                ...actionActorWhere,
              },
              select: { userAction: true },
            }),
            requiresClientSched && clientActorIdPreWork
              ? this.prisma.nextStepAction.findFirst({
                  where: {
                    projectId,
                    userId: clientActorIdPreWork,
                    actionKey: 'CONFIRM_SCHEDULE',
                    userAction: 'COMPLETED',
                    projectStage: { in: [ProjectStage.CONTRACT_PHASE, ProjectStage.PRE_WORK] },
                  },
                  select: { id: true },
                })
              : Promise.resolve(null),
          ]);
          schedConfirmedPreWork = schedActionsPreWork.some((a) => a.userAction === 'COMPLETED');

          clientSchedConfirmedPreWork = false;
          if (requiresClientSched && clientActorIdPreWork) {
            clientSchedConfirmedPreWork = Boolean(clientSchedPreWork);
          }
          } // end else (!isScale1PreWork)

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
                const [pendingCountPw, approvedCountPw] = await Promise.all([
                  (this.prisma as any).milestoneProcurementEvidence.count({ where: { projectId, paymentMilestoneId: m1, status: { in: ['pending', 'under_review', 'submitted'] } } }),
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
                  isPrimary: false, isElective: true, requiresAction: true, estimatedDurationMinutes: 10, displayOrder: 2,
                } as any);
              }
            } else if (hasPendingClaimPreWork) {
              availableConfigSteps = [
                createSyntheticPrimaryStep('WAIT_FOR_CLIENT_REVIEW', 'Materials claim submitted', false, role, effectiveStage,
                  'Your materials claim is under client review. The client will authorize the wallet transfer shortly. You can start work on site in the meantime.'),
              ];
              if (canStartPreWork) {
                availableConfigSteps.push({ ...createSyntheticPrimaryStep('START_PROJECT', 'Start work on site', true, role, effectiveStage,
                  'Escrow prerequisites are ready. You may begin work on site while the materials claim is reviewed.'),
                  isPrimary: true, isElective: false, displayOrder: 1 } as any);
              }
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

            // SCALE_2: client must review and confirm the schedule before escrow.
            // SCALE_1 skips this — no multi-milestone schedule to agree.
            if (['SCALE_2'].includes(preWorkNormalizedScale) && profSchedDone) {
              const clientSchedConfirmed = await this.prisma.nextStepAction.findFirst({
                where: { projectId, userId, actionKey: 'CONFIRM_SCHEDULE', userAction: 'COMPLETED' },
                select: { id: true },
              });
              if (!clientSchedConfirmed) {
                availableConfigSteps = [{
                  actionKey: 'CONFIRM_SCHEDULE', actionLabel: 'Agree milestone schedule',
                  description: 'Start date is agreed. Please review and confirm the milestone schedule before funding escrow.',
                  isPrimary: true, isElective: false, requiresAction: true,
                  estimatedDurationMinutes: 5, displayOrder: 1,
                } as any];
                return returnWithCache({
                  PRIMARY: availableConfigSteps.map(toApiAction), ELECTIVE: [],
                  status: project.status, stage: effectiveStage,
                });
              }
            }

            // SCALE_1 or schedule confirmed → show escrow deposit
            availableConfigSteps = [{
              actionKey: 'DEPOSIT_ESCROW_FUNDS', actionLabel: 'Deposit funds to escrow',
              description: 'Start date is agreed. Deposit the project funds to escrow so work can begin.',
              isPrimary: true, isElective: false, requiresAction: true,
              estimatedDurationMinutes: 5, displayOrder: 1,
              modalTitle: 'Deposit funds to escrow',
              modalBody: 'Deposit the project amount to escrow. Funds are held securely and released according to the payment schedule as milestones are completed.',
              modalDetailsBody: 'Escrow protects both you and the professional — funds release only when you approve each milestone.',
              modalSuccessTitle: 'Escrow funded',
              modalSuccessBody: '{amount} has been deposited to escrow.',
              modalSuccessNextStepBody: 'The professional can now begin work on site.',
              modalPrimaryButtonLabel: 'Deposit now',
              modalSecondaryButtonLabel: 'Review details',
              modalPrimaryActionType: 'confirm_transfer',
              modalSecondaryActionType: 'close_modal',
            } as any];
            return returnWithCache({
              PRIMARY: availableConfigSteps.map(toApiAction), ELECTIVE: [],
              status: project.status, stage: effectiveStage,
            });
          } else {
            // Escrow funded — client is ready for site start.
            // Check if the pro has submitted a materials claim first.
            const escrowClientPreWork = Number(project.escrowHeld ?? 0) > 0;
            let hasClaimForClient = false;
            if (escrowClientPreWork && ['SCALE_1', 'SCALE_2'].includes(preWorkNormalizedScale)) {
              const m1 = paymentPlan?.milestones?.find((m: any) => m.sequence === 1)?.id;
              if (m1) {
                const pendingCount = await (this.prisma as any).milestoneProcurementEvidence.count({
                  where: { projectId, paymentMilestoneId: m1, status: { in: ['pending', 'under_review', 'submitted'] } },
                });
                hasClaimForClient = pendingCount > 0;
              }
            }
            availableConfigSteps = availableConfigSteps.filter(
              (s) => !['CONFIRM_START_DETAILS', 'DEPOSIT_ESCROW_FUNDS'].includes(s.actionKey),
            );
            if (hasClaimForClient) {
              availableConfigSteps = [{
                actionKey: 'REVIEW_MATERIALS_PURCHASE', actionLabel: 'Review materials claim',
                description: 'The professional submitted a materials purchase claim. Review and authorize the wallet transfer.',
                isPrimary: true, isElective: false, requiresAction: true,
                estimatedDurationMinutes: 10, displayOrder: 1,
              } as any];
            } else if (availableConfigSteps.length === 0) {
              availableConfigSteps = [{
                actionKey: 'START_PROJECT_ON_SITE', actionLabel: 'Start project on site',
                description: 'Escrow is funded. Be on site when the professional arrives to confirm the start.',
                isPrimary: true, isElective: false, requiresAction: true,
                estimatedDurationMinutes: 5, displayOrder: 1,
              } as any];
            }
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
