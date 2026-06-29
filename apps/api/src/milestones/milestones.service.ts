import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMilestoneDto, UpdateMilestoneDto, CreateMultipleMilestonesDto, MilestoneResponseDto } from './dtos';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notifications/notification.service';
import { ActivityLogService } from '../activity-log.service';
import { extractObjectKeyFromValue, buildPublicAssetUrl } from '../storage/media-assets.util';

@Injectable()
export class MilestonesService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationService: NotificationService,
    private activityLogService: ActivityLogService,
  ) {}

  private resolveMilestonePhotoUrls<T extends { photoUrls?: string[] | null }>(milestone: T): T {
    if (!milestone) return milestone;
    return {
      ...milestone,
      photoUrls: (milestone.photoUrls || []).map((value) => buildPublicAssetUrl(value)),
    };
  }

  async getMilestonesByProject(projectId: string) {
    const milestones = await this.prisma.projectMilestone.findMany({
      where: { projectId },
      orderBy: { sequence: 'asc' },
    });
    return milestones.map((m) => this.resolveMilestonePhotoUrls(m));
  }

  async getMilestonesByProjectProfessional(projectProfessionalId: string) {
    const milestones = await this.prisma.projectMilestone.findMany({
      where: { projectProfessionalId },
      orderBy: { sequence: 'asc' },
    });
    return milestones.map((m) => this.resolveMilestonePhotoUrls(m));
  }

  async getMilestoneById(id: string) {
    const milestone = await this.prisma.projectMilestone.findUnique({
      where: { id },
    });
    return milestone ? this.resolveMilestonePhotoUrls(milestone) : milestone;
  }

  async createMilestone(data: CreateMilestoneDto) {
    try {
      console.log(`[MilestonesService] Creating milestone:`, {
        projectId: data.projectId,
        title: data.title,
        sequence: data.sequence,
      });

      // Validate sequence is provided and unique per project
      if (!data.sequence && data.sequence !== 0) {
        throw new Error('Sequence number is required');
      }

      const result = await this.prisma.projectMilestone.create({
        data: {
          projectId: data.projectId,
          projectProfessionalId: data.projectProfessionalId,
          templateId: data.templateId,
          title: data.title,
          sequence: data.sequence,
          isFinancial: data.isFinancial ?? false,
          status: data.status || 'not_started',
          percentComplete: data.percentComplete || 0,
          plannedStartDate: data.plannedStartDate,
          plannedEndDate: data.plannedEndDate,
          startTimeSlot: data.startTimeSlot,
          endTimeSlot: data.endTimeSlot,
          estimatedHours: data.estimatedHours,
          siteAccessRequired: data.siteAccessRequired ?? true,
          siteAccessNotes: data.siteAccessNotes,
          description: data.description,
        },
      });

      await this.activityLogService.record({
        actorType: 'system',
        actorName: 'System',
        action: 'milestone_created',
        resource: 'ProjectMilestone',
        resourceId: result.id,
        projectId: data.projectId,
        details: `Milestone created: ${data.title}`,
        metadata: {
          sequence: data.sequence,
          projectProfessionalId: data.projectProfessionalId ?? null,
        },
        status: 'info',
      }).catch((activityError) => {
        console.warn('[MilestonesService] Failed to write milestone create activity log:', (activityError as Error)?.message);
      });

      console.log(`[MilestonesService] Milestone created with ID: ${result.id}`);
      return result;
    } catch (error) {
      console.error(`[MilestonesService] Error creating milestone:`, error);
      throw error;
    }
  }

  async createMultipleMilestones(data: CreateMultipleMilestonesDto) {
    console.log(`[MilestonesService] Batch save started: projectProfessionalId=${data.projectProfessionalId}, milestones=${data.milestones.length}`);
    
    // First delete any existing milestones for this professional on this project
    // Use projectProfessionalId if provided, otherwise fall back to projectId
    const whereClause = data.projectProfessionalId
      ? { projectProfessionalId: data.projectProfessionalId }
      : { projectId: data.projectId };
    
    const deleteResult = await this.prisma.projectMilestone.deleteMany({
      where: {
        ...whereClause,
        isFinancial: false,
      },
    });
    console.log(`[MilestonesService] Deleted ${deleteResult.count} existing milestones`);

    // Create new milestones
    const created = await Promise.all(
      data.milestones.map((m) =>
        this.prisma.projectMilestone.create({
          data: {
            projectId: data.projectId,
            projectProfessionalId: m.projectProfessionalId || data.projectProfessionalId,
            templateId: m.templateId,
            title: m.title,
            sequence: m.sequence,
            isFinancial: m.isFinancial ?? false,
            status: m.status || 'not_started',
            percentComplete: m.percentComplete || 0,
            plannedStartDate: m.plannedStartDate,
            plannedEndDate: m.plannedEndDate,
            startTimeSlot: m.startTimeSlot,
            endTimeSlot: m.endTimeSlot,
            estimatedHours: m.estimatedHours,
            siteAccessRequired: m.siteAccessRequired ?? true,
            siteAccessNotes: m.siteAccessNotes,
            description: m.description,
          },
        }),
      ),
    );

    await this.activityLogService.record({
      actorType: 'system',
      actorName: 'System',
      action: 'milestones_replaced',
      resource: 'Project',
      resourceId: data.projectId,
      projectId: data.projectId,
      details: `Milestone set replaced with ${created.length} milestones`,
      metadata: {
        deletedCount: deleteResult.count,
        createdCount: created.length,
        projectProfessionalId: data.projectProfessionalId ?? null,
      },
      status: 'info',
    }).catch((activityError) => {
      console.warn('[MilestonesService] Failed to write milestone batch activity log:', (activityError as Error)?.message);
    });

    console.log(`[MilestonesService] Created ${created.length} new milestones`);
    return created;
  }

  async updateMilestone(id: string, data: UpdateMilestoneDto) {
    try {
      console.log(`[MilestonesService] Updating milestone ${id}:`, JSON.stringify(data, null, 2));
      const existingMilestone = await this.prisma.projectMilestone.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              user: true,
            },
          },
          projectProfessional: {
            include: {
              professional: true,
            },
          },
        },
      });

      if (!existingMilestone) {
        throw new NotFoundException('Milestone not found');
      }

      const touchesAccessWindow =
        data.plannedStartDate !== undefined ||
        data.plannedEndDate !== undefined ||
        data.startTimeSlot !== undefined ||
        data.endTimeSlot !== undefined ||
        data.siteAccessRequired !== undefined ||
        data.siteAccessNotes !== undefined;

      const result = await this.prisma.projectMilestone.update({
        where: { id },
        data: {
          ...data,
          ...(touchesAccessWindow
            ? {
                accessDeclined: false,
                accessDeclinedReason: null,
                accessDeclinedAt: null,
                accessDeclinedByClientId: null,
              }
            : {}),
          updatedAt: new Date(),
        },
      });

      if (data.plannedEndDate !== undefined) {
        await this.prisma.paymentMilestone.updateMany({
          where: { projectMilestoneId: id },
          data: {
            plannedDueAt: data.plannedEndDate || null,
          },
        });
      }

      await this.activityLogService.record({
        actorType: 'system',
        actorName: 'System',
        action: 'milestone_updated',
        resource: 'ProjectMilestone',
        resourceId: id,
        projectId: existingMilestone.projectId,
        projectTitle: existingMilestone.project?.projectName,
        details: `Milestone updated: ${existingMilestone.title}`,
        metadata: {
          status: result.status,
          percentComplete: result.percentComplete,
          projectProfessionalId: existingMilestone.projectProfessionalId ?? null,
        },
        status: 'info',
      }).catch((activityError) => {
        console.warn('[MilestonesService] Failed to write milestone update activity log:', (activityError as Error)?.message);
      });

      const becameCompleted =
        existingMilestone.status !== 'completed' && result.status === 'completed';

      if (becameCompleted) {
        const projectName = existingMilestone.project?.projectName || 'Project';

        try {
          const professional = existingMilestone.projectProfessional?.professional;
          if (professional?.id && professional?.phone) {
            await this.notificationService.send({
              professionalId: professional.id,
              phoneNumber: professional.phone,
              eventType: 'milestone_completed',
              message: `Milestone "${result.title}" for "${projectName}" is marked completed.`,
            });
          }
        } catch (notificationError) {
          console.warn(
            '[MilestonesService] Failed to send milestone_completed notification to professional:',
            notificationError,
          );
        }

        try {
          const clientUser = existingMilestone.project?.user;
          if (existingMilestone.project?.userId && clientUser?.mobile) {
            await this.notificationService.send({
              userId: existingMilestone.project.userId,
              phoneNumber: clientUser.mobile,
              eventType: 'milestone_completed',
              message: `Milestone "${result.title}" for "${projectName}" has been completed.`,
            });
          }
        } catch (notificationError) {
          console.warn(
            '[MilestonesService] Failed to send milestone_completed notification to client:',
            notificationError,
          );
        }
      }

      console.log(`[MilestonesService] Milestone ${id} updated successfully`);
      return result;
    } catch (error) {
      console.error(`[MilestonesService] Error updating milestone ${id}:`, error);
      throw error;
    }
  }

  async declineMilestoneAccess(milestoneId: string, clientUserId: string, reason: string) {
    const milestone = await this.prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        project: true,
        projectProfessional: {
          include: {
            professional: true,
          },
        },
      },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    if (!milestone.projectProfessionalId) {
      throw new BadRequestException('Milestone is not linked to a professional project assignment');
    }

    const isOwner =
      (milestone.project.userId && milestone.project.userId === clientUserId) ||
      (milestone.project.clientId && milestone.project.clientId === clientUserId) ||
      (!milestone.project.userId && !milestone.project.clientId);

    if (!isOwner) {
      throw new BadRequestException('You do not have access to this milestone');
    }

    if (milestone.project.status !== 'awarded') {
      throw new BadRequestException('Access date declines are only available after project award');
    }

    if (!milestone.siteAccessRequired) {
      throw new BadRequestException('This task does not currently require site access');
    }

    const declined = await this.prisma.projectMilestone.update({
      where: { id: milestoneId },
      data: {
        accessDeclined: true,
        accessDeclinedReason: reason,
        accessDeclinedAt: new Date(),
        accessDeclinedByClientId: clientUserId,
        updatedAt: new Date(),
      },
    });

    const formatDate = (value?: Date | null) => {
      if (!value) return 'unspecified date';
      return value.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    };

    const dateRangeText = milestone.plannedEndDate && milestone.plannedStartDate
      ? `${formatDate(milestone.plannedStartDate)} to ${formatDate(milestone.plannedEndDate)}`
      : formatDate(milestone.plannedStartDate || milestone.plannedEndDate || null);

    await this.prisma.message.create({
      data: {
        projectProfessionalId: milestone.projectProfessionalId,
        senderType: 'client',
        senderClientId: clientUserId,
        content: `⚠️ Access declined for "${milestone.title}" on ${dateRangeText}. Reason: ${reason}. Please propose a new date/time.`,
      },
    });

    try {
      const professionalEmail = milestone.projectProfessional?.professional?.email;
      const professionalName =
        milestone.projectProfessional?.professional?.fullName ||
        milestone.projectProfessional?.professional?.businessName ||
        'Professional';

      if (professionalEmail) {
        await this.emailService.sendMilestoneAccessDeclinedNotification({
          to: professionalEmail,
          professionalName,
          projectName: milestone.project.projectName,
          milestoneTitle: milestone.title,
          declinedDateRange: dateRangeText,
          reason,
          projectProfessionalId: milestone.projectProfessionalId,
          baseUrl:
            process.env.WEB_BASE_URL ||
            process.env.FRONTEND_BASE_URL ||
            process.env.APP_WEB_URL ||
            'https://fitouthub-web.vercel.app',
        });
      }
    } catch (emailError) {
      console.warn('[MilestonesService] Failed to send milestone access decline email:', emailError);
    }

    await this.activityLogService.record({
      userId: clientUserId,
      actorType: 'client',
      actorName: 'Client',
      action: 'milestone_access_declined',
      resource: 'ProjectMilestone',
      resourceId: milestoneId,
      projectId: milestone.projectId,
      projectTitle: milestone.project.projectName,
      details: `Client declined access for milestone "${milestone.title}"`,
      metadata: {
        reason,
        projectProfessionalId: milestone.projectProfessionalId,
      },
      status: 'warning',
    }).catch((error) => {
      console.warn('[MilestonesService] Failed to write milestone access decline activity log:', (error as Error)?.message);
    });

    return {
      success: true,
      milestone: declined,
      message: 'Access decline recorded and professional notified',
    };
  }

  async submitMilestoneCompletionFeedback(
    milestoneId: string,
    clientUserId: string,
    action: 'agreed' | 'questioned',
    reason?: string,
  ) {
    const milestone = await this.prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        project: true,
        projectProfessional: {
          include: {
            professional: true,
          },
        },
      },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    if (!milestone.projectProfessionalId) {
      throw new BadRequestException('Milestone is not linked to a professional project assignment');
    }

    const isOwner =
      (milestone.project.userId && milestone.project.userId === clientUserId) ||
      (milestone.project.clientId && milestone.project.clientId === clientUserId) ||
      (!milestone.project.userId && !milestone.project.clientId);

    if (!isOwner) {
      throw new BadRequestException('You do not have access to this milestone');
    }

    if (milestone.percentComplete < 100) {
      throw new BadRequestException('Feedback is only available when milestone completion is 100%');
    }

    const messageContent =
      action === 'agreed'
        ? `Client agreed milestone completion: "${milestone.title}".`
        : `Question on completion of ${milestone.title}${reason ? `: ${reason}` : '.'}`;

    await this.prisma.message.create({
      data: {
        projectProfessionalId: milestone.projectProfessionalId,
        senderType: 'client',
        senderClientId: clientUserId,
        content: messageContent,
      },
    });

    try {
      const professional = milestone.projectProfessional?.professional;
      if (professional?.id && professional?.phone) {
        await this.notificationService.send({
          professionalId: professional.id,
          phoneNumber: professional.phone,
          eventType:
            action === 'agreed'
              ? 'milestone_completion_confirmed'
              : 'milestone_completion_questioned',
          message:
            action === 'agreed'
              ? `Client agreed completion for milestone "${milestone.title}".`
              : `Client raised a completion query for milestone "${milestone.title}"${reason ? `: ${reason}` : ''}.`,
        });
      }
    } catch (notificationError) {
      console.warn(
        '[MilestonesService] Failed to send milestone completion feedback notification:',
        notificationError,
      );
    }

    await this.activityLogService.record({
      userId: clientUserId,
      actorType: 'client',
      actorName: 'Client',
      action: action === 'agreed' ? 'milestone_completion_agreed' : 'milestone_completion_questioned',
      resource: 'ProjectMilestone',
      resourceId: milestoneId,
      projectId: milestone.projectId,
      projectTitle: milestone.project.projectName,
      details: messageContent,
      metadata: {
        reason: reason ?? null,
        projectProfessionalId: milestone.projectProfessionalId,
      },
      status: action === 'agreed' ? 'success' : 'warning',
    }).catch((error) => {
      console.warn('[MilestonesService] Failed to write milestone completion feedback activity log:', (error as Error)?.message);
    });

    return {
      success: true,
      action,
      message: messageContent,
    };
  }

  async deleteMilestone(id: string) {
    return this.prisma.projectMilestone.delete({
      where: { id },
    });
  }

  async addPhotoToMilestone(id: string, photoUrls: string[]) {
    const milestone = await this.prisma.projectMilestone.findUnique({
      where: { id },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    const normalizedPhotoUrls = (photoUrls || [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0);

    const updated = await this.prisma.projectMilestone.update({
      where: { id },
      data: {
        photoUrls: [...(milestone.photoUrls || []), ...normalizedPhotoUrls],
      },
    });

    return this.resolveMilestonePhotoUrls(updated);
  }

  async removePhotoFromMilestone(id: string, photoUrl: string) {
    const milestone = await this.prisma.projectMilestone.findUnique({
      where: { id },
    });

    if (!milestone) {
      throw new NotFoundException(`Milestone with ID ${id} not found`);
    }

    const normalizedInput = String(photoUrl || '').trim();
    const normalizedInputKey = extractObjectKeyFromValue(normalizedInput);

    const updated = await this.prisma.projectMilestone.update({
      where: { id },
      data: {
        photoUrls: (milestone.photoUrls || []).filter((storedValue) => {
          const stored = String(storedValue || '').trim();
          if (!stored) return false;
          if (stored === normalizedInput) return false;
          if (extractObjectKeyFromValue(stored) === normalizedInputKey) return false;
          return true;
        }),
      },
    });

    return this.resolveMilestonePhotoUrls(updated);
  }

  async getTemplatesByTrade(tradeId: string) {
    const templates = await this.prisma.milestoneTemplate.findMany({
      where: { tradeId },
      orderBy: { sequence: 'asc' },
    });
    return templates;
  }

  async getAllTemplates() {
    return this.prisma.milestoneTemplate.findMany({
      orderBy: [{ tradeId: 'asc' }, { sequence: 'asc' }],
      include: {
        trade: {
          select: {
            id: true,
            title: true,
            category: true,
          },
        },
      },
    });
  }

  async getProfessionalCalendar(professionalId: string) {
    // Get all project-professional relationships for this professional
    const projectProfessionals = await this.prisma.projectProfessional.findMany({
      where: {
        professionalId,
        status: { in: ['accepted', 'awarded'] }, // Only active/awarded projects
      },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
            clientName: true,
            status: true,
            region: true,
          },
        },
      },
    });

    // Get all milestones for these project-professional relationships
    const ppIds = projectProfessionals.map((pp) => pp.id);
    
    const milestones = await this.prisma.projectMilestone.findMany({
      where: {
        projectProfessionalId: { in: ppIds },
        plannedStartDate: { not: null }, // Only milestones with dates set
      },
      orderBy: { plannedStartDate: 'asc' },
      include: {
        projectProfessional: {
          include: {
            project: {
              select: {
                id: true,
                projectName: true,
                clientName: true,
                status: true,
                region: true,
              },
            },
          },
        },
      },
    });

    return milestones;
  }

  async resetProjectMilestonesToDefault(projectProfessionalId: string, professionalId: string) {
    const assignment = await this.prisma.projectProfessional.findUnique({
      where: { id: projectProfessionalId },
      select: {
        id: true,
        status: true,
        professionalId: true,
        quoteEstimatedStartAt: true,
        quoteEstimatedDurationMinutes: true,
        quoteEstimatedDurationUnit: true,
        project: {
          include: {
            paymentPlan: {
              include: {
                milestones: {
                  orderBy: { sequence: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Project assignment not found');
    }

    if (assignment.professionalId !== professionalId) {
      throw new BadRequestException('You do not have access to reset milestones for this project');
    }

    if (assignment.status !== 'awarded') {
      throw new BadRequestException('Milestone reset is only available for awarded projects');
    }

    const scale =
      assignment.project?.paymentPlan?.projectScale ||
      assignment.project?.projectScale ||
      'SCALE_1';

    const paymentPlanMilestones = assignment.project?.paymentPlan?.milestones || [];
    const hasFinancialActionsStarted = paymentPlanMilestones.some(
      (milestone: any) => milestone.status !== 'scheduled',
    );

    if (hasFinancialActionsStarted) {
      throw new BadRequestException(
        'Cannot reset milestones after financial actions have started on this payment plan',
      );
    }

    const defaultTitles =
      scale === 'SCALE_1'
        ? ['Site Preparation', 'Final Handover']
        : scale === 'SCALE_2'
          ? ['Site Preparation', 'Milestone 1', 'Final Handover']
          : ['Site Preparation', 'Milestone 1', 'Milestone 2', 'Milestone 3', 'Final Handover'];

    const startAt = assignment.quoteEstimatedStartAt
      ? new Date(assignment.quoteEstimatedStartAt)
      : null;
    const durationMinutes = Math.max(0, Number(assignment.quoteEstimatedDurationMinutes) || 0);
    const isDaysDuration = assignment.quoteEstimatedDurationUnit === 'days';
    const segmentMinutes = durationMinutes > 0 ? Math.floor(durationMinutes / defaultTitles.length) : 0;

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.projectMilestone.deleteMany({
        where: {
          projectProfessionalId,
          isFinancial: false,
        },
      });

      const existingFinancial = await tx.projectMilestone.findMany({
        where: {
          projectId: assignment.projectId,
          projectProfessionalId,
          isFinancial: true,
        },
        orderBy: { sequence: 'asc' },
      });

      const existingBySequence = new Map(existingFinancial.map((row: any) => [row.sequence, row]));

      if (existingFinancial.length > defaultTitles.length) {
        const extraIds = existingFinancial
          .filter((row: any) => row.sequence > defaultTitles.length)
          .map((row: any) => row.id);

        if (extraIds.length > 0) {
          await tx.projectMilestone.deleteMany({
            where: {
              id: { in: extraIds },
            },
          });
        }
      }

      const synced = await Promise.all(
        defaultTitles.map((title, index) => {
          let plannedStartDate: Date | null = null;
          let plannedEndDate: Date | null = null;

          if (startAt && durationMinutes > 0) {
            const startOffset = segmentMinutes * index;
            const endOffset =
              index === defaultTitles.length - 1
                ? durationMinutes
                : segmentMinutes * (index + 1);
            plannedStartDate = new Date(startAt.getTime() + startOffset * 60 * 1000);
            const rawEnd = new Date(startAt.getTime() + endOffset * 60 * 1000);
            // When duration is in days, finish at 18:00 on the last day
            if (isDaysDuration && index === defaultTitles.length - 1) {
              rawEnd.setHours(18, 0, 0, 0);
            }
            plannedEndDate = rawEnd;
          }

          const existing = existingBySequence.get(index + 1);

          if (existing) {
            return tx.projectMilestone.update({
              where: { id: existing.id },
              data: {
                title,
                sequence: index + 1,
                isFinancial: true,
                status: existing.status || 'not_started',
                plannedStartDate,
                plannedEndDate,
                siteAccessRequired: false,
              },
            });
          }

          return tx.projectMilestone.create({
            data: {
              projectId: assignment.projectId,
              projectProfessionalId,
              title,
              sequence: index + 1,
              isFinancial: true,
              status: 'not_started',
              percentComplete: 0,
              plannedStartDate,
              plannedEndDate,
              siteAccessRequired: false,
            },
          });
        }),
      );

      const syncedBySequence = new Map(synced.map((row: any) => [row.sequence, row]));

      if (assignment.project?.paymentPlan?.id) {
        const relinkUpdates = paymentPlanMilestones.map((milestone: any) => {
          const linkedScheduleMilestone = syncedBySequence.get(milestone.sequence);
          if (!linkedScheduleMilestone) {
            return null;
          }

          return tx.paymentMilestone.update({
            where: { id: milestone.id },
            data: {
              projectMilestoneId: linkedScheduleMilestone.id,
              plannedDueAt:
                linkedScheduleMilestone.plannedEndDate ||
                linkedScheduleMilestone.plannedStartDate ||
                milestone.plannedDueAt ||
                null,
            },
          });
        });

        await Promise.all(relinkUpdates.filter(Boolean));
      }

      await this.activityLogService.record({
        actorType: 'system',
        actorName: 'System',
        action: 'milestones_reset_to_default',
        resource: 'ProjectProfessional',
        resourceId: projectProfessionalId,
        projectId: assignment.projectId,
        projectTitle: assignment.project?.projectName,
        details: 'Project milestones reset to default schedule',
        metadata: {
          deletedCount: deleted.count,
          createdCount: synced.length,
          professionalId,
        },
        status: 'warning',
        tx,
      }).catch((activityError) => {
        console.warn('[MilestonesService] Failed to write milestone reset activity log:', (activityError as Error)?.message);
      });

      return {
        success: true,
        scale,
        deletedCount: deleted.count,
        createdCount: synced.length,
        milestones: synced,
      };
    });
  }

  /**
   * Check if a proposed date/time-slot range conflicts with any existing
   * milestone for the same professional across ALL projects.
   *
   * Returns an array of conflicting milestones (if any) so the caller
   * can surface a non-blocking warning.
   */
  async checkMilestoneConflicts(params: {
    professionalId: string;
    plannedStartDate: string; // ISO date or datetime
    plannedEndDate?: string;  // ISO date or datetime
    startTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
    endTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
    excludeMilestoneId?: string; // ignore the milestone being edited
  }) {
    const {
      professionalId,
      plannedStartDate,
      plannedEndDate,
      startTimeSlot,
      endTimeSlot,
      excludeMilestoneId,
    } = params;

    // Normalize to date-only strings for range comparison
    const newStart = plannedStartDate.split('T')[0];
    const newEnd = (plannedEndDate || plannedStartDate).split('T')[0];

    // Find all project-professional assignments for this professional
    const assignments = await this.prisma.projectProfessional.findMany({
      where: {
        professionalId,
        status: { in: ['accepted', 'awarded'] },
      },
      select: { id: true },
    });

    const ppIds = assignments.map((a) => a.id);
    if (ppIds.length === 0) return [];

    // Query milestones that overlap in date range AND are not completed
    const candidates = await this.prisma.projectMilestone.findMany({
      where: {
        projectProfessionalId: { in: ppIds },
        status: { not: 'completed' },
        AND: [
          { plannedStartDate: { not: null } },
          // Overlap: existing.startDate <= newEnd AND existing.endDate >= newStart
          { plannedStartDate: { lte: new Date(`${newEnd}T23:59:59Z`) } },
          {
            OR: [
              { plannedEndDate: null },
              { plannedEndDate: { gte: new Date(`${newStart}T00:00:00Z`) } },
            ],
          },
        ],
        ...(excludeMilestoneId ? { id: { not: excludeMilestoneId } } : {}),
      },
      include: {
        projectProfessional: {
          include: {
            project: {
              select: {
                id: true,
                projectName: true,
                clientName: true,
              },
            },
          },
        },
      },
      orderBy: { plannedStartDate: 'asc' },
    });

    // Further filter by time-slot overlap
    const conflicts = candidates.filter((m) => {
      // If either the candidate or the new milestone has no time slot
      // (ALL_DAY or unspecified), treat as overlapping
      const mSlot = m.startTimeSlot || 'ALL_DAY';
      const mEndSlot = m.endTimeSlot || m.startTimeSlot || 'ALL_DAY';
      const nSlot = startTimeSlot || 'ALL_DAY';
      const nEndSlot = endTimeSlot || startTimeSlot || 'ALL_DAY';

      // ALL_DAY overlaps with everything
      if (mSlot === 'ALL_DAY' || mEndSlot === 'ALL_DAY' || nSlot === 'ALL_DAY' || nEndSlot === 'ALL_DAY') {
        return true;
      }

      // Both have specific AM/PM — check for overlap
      // AM=1, PM=2 — overlap if ranges intersect
      const slotOrder = { AM: 1, PM: 2 };
      const mStart = slotOrder[mSlot as keyof typeof slotOrder] || 1;
      const mEnd = slotOrder[mEndSlot as keyof typeof slotOrder] || 2;
      const nStart = slotOrder[nSlot as keyof typeof slotOrder] || 1;
      const nEnd = slotOrder[nEndSlot as keyof typeof slotOrder] || 2;

      return mStart <= nEnd && nStart <= mEnd;
    });

    return conflicts.map((m) => ({
      id: m.id,
      title: m.title,
      plannedStartDate: m.plannedStartDate?.toISOString() ?? null,
      plannedEndDate: m.plannedEndDate?.toISOString() ?? null,
      startTimeSlot: m.startTimeSlot,
      endTimeSlot: m.endTimeSlot,
      status: m.status,
      projectId: m.projectProfessional?.project?.id ?? '',
      projectName: m.projectProfessional?.project?.projectName ?? 'Unknown project',
      clientName: m.projectProfessional?.project?.clientName ?? '',
    }));
  }

  /**
   * Check if a proposed date / time-slot fits within the professional's
   * availability windows and doesn't exceed their maxProjects cap.
   *
   * Returns { available, warnings[], suggestions[] } so the UI can show
   * an info banner.
   */
  async checkAvailability(params: {
    professionalId: string;
    date: string;             // ISO date "2026-06-15"
    startTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
    endTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
  }) {
    const { professionalId, date, startTimeSlot, endTimeSlot } = params;
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay(); // 0=Sun..6=Sat

    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 1. Fetch availability windows
    const windows = await this.prisma.professionalAvailability.findMany({
      where: {
        professionalId,
        OR: [
          { dayOfWeek },                         // recurring for this weekday
          { date: new Date(date) },              // date-specific override
        ],
      },
    });

    // Date-specific windows take priority over dayOfWeek ones
    const dateSpecific = windows.filter((w) => w.date);
    const relevantWindows = dateSpecific.length > 0
      ? dateSpecific
      : windows.filter((w) => w.dayOfWeek !== null);

    if (relevantWindows.length === 0) {
      // No availability window at all for this day
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      warnings.push(`You don't have availability set for ${DAY_NAMES[dayOfWeek]}.`);

      // Find the next available day
      const allWindows = await this.prisma.professionalAvailability.findMany({
        where: { professionalId },
        orderBy: { dayOfWeek: 'asc' },
      });
      if (allWindows.length > 0) {
        const nextDay = allWindows[0].dayOfWeek!;
        // Calculate days until next available day
        let daysUntil = nextDay - dayOfWeek;
        if (daysUntil <= 0) daysUntil += 7;
        const nextDate = new Date(targetDate);
        nextDate.setDate(targetDate.getDate() + daysUntil);
        suggestions.push(`Next available day: ${DAY_NAMES[nextDay]}, ${nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`);
      }
    } else {
      // 2. Check time-slot fit
      const slot = startTimeSlot || 'ALL_DAY';
      const endSlot = endTimeSlot || startTimeSlot || 'ALL_DAY';

      if (slot !== 'ALL_DAY' || endSlot !== 'ALL_DAY') {
        const hasWindowCovering = relevantWindows.some((w) => {
          if (!w.startTime || !w.endTime) return true; // window covers all day
          const slotStartMin = slot === 'AM' ? 0 : 12 * 60;
          const slotEndMin = endSlot === 'PM' || endSlot === 'ALL_DAY' ? 24 * 60 : 12 * 60;
          const windowStartMin = parseInt(w.startTime.split(':')[0], 10) * 60 + parseInt(w.startTime.split(':')[1] || '0', 10);
          const windowEndMin = parseInt(w.endTime.split(':')[0], 10) * 60 + parseInt(w.endTime.split(':')[1] || '0', 10);
          return windowStartMin <= slotStartMin && windowEndMin >= slotEndMin;
        });

        if (!hasWindowCovering) {
          const firstWindow = relevantWindows[0];
          if (firstWindow?.startTime && firstWindow?.endTime) {
            warnings.push(`Your availability on this day is ${firstWindow.startTime}–${firstWindow.endTime}. This ${slot === endSlot ? slot : `${slot}–${endSlot}`} slot may fall outside your working hours.`);
          }
        }
      }

      // 3. Check maxProjects cap
      const maxProjects = Math.max(...relevantWindows.map((w) => w.maxProjects || 1), 1);

      // Count distinct projects with milestones on this day
      const assignments = await this.prisma.projectProfessional.findMany({
        where: { professionalId, status: { in: ['accepted', 'awarded'] } },
        select: { id: true },
      });
      const ppIds = assignments.map((a) => a.id);

      if (ppIds.length > 0) {
        const dayStart = new Date(`${date}T00:00:00Z`);
        const dayEnd = new Date(`${date}T23:59:59Z`);

        const dayMilestones = await this.prisma.projectMilestone.findMany({
          where: {
            projectProfessionalId: { in: ppIds },
            status: { not: 'completed' },
            plannedStartDate: { lte: dayEnd },
            OR: [
              { plannedEndDate: null },
              { plannedEndDate: { gte: dayStart } },
            ],
          },
          select: { projectProfessionalId: true },
        });

        const distinctProjects = new Set(dayMilestones.map((m) => m.projectProfessionalId).filter((id): id is string => id !== null));
        const currentCount = distinctProjects.size;

        if (currentCount >= maxProjects) {
          warnings.push(`You've reached your max of ${maxProjects} project${maxProjects > 1 ? 's' : ''} for this day.`);
        } else if (currentCount > 0) {
          warnings.push(`You have ${currentCount} project${currentCount > 1 ? 's' : ''} on this day (max: ${maxProjects}).`);
        }
      }
    }

    return {
      available: warnings.length === 0,
      warnings,
      suggestions,
    };
  }

  /**
   * Batch check availability across multiple days — returns a map of
   * dateKey → { AM, PM, ALL_DAY } status for the smart slot picker.
   */
  async checkAvailabilityBatch(params: {
    professionalId: string;
    dates: string[]; // ISO date strings "2026-06-15"
    currentProjectId?: string;
  }) {
    const { professionalId, dates, currentProjectId } = params;
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Fetch all availability windows once
    const allWindows = await this.prisma.professionalAvailability.findMany({
      where: { professionalId },
    });

    // Fetch all active assignments and their milestone counts per day
    const assignments = await this.prisma.projectProfessional.findMany({
      where: { professionalId, status: { in: ['accepted', 'awarded'] } },
      select: { id: true, projectId: true },
    });
    const ppIds = assignments.map((a) => a.id);

    // Fetch all non-completed milestones across all dates
    const allMilestones = ppIds.length > 0 ? await this.prisma.projectMilestone.findMany({
      where: {
        projectProfessionalId: { in: ppIds },
        status: { not: 'completed' },
        plannedStartDate: { not: null },
      },
      select: {
        id: true,
        plannedStartDate: true,
        plannedEndDate: true,
        startTimeSlot: true,
        endTimeSlot: true,
        projectProfessionalId: true,
      },
    }) : [];

    // Build a map of ppId → projectId
    const ppToProject = new Map(assignments.map((a) => [a.id, a.projectId]));

    const result: Record<string, { AM: 'free' | 'busy' | 'unavailable'; PM: 'free' | 'busy' | 'unavailable'; ALL_DAY: 'free' | 'busy' | 'unavailable' }> = {};

    for (const date of dates) {
      const targetDate = new Date(date);
      const dayOfWeek = targetDate.getDay();

      // Find relevant windows
      const dateSpecific = allWindows.filter((w) => w.date && w.date.toISOString().split('T')[0] === date);
      const relevantWindows = dateSpecific.length > 0
        ? dateSpecific
        : allWindows.filter((w) => w.dayOfWeek === dayOfWeek);

      if (relevantWindows.length === 0) {
        result[date] = { AM: 'unavailable', PM: 'unavailable', ALL_DAY: 'unavailable' };
        continue;
      }

      const maxProjects = Math.max(...relevantWindows.map((w) => w.maxProjects || 1), 1);
      const firstWindow = relevantWindows[0];

      // Count distinct projects with milestones on this day
      const dayStart = new Date(`${date}T00:00:00Z`);
      const dayEnd = new Date(`${date}T23:59:59Z`);

      const dayMilestones = allMilestones.filter((m) => {
        if (!m.plannedStartDate) return false;
        const ms = new Date(m.plannedStartDate);
        const me = m.plannedEndDate ? new Date(m.plannedEndDate) : ms;
        return ms <= dayEnd && me >= dayStart;
      });

      const distinctProjects = new Set(dayMilestones.map((m) => m.projectProfessionalId).filter((id): id is string => id !== null));
      const currentCount = distinctProjects.size;

      const getSlotStatus = (slot: 'AM' | 'PM' | 'ALL_DAY'): 'free' | 'busy' | 'unavailable' => {
        // Check availability window coverage
        if (firstWindow.startTime && firstWindow.endTime) {
          const windowStartMin = parseInt(firstWindow.startTime.split(':')[0], 10) * 60 + parseInt(firstWindow.startTime.split(':')[1] || '0', 10);
          const windowEndMin = parseInt(firstWindow.endTime.split(':')[0], 10) * 60 + parseInt(firstWindow.endTime.split(':')[1] || '0', 10);

          if (slot === 'AM' && windowStartMin > 0) return 'unavailable';
          if (slot === 'PM' && windowEndMin < 24 * 60) return 'unavailable';
        }

        // Check maxProjects
        if (currentCount >= maxProjects) {
          // Busy only if the existing projects aren't the current one
          const otherProjects = [...distinctProjects].filter((ppId) => (ppToProject.get(ppId) ?? '') !== (currentProjectId ?? ''));
          if (otherProjects.length >= maxProjects) return 'busy';
        }

        // Check if this specific slot already has a milestone
        const slotBusy = dayMilestones.some((m) => {
          const ms = m.startTimeSlot || 'ALL_DAY';
          const me = m.endTimeSlot || m.startTimeSlot || 'ALL_DAY';
          if (ms === 'ALL_DAY' || me === 'ALL_DAY' || slot === 'ALL_DAY') return true;
          const slotOrder = { AM: 1, PM: 2 };
          const mStart = slotOrder[ms as keyof typeof slotOrder] || 1;
          const mEnd = slotOrder[me as keyof typeof slotOrder] || 2;
          const sVal = slotOrder[slot];
          return mStart <= sVal && sVal <= mEnd;
        });

        return slotBusy ? 'busy' : 'free';
      };

      result[date] = {
        AM: getSlotStatus('AM'),
        PM: getSlotStatus('PM'),
        ALL_DAY: getSlotStatus('ALL_DAY'),
      };
    }

    return result;
  }
}

