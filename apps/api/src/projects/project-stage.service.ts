import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ProjectStage } from '@prisma/client';
import { AdminActionService } from './admin-action.service';

export interface StageTransitionResult {
  projectId: string;
  previousStage: ProjectStage;
  newStage: ProjectStage;
  transitionedAt: Date;
  adminActionsCreated?: number;
  message?: string;
}

@Injectable()
export class ProjectStageService {
  constructor(
    private prisma: PrismaService,
    private adminActionService: AdminActionService,
  ) {}

  /**
   * Transition project to a new stage
   * Handles:
   * - Updating project stage
   * - Creating relevant admin actions
   * - Recording stage transition history
   */
  async transitionStage(
    projectId: string,
    newStage: ProjectStage,
  ): Promise<StageTransitionResult> {
    // Get current project state
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        currentStage: true,
        status: true,
        budget: true,
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const previousStage = project.currentStage;

    // Validate stage transition is logical
    this.validateStageTransition(previousStage, newStage);

    // Update project stage
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        currentStage: newStage,
        stageStartedAt: new Date(),
        lastStageTransitionAt: new Date(),
      },
    });

    // Create admin actions for this stage (if applicable)
    const adminActions = await this.adminActionService.createActionsForStageTransition(
      projectId,
      newStage,
    );

    // TODO: Emit event for notifications, analytics, etc.
    // eventEmitter.emit('project.stageChanged', { projectId, previousStage, newStage })

    return {
      projectId,
      previousStage,
      newStage,
      transitionedAt: updated.lastStageTransitionAt || new Date(),
      adminActionsCreated: adminActions.length,
      message: `Project transitioned from ${previousStage} to ${newStage}`,
    };
  }

  /**
   * Validate that a stage transition makes sense
   * Allow most transitions; block illogical ones (e.g., CLOSED → CREATED)
   */
  private validateStageTransition(from: ProjectStage, to: ProjectStage) {
    // Exceptional states can be entered from anywhere
    if (to === ProjectStage.PAUSED || to === ProjectStage.DISPUTED) {
      return true;
    }

    // From exceptional states
    if (from === ProjectStage.PAUSED) {
      // Can resume to any earlier stage (handled by business logic)
      return true;
    }

    if (from === ProjectStage.DISPUTED) {
      // Can resume after resolution
      return true;
    }

    // CLOSED is terminal - no transitions out
    if (
      from === ProjectStage.CLOSED ||
      (from === ProjectStage.WARRANTY_PERIOD && to !== ProjectStage.CLOSED)
    ) {
      // Only allow WARRANTY_PERIOD -> CLOSED
      if (from === ProjectStage.WARRANTY_PERIOD && to === ProjectStage.CLOSED) {
        return true;
      }
      throw new Error(
        `Cannot transition from ${from} to ${to} - terminal stage`,
      );
    }

    // Multi-milestone support: allow PAYMENT_RELEASED -> WORK_IN_PROGRESS (next milestone)
    if (
      from === ProjectStage.PAYMENT_RELEASED &&
      to === ProjectStage.WORK_IN_PROGRESS
    ) {
      return true;
    }

    // General validation: forward progress only (with exceptions above)
    const stageOrder: ProjectStage[] = [
      ProjectStage.CREATED,
      ProjectStage.BIDDING_ACTIVE,
      ProjectStage.SITE_VISIT_SCHEDULED,
      ProjectStage.SITE_VISIT_COMPLETE,
      ProjectStage.QUOTE_RECEIVED,
      ProjectStage.BIDDING_CLOSED,
      ProjectStage.CONTRACT_PHASE,
      ProjectStage.PRE_WORK,
      ProjectStage.WORK_IN_PROGRESS,
      ProjectStage.MILESTONE_PENDING,
      ProjectStage.PAYMENT_RELEASED,
      ProjectStage.NEAR_COMPLETION,
      ProjectStage.FINAL_INSPECTION,
      ProjectStage.COMPLETE,
      ProjectStage.WARRANTY_PERIOD,
      ProjectStage.CLOSED,
    ];

    const fromIndex = stageOrder.indexOf(from);
    const toIndex = stageOrder.indexOf(to);

    if (fromIndex === -1 || toIndex === -1) {
      throw new Error(`Invalid stage(s): ${from} -> ${to}`);
    }

    if (toIndex <= fromIndex) {
      throw new Error(
        `Cannot move backward in stage flow: ${from} -> ${to}. Use PAUSED state to hold project.`,
      );
    }

    return true;
  }

  /**
   * Get project's stage history
   */
  async getProjectStageHistory(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        currentStage: true,
        stageStartedAt: true,
        lastStageTransitionAt: true,
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Calculate time in current stage
    const now = new Date();
    const timeInStage = project.lastStageTransitionAt
      ? Math.round(
          (now.getTime() - project.lastStageTransitionAt.getTime()) /
            (1000 * 60 * 60),
        ) // hours
      : 0;

    return {
      currentStage: project.currentStage,
      stageStartedAt: project.stageStartedAt,
      lastTransition: project.lastStageTransitionAt,
      hoursInCurrentStage: timeInStage,
    };
  }

  /**
   * Get average duration in each stage (for analytics)
   */
  async getAverageStageDurations() {
    const projects = await this.prisma.project.findMany({
      select: {
        currentStage: true,
        stageStartedAt: true,
        lastStageTransitionAt: true,
        createdAt: true,
      },
    });

    const stageDurations: Record<string, number[]> = {};

    for (const project of projects) {
      if (project.lastStageTransitionAt && project.stageStartedAt) {
        const stage = project.currentStage;
        const duration =
          project.lastStageTransitionAt.getTime() -
          project.stageStartedAt.getTime();

        if (!stageDurations[stage]) {
          stageDurations[stage] = [];
        }
        stageDurations[stage].push(duration);
      }
    }

    const averages: Record<string, { avgHours: number; count: number }> = {};

    for (const [stage, durations] of Object.entries(stageDurations)) {
      const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
      averages[stage] = {
        avgHours: Math.round(avgMs / (1000 * 60 * 60)),
        count: durations.length,
      };
    }

    return averages;
  }

  /**
   * Pause a project (move to PAUSED stage)
   */
  async pauseProject(projectId: string, reason?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { currentStage: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Store previous stage for resume
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        currentStage: ProjectStage.PAUSED,
        lastStageTransitionAt: new Date(),
      },
    });
  }

  /**
   * Resume a project from PAUSED (restore to previous stage)
   * Note: This should ideally store which stage it was paused from
   */
  async resumeProject(projectId: string, resumeToStage: ProjectStage) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { currentStage: true },
    });

    if (!project || project.currentStage !== ProjectStage.PAUSED) {
      throw new Error('Project is not paused');
    }

    return this.transitionStage(projectId, resumeToStage);
  }

  /**
   * Flag project as disputed (move to DISPUTED stage)
   */
  async disputeProject(projectId: string, reason?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { currentStage: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        currentStage: ProjectStage.DISPUTED,
        lastStageTransitionAt: new Date(),
      },
    });

    // Create admin action to resolve dispute
    await this.adminActionService.createAdminAction({
      projectId,
      actionType: 'RESOLVE_DISPUTE' as any,
      reason: reason || 'Dispute flagged by user',
      priority: 'HIGH',
    });

    return updated;
  }
}
