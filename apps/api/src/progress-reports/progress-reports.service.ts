import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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

  private async enrichReports(reports: any[]): Promise<any[]> {
    if (reports.length === 0) return [];
    // Collect unique submitter IDs — could be clients (User) or professionals (Professional)
    const userIds = [...new Set(reports.filter((r) => r.submittedByRole === 'client').map((r) => r.submittedById))];
    const proIds = [...new Set(reports.filter((r) => r.submittedByRole !== 'client').map((r) => r.submittedById))];
    const [users, pros] = await Promise.all([
      userIds.length > 0
        ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, surname: true } })
        : Promise.resolve([]),
      proIds.length > 0
        ? this.prisma.professional.findMany({ where: { id: { in: proIds } }, select: { id: true, businessName: true, fullName: true } })
        : Promise.resolve([]),
    ]);
    const userMap = new Map<string, string>(users.map((u) => [u.id, `${u.firstName} ${u.surname}`.trim()] as [string, string]));
    const proMap = new Map<string, string>(pros.map((p) => [p.id, p.businessName || p.fullName || ''] as [string, string]));
    return reports.map((r) => ({
      ...r,
      submitterName: r.submittedByRole === 'client' ? (userMap.get(r.submittedById) ?? 'Client') : (proMap.get(r.submittedById) ?? 'Professional'),
    }));
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

    const reports = await this.prisma.progressReport.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    return this.enrichReports(reports);
  }

  async getReportById(id: string, requesterId: string, requesterRole: string) {
    const report = await this.prisma.progressReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Progress report not found');

    const project = await this.prisma.project.findUnique({
      where: { id: report.projectId },
      include: { professionals: { where: { status: 'accepted' } } },
    });
    if (!project) throw new NotFoundException('Project not found');

    const isClient = requesterRole === 'client' && project.userId === requesterId;
    const isProfessional =
      requesterRole === 'professional' &&
      project.professionals.some((pp) => pp.professionalId === requesterId);
    const isAdmin = requesterRole === 'admin';

    if (!isClient && !isProfessional && !isAdmin) {
      throw new ForbiddenException('You do not have access to this project');
    }

    const [enriched] = await this.enrichReports([report]);
    return enriched;
  }

  async approveSignOff(id: string, requesterId: string, requesterRole: string, decision: 'approved' | 'rejected', rejectionNote?: string) {
    const report = await this.prisma.progressReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Progress report not found');
    if (!report.signOffRequested || report.signOffStatus !== 'pending') {
      throw new BadRequestException('No pending sign-off on this report');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: report.projectId },
      include: { professionals: { where: { status: 'accepted' } } },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Only the client (project owner) can approve/reject sign-offs
    if (requesterRole !== 'client' || project.userId !== requesterId) {
      throw new ForbiddenException('Only the project client may approve or reject sign-offs');
    }

    const now = new Date();
    const updated = await (this.prisma.progressReport as any).update({
      where: { id },
      data: {
        signOffStatus: decision,
        signOffApprovedAt: decision === 'approved' ? now : undefined,
        signOffRejectedAt: decision === 'rejected' ? now : undefined,
      },
    });

    // If milestone linked, update its status too
    if (report.milestoneId && decision === 'approved') {
      await this.prisma.projectMilestone.update({
        where: { id: report.milestoneId },
        data: { signOffStatus: 'approved', signOffApprovedAt: now },
      });
    } else if (report.milestoneId && decision === 'rejected') {
      await this.prisma.projectMilestone.update({
        where: { id: report.milestoneId },
        data: { signOffStatus: 'rejected', signOffRejectedAt: now, signOffRequested: false },
      });
    }

    // Post a system message in the progress thread
    const thread = await this.chatService.getOrCreateProjectThread(report.projectId);
    const threadId = (thread as any).id || (thread as any).threadId;
    const decisionText = decision === 'approved' ? '✅ Milestone sign-off approved.' : `❌ Milestone sign-off rejected.${rejectionNote ? ` Reason: ${rejectionNote}` : ''}`;
    await this.chatService.addProjectMessage(
      threadId,
      'client',
      requesterId,
      null,
      decisionText,
      [],
      { threadScope: 'progress', threadScopeId: report.milestoneId || 'general' },
    );

    return updated;
  }

  async markReportViewed(progressReportId: string, userId: string) {
    // Use SQL upsert to avoid compile-time coupling to a generated Prisma delegate.
    await this.prisma.$executeRaw`
      INSERT INTO "ProgressReportView" ("id", "progressReportId", "userId", "viewedAt", "createdAt", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${progressReportId}, ${userId}, NOW(), NOW(), NOW())
      ON CONFLICT ("progressReportId", "userId")
      DO UPDATE SET "viewedAt" = NOW(), "updatedAt" = NOW()
    `;

    return { ok: true };
  }
}
