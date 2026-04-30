import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ChatService } from '../chat/chat.service';
import { CreateProgressReportDto, PhotoEntryDto } from './progress-reports.dto';

export { CreateProgressReportDto, PhotoEntryDto };

@Injectable()
export class ProgressReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
  ) {}

  async createReport(
    submittedById: string,
    submittedByRole: 'professional' | 'client',
    dto: CreateProgressReportDto,
  ) {
    const { projectId, milestoneId, photoEntries, narrativeSummary, signOffRequested } = dto;

    if (!projectId) throw new BadRequestException('projectId is required');
    if (!Array.isArray(photoEntries) || photoEntries.length === 0) {
      throw new BadRequestException('At least one photo is required');
    }

    // Verify project exists and resolve projectProfessionalId
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { professionals: { where: { status: 'accepted' }, take: 1 } },
    });
    if (!project) throw new BadRequestException('Project not found');

    const projectProfessionalId = project.professionals[0]?.id ?? null;

    // Validate milestone belongs to project
    if (milestoneId) {
      const milestone = await this.prisma.projectMilestone.findFirst({
        where: { id: milestoneId, projectId },
      });
      if (!milestone) throw new BadRequestException('Milestone not found on this project');
    }

    // Persist report
    const report = await this.prisma.progressReport.create({
      data: {
        projectId,
        projectProfessionalId,
        submittedById,
        submittedByRole,
        milestoneId: milestoneId ?? null,
        photoEntries: photoEntries as any,
        narrativeSummary: narrativeSummary ?? null,
        signOffRequested,
        signOffStatus: signOffRequested ? 'pending' : null,
      },
    });

    // Create ProjectPhoto records so images appear in the image tab
    const validPhotos = photoEntries.filter((p) => p.url && p.url !== 'error');
    if (validPhotos.length > 0) {
      await this.prisma.projectPhoto.createMany({
        data: validPhotos.map((p) => ({
          projectId,
          url: p.url,
          note: p.note || null,
        })),
      });
    }

    // If sign-off requested, mark milestone
    if (signOffRequested && milestoneId) {
      await this.prisma.projectMilestone.update({
        where: { id: milestoneId },
        data: {
          signOffRequested: true,
          signOffRequestedAt: new Date(),
          signOffStatus: 'pending',
        },
      });
    }

    // Post to project chat thread
    const thread = await this.chatService.getOrCreateProjectThread(projectId);
    const threadId = (thread as any).id || (thread as any).threadId;

    const attachments = validPhotos.map((p) => ({ url: p.url }));
    const progressThreadScope = 'progress';
    const progressThreadScopeId = milestoneId || 'general';

    let chatContent = narrativeSummary?.trim() || 'Progress update shared.';
    if (signOffRequested && milestoneId) {
      const milestone = await this.prisma.projectMilestone.findUnique({ where: { id: milestoneId } });
      chatContent = `Milestone sign-off requested${milestone ? ` for: ${milestone.title}` : ''}. ${narrativeSummary?.trim() || ''}`.trim();
    }

    const senderUserId = submittedByRole === 'client' ? submittedById : null;
    const senderProId = submittedByRole === 'professional' ? submittedById : null;

    const message = await this.chatService.addProjectMessage(
      threadId,
      submittedByRole,
      senderUserId,
      senderProId,
      chatContent,
      attachments,
      {
        threadScope: progressThreadScope,
        threadScopeId: progressThreadScopeId,
      },
    );

    // Store chat message ID on the report
    await this.prisma.progressReport.update({
      where: { id: report.id },
      data: { chatMessageId: message.id },
    });

    return { ...report, chatMessageId: message.id };
  }

  async getReportsByProject(projectId: string, requesterId: string, requesterRole: string) {
    // Both parties on the project can view reports
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { professionals: { where: { status: 'accepted' } } },
    });
    if (!project) throw new BadRequestException('Project not found');

    const isClient = requesterRole === 'client' && project.userId === requesterId;
    const isProfessional =
      requesterRole === 'professional' &&
      project.professionals.some((pp) => pp.professionalId === requesterId);
    const isAdmin = requesterRole === 'admin';

    if (!isClient && !isProfessional && !isAdmin) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return this.prisma.progressReport.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markReportViewed(progressReportId: string, userId: string) {
    // Upsert to avoid duplicates
    return this.prisma.progressReportView.upsert({
      where: { progressReportId_userId: { progressReportId, userId } },
      update: { viewedAt: new Date() },
      create: { progressReportId, userId, viewedAt: new Date() },
    });
  }
}
