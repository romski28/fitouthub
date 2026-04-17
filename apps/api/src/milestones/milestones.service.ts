import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMilestoneDto, UpdateMilestoneDto, CreateMultipleMilestonesDto, MilestoneResponseDto } from './dtos';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notifications/notification.service';
import { extractObjectKeyFromValue, buildPublicAssetUrl } from '../storage/media-assets.util';

@Injectable()
export class MilestonesService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationService: NotificationService,
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
      include: {
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
            plannedEndDate = new Date(startAt.getTime() + endOffset * 60 * 1000);
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

      return {
        success: true,
        scale,
        deletedCount: deleted.count,
        createdCount: synced.length,
        milestones: synced,
      };
    });
  }
}

