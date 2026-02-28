import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMilestoneDto, UpdateMilestoneDto, CreateMultipleMilestonesDto, MilestoneResponseDto } from './dtos';
import { EmailService } from '../email/email.service';

@Injectable()
export class MilestonesService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async getMilestonesByProject(projectId: string) {
    return this.prisma.projectMilestone.findMany({
      where: { projectId },
      orderBy: { sequence: 'asc' },
    });
  }

  async getMilestonesByProjectProfessional(projectProfessionalId: string) {
    return this.prisma.projectMilestone.findMany({
      where: { projectProfessionalId },
      orderBy: { sequence: 'asc' },
    });
  }

  async getMilestoneById(id: string) {
    return this.prisma.projectMilestone.findUnique({
      where: { id },
    });
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
      where: whereClause,
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

    return this.prisma.projectMilestone.update({
      where: { id },
      data: {
        photoUrls: [...(milestone.photoUrls || []), ...photoUrls],
      },
    });
  }

  async removePhotoFromMilestone(id: string, photoUrl: string) {
    const milestone = await this.prisma.projectMilestone.findUnique({
      where: { id },
    });

    if (!milestone) {
      throw new NotFoundException(`Milestone with ID ${id} not found`);
    }

    return this.prisma.projectMilestone.update({
      where: { id },
      data: {
        photoUrls: (milestone.photoUrls || []).filter((url) => url !== photoUrl),
      },
    });
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
}

