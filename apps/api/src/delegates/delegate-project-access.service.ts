import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { ChatService } from '../chat/chat.service';

const MAGIC_TTL_MS = 48 * 60 * 60 * 1000;

const DELEGATE_PERMISSIONS = {
  scanQr: true,
  chat: true,
  reportProgress: true,
  viewBudget: false,
  controlFinancials: false,
};

@Injectable()
export class DelegateProjectAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
  ) {}

  private webBaseUrl(): string {
    return (
      process.env.WEB_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.APP_WEB_URL ||
      'http://localhost:3000'
    );
  }

  /**
   * Mirror of ProjectWorkerAccessService.getSiteInspectionTaskState — the
   * site-inspection task is project-level, so delegates reuse the same arc.
   */
  async getSiteInspectionTaskState(
    projectId: string,
  ): Promise<{ active: boolean; phase: 'booking' | 'check_in' | null }> {
    const project = await this.prisma.project
      .findUnique({ where: { id: projectId }, select: { currentStage: true } })
      .catch(() => null);
    if (!project) return { active: false, phase: null };

    const latest = await this.prisma.siteAccessRequest.findFirst({
      where: { projectId },
      orderBy: { requestedAt: 'desc' },
      select: { status: true, visitDetails: true },
    });

    const stage = String((project as any).currentStage || '').toUpperCase();
    const arcStages = ['BIDDING_ACTIVE', 'SITE_VISIT_SCHEDULED', 'PRE_WORK'];
    const rescheduleRequired = Boolean(
      latest?.visitDetails && latest.visitDetails.includes('Site availability changed to'),
    );
    const status = latest?.status || 'none';

    if (rescheduleRequired) return { active: true, phase: 'booking' };
    if (status === 'visited' || status === 'skipped' || status === 'approved_no_visit') {
      return { active: false, phase: null };
    }
    if (!arcStages.includes(stage)) return { active: false, phase: null };

    return {
      active: true,
      phase: status === 'approved_visit_scheduled' ? 'check_in' : 'booking',
    };
  }

  async grant(
    projectId: string,
    clientId: string,
    input: { delegateUserId?: string; email?: string; task?: string },
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== clientId) {
      throw new ForbiddenException('Only the project client can grant delegate access');
    }

    // Task-scoped magic links are only available while that task is current.
    if (input.task) {
      const state = await this.getSiteInspectionTaskState(projectId);
      const isAvailable = input.task === 'site_inspection' && state.active;
      if (!isAvailable) {
        throw new BadRequestException('Site inspection is not currently available for this project');
      }
    }

    if (input.delegateUserId) {
      const delegate = await this.prisma.user.findUnique({
        where: { id: input.delegateUserId },
        select: { id: true, email: true, role: true },
      });
      if (!delegate || delegate.role !== 'project_delegate') {
        throw new BadRequestException('Delegate account not found');
      }
      const grant = await this.prisma.projectAccessGrant.create({
        data: {
          projectId,
          delegateUserId: delegate.id,
          email: delegate.email ?? null,
          grantedByClientId: clientId,
          actorType: 'delegate',
          permissions: DELEGATE_PERMISSIONS,
          task: input.task ?? null,
          expiresAt: null, // ongoing until revoked
        },
      });
      return { grant };
    }

    if (input.email) {
      const email = input.email.trim().toLowerCase();
      if (!email) throw new BadRequestException('Email is required');
      const expiresAt = new Date(Date.now() + MAGIC_TTL_MS);
      const token = randomUUID();
      const grant = await this.prisma.projectAccessGrant.create({
        data: {
          token,
          projectId,
          delegateUserId: null,
          email,
          grantedByClientId: clientId,
          actorType: 'delegate',
          permissions: DELEGATE_PERMISSIONS,
          task: input.task ?? null,
          expiresAt,
        },
      });
      return {
        grant,
        magicUrl: `${this.webBaseUrl()}/delegate-project-access?token=${token}`,
      };
    }

    throw new BadRequestException('Provide delegateUserId or email');
  }

  async list(projectId: string, clientId: string) {
    return this.prisma.projectAccessGrant.findMany({
      where: { projectId, grantedByClientId: clientId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(projectId: string, clientId: string, grantId: string) {
    const grant = await this.prisma.projectAccessGrant.findUnique({ where: { id: grantId } });
    if (!grant || grant.projectId !== projectId || grant.grantedByClientId !== clientId) {
      throw new NotFoundException('Grant not found');
    }
    return this.prisma.projectAccessGrant.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    });
  }

  async resolveMagic(token: string) {
    const grant = await this.prisma.projectAccessGrant.findUnique({
      where: { token },
    });
    if (!grant) throw new BadRequestException('Invalid link');
    if (grant.expiresAt && new Date() > grant.expiresAt) {
      throw new BadRequestException('This link has expired');
    }
    if (grant.consumedAt) throw new BadRequestException('This link has already been used');

    const delegate = grant.email
      ? await this.prisma.user.findUnique({ where: { email: grant.email } })
      : null;

    if (delegate && delegate.role === 'project_delegate') {
      await this.prisma.projectAccessGrant.update({
        where: { id: grant.id },
        data: { delegateUserId: delegate.id },
      });
    }

    const project = await this.prisma.project.findUnique({
      where: { id: grant.projectId },
      select: { projectName: true },
    });

    return {
      email: grant.email,
      projectId: grant.projectId,
      projectName: project?.projectName ?? null,
      isRegisteredDelegate: delegate?.role === 'project_delegate',
      expiresAt: grant.expiresAt,
      task: grant.task ?? null,
      consumedAt: grant.consumedAt ?? null,
    };
  }

  private async assertDelegateAccess(projectId: string, delegateUserId: string) {
    const delegate = await this.prisma.user.findUnique({
      where: { id: delegateUserId },
      select: { id: true, email: true, firstName: true, surname: true, role: true },
    });
    if (!delegate) throw new ForbiddenException('User not found');
    if (delegate.role !== 'project_delegate') {
      throw new ForbiddenException('Only delegates can access this project');
    }

    const now = new Date();
    const grant = await this.prisma.projectAccessGrant.findFirst({
      where: {
        projectId,
        revokedAt: null,
        consumedAt: null,
        OR: [
          { delegateUserId },
          ...(delegate.email ? [{ email: delegate.email.toLowerCase() }] : []),
        ],
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
              { delegateUserId: { not: null }, task: { not: null } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!grant) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return { delegate, grant };
  }

  async getDelegateProject(projectId: string, delegateUserId: string) {
    const { grant } = await this.assertDelegateAccess(projectId, delegateUserId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, status: { not: 'archived' } },
      include: {
        photos: true,
        property: {
          select: {
            id: true,
            displayAddress: true,
            buildingName: true,
            buildingNameZh: true,
            unitNumber: true,
            floorLevel: true,
            blockTower: true,
            street: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const task = grant.task ?? null;
    const siteInspection = await this.getSiteInspectionTaskState(projectId);

    return {
      project,
      access: {
        id: grant.id,
        expiresAt: grant.expiresAt,
        isOngoing: !task,
        accessType: task ? 'magic' : 'ongoing',
        task,
        consumedAt: grant.consumedAt ?? null,
        claimed: task ? grant.delegateUserId === delegateUserId : false,
        permissions: grant.permissions ?? DELEGATE_PERMISSIONS,
      },
      siteInspection,
      isDelegateAccess: true,
    };
  }

  async listDelegateProjects(delegateUserId: string) {
    const delegate = await this.prisma.user.findUnique({
      where: { id: delegateUserId },
      select: { id: true, email: true, role: true },
    });
    if (!delegate || delegate.role !== 'project_delegate') {
      throw new ForbiddenException('Only delegates can list projects');
    }

    const now = new Date();
    const grants = await this.prisma.projectAccessGrant.findMany({
      where: {
        revokedAt: null,
        consumedAt: null,
        OR: [
          { delegateUserId },
          ...(delegate.email ? [{ email: delegate.email.toLowerCase() }] : []),
        ],
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
              { delegateUserId: { not: null }, task: { not: null } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    const projectIds = [...new Set(grants.map((g) => g.projectId))];
    if (projectIds.length === 0) return [];

    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds }, status: { not: 'archived' } },
      select: {
        id: true,
        projectName: true,
        clientName: true,
        region: true,
        notes: true,
        endDate: true,
        status: true,
      },
    });
    const byId = new Map(projects.map((p) => [p.id, p]));

    return grants
      .filter((g) => byId.has(g.projectId))
      .map((g) => {
        const task = g.task ?? null;
        return {
          ...byId.get(g.projectId),
          access: {
            id: g.id,
            expiresAt: g.expiresAt,
            isOngoing: !task,
            accessType: task ? 'magic' : 'ongoing',
            task,
            consumedAt: g.consumedAt ?? null,
            claimed: task ? g.delegateUserId === delegateUserId : false,
          },
          isDelegateAccess: true,
        };
      });
  }

  /**
   * Record a scoped on-site delegate action. The grant is re-verified and the
   * action is persisted as an attributed message on the project chat thread so
   * the client sees it. Mirrors ProjectWorkerAccessService.recordWorkerAction.
   */
  async recordDelegateAction(
    projectId: string,
    delegateUserId: string,
    action: 'check_in' | 'update',
    note?: string,
  ) {
    const { delegate } = await this.assertDelegateAccess(projectId, delegateUserId);

    const labels: Record<'check_in' | 'update', string> = {
      check_in: 'checked in on site',
      update: 'reported progress',
    };

    const cleanNote = (note || '').trim();
    const name = [delegate.firstName, delegate.surname].filter(Boolean).join(' ') || 'Delegate';
    const content = `🤝 ${name} ${labels[action]}${cleanNote ? `: ${cleanNote}` : '.'}`;

    const thread = await this.chatService.getOrCreateProjectThread(projectId);
    const message = await this.chatService.addProjectMessage(
      thread.id,
      'client',
      delegateUserId,
      null,
      content,
    );

    return { success: true, action, message };
  }
}
