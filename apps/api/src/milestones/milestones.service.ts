import { Injectable } from '@nestjs/common';
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
        description: data.description,
      },
    });
  }

  async createMultipleMilestones(data: CreateMultipleMilestonesDto) {
    // First delete any existing milestones for this project
    await this.prisma.projectMilestone.deleteMany({
      where: { projectId: data.projectId },
    });

    // Create new milestones
    return Promise.all(
      data.milestones.map((m) =>
        this.prisma.projectMilestone.create({
          data: {
            projectId: data.projectId,
            projectProfessionalId: m.projectProfessionalId,
            templateId: m.templateId,
            title: m.title,
            sequence: m.sequence,
            status: m.status || 'not_started',
            percentComplete: m.percentComplete || 0,
            plannedStartDate: m.plannedStartDate,
            plannedEndDate: m.plannedEndDate,
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
      throw new Error('Milestone not found');
    }

    return this.prisma.projectMilestone.update({
      where: { id },
      data: {
        photoUrls: (milestone.photoUrls || []).filter((url) => url !== photoUrl),
      },
    });
  }
}
