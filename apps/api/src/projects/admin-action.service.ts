import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AdminActionType, ProjectStage } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

export interface CreateAdminActionDto {
  projectId: string;
  actionType: AdminActionType;
  reason?: string;
  triggerCondition?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requiredByDate?: Date;
  assignedToAdminId?: string;
}

export interface UpdateAdminActionDto {
  status?: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  assignedToAdminId?: string;
  approvalDetails?: Record<string, any>;
  notes?: string;
}

@Injectable()
export class AdminActionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create an admin action (typically triggered by system at stage transition)
   */
  async createAdminAction(dto: CreateAdminActionDto) {
    const adminAction = await this.prisma.adminAction.create({
      data: {
        id: createId(),
        projectId: dto.projectId,
        actionType: dto.actionType,
        reason: dto.reason,
        triggerCondition: dto.triggerCondition,
        priority: dto.priority || 'NORMAL',
        requiredByDate: dto.requiredByDate,
        assignedToAdminId: dto.assignedToAdminId,
        status: 'PENDING',
      },
      include: {
        project: {
          select: {
            projectName: true,
            clientName: true,
            budget: true,
            currentStage: true,
          },
        },
      },
    });

    return adminAction;
  }

  /**
   * Get pending admin actions (with optional filtering)
   */
  async getPendingActions(
    status?: string,
    priority?: string,
    assignedToAdminId?: string,
  ) {
    return this.prisma.adminAction.findMany({
      where: {
        status: status || 'PENDING',
        priority: priority ? priority : undefined,
        assignedToAdminId: assignedToAdminId ? assignedToAdminId : undefined,
      },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            clientName: true,
            budget: true,
            currentStage: true,
            escrowHeld: true,
          },
        },
        assignedToAdmin: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { requiredByDate: 'asc' }],
    });
  }

  /**
   * Get all admin actions for a specific project
   */
  async getProjectAdminActions(projectId: string) {
    return this.prisma.adminAction.findMany({
      where: { projectId },
      include: {
        assignedToAdmin: {
          select: { id: true, firstName: true, surname: true },
        },
        completedByAdmin: {
          select: { id: true, firstName: true, surname: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Assign admin action to a user
   */
  async assignAction(actionId: string, adminUserId: string) {
    return this.prisma.adminAction.update({
      where: { id: actionId },
      data: {
        assignedToAdminId: adminUserId,
        status: 'IN_REVIEW',
      },
      include: {
        assignedToAdmin: {
          select: { firstName: true, surname: true, email: true },
        },
      },
    });
  }

  /**
   * Complete/resolve an admin action
   */
  async completeAction(
    actionId: string,
    completedByAdminId: string,
    dto: UpdateAdminActionDto,
  ) {
    const adminAction = await this.prisma.adminAction.update({
      where: { id: actionId },
      data: {
        status: dto.status || 'APPROVED',
        priority: dto.priority,
        notes: dto.notes,
        approvalDetails: dto.approvalDetails || {},
        completedAt: new Date(),
        completedByAdminId,
      },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            userId: true,
            awardedProjectProfessionalId: true,
          },
        },
      },
    });

    // TODO: Emit event/notification based on action type and status
    // e.g., if APPROVE_PAYMENT_RELEASE is approved, trigger payment
    // if RESOLVE_DISPUTE is approved, update project status

    return adminAction;
  }

  /**
   * Get action types available at a specific project stage
   */
  async getTemplateForStage(projectStage: ProjectStage) {
    return this.prisma.adminNextStepTemplate.findMany({
      where: { projectStage },
      orderBy: [{ isPriority: 'desc' }, { displayOrder: 'asc' }],
    });
  }

  /**
   * Auto-create admin actions when project transitions to a new stage
   */
  async createActionsForStageTransition(
    projectId: string,
    newStage: ProjectStage,
  ) {
    // Get templates for this stage
    const templates = await this.prisma.adminNextStepTemplate.findMany({
      where: { projectStage: newStage },
    });

    const createdActions: any[] = [];

    for (const template of templates) {
      // Check if action already exists
      const existing = await this.prisma.adminAction.findFirst({
        where: {
          projectId,
          actionType: template.actionType,
          status: { not: 'REJECTED' },
        },
      });

      if (!existing) {
        const action = await this.createAdminAction({
          projectId,
          actionType: template.actionType,
          reason: template.description,
          triggerCondition: template.triggerCondition || undefined,
          priority: template.isPriority ? 'HIGH' : 'NORMAL',
        });
        createdActions.push(action);
      }
    }

    return createdActions;
  }

  /**
   * Get statistics on admin action handling
   */
  async getAdminStats() {
    const [pending, approved, rejected, avgResolutionTime] = await Promise.all(
      [
        this.prisma.adminAction.count({ where: { status: 'PENDING' } }),
        this.prisma.adminAction.count({ where: { status: 'APPROVED' } }),
        this.prisma.adminAction.count({ where: { status: 'REJECTED' } }),
        this.getAverageResolutionTime(),
      ],
    );

    return {
      pending,
      approved,
      rejected,
      avgResolutionTimeHours: avgResolutionTime,
      total: pending + approved + rejected,
    };
  }

  private async getAverageResolutionTime(): Promise<number> {
    const completed = await this.prisma.adminAction.findMany({
      where: {
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    });

    if (completed.length === 0) return 0;

    const totalTime = completed.reduce((sum, action) => {
      const diff =
        action.completedAt!.getTime() - action.createdAt.getTime();
      return sum + diff;
    }, 0);

    const avgMs = totalTime / completed.length;
    return Math.round(avgMs / (1000 * 60 * 60)); // Convert to hours
  }

  /**
   * Bulk populate AdminNextStepTemplate with seed data
   */
  async initializeDefaultTemplates() {
    const existing = await this.prisma.adminNextStepTemplate.count();
    if (existing > 0) return;
    // Will be populated by separate seed function
    return { message: 'AdminNextStepTemplate ready for seeding' };
  }
}
