import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMilestoneDto, UpdateMilestoneDto, CreateMultipleMilestonesDto, MilestoneResponseDto } from './dtos';

@Injectable()
export class MilestonesService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.projectMilestone.create({
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
  }

  async createMultipleMilestones(data: CreateMultipleMilestonesDto) {
    // First delete any existing milestones for this professional on this project
    // Use projectProfessionalId if provided, otherwise fall back to projectId
    const whereClause = data.projectProfessionalId
      ? { projectProfessionalId: data.projectProfessionalId }
      : { projectId: data.projectId };
    
    await this.prisma.projectMilestone.deleteMany({
      where: whereClause,
    });

    // Create new milestones
    return Promise.all(
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
  }

  async updateMilestone(id: string, data: UpdateMilestoneDto) {
    return this.prisma.projectMilestone.update({
      where: { id },
      data: {
        ...data,
      },
    });
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

