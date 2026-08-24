import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ChatService } from '../chat/chat.service';

const MAGIC_TTL_MS = 48 * 60 * 60 * 1000;

export type WorkerAction = 'check_in' | 'start' | 'update' | 'complete';

@Injectable()
export class ProjectWorkerAccessService {
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

  async grant(
    projectId: string,
    professionalId: string,
    input: { workerId?: string; email?: string; task?: string },
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (input.workerId) {
      const worker = await this.prisma.professional.findUnique({
        where: { id: input.workerId },
        select: { id: true, email: true },
      });
      if (!worker) throw new BadRequestException('Worker not found');
      const access = await this.prisma.projectWorkerAccess.create({
        data: {
          projectId,
          workerId: worker.id,
          email: worker.email ?? null,
          grantedByProfessionalId: professionalId,
          task: input.task ?? null,
          expiresAt: null, // ongoing until revoked
        },
      });
      return { access };
    }

    if (input.email) {
      const email = input.email.trim().toLowerCase();
      if (!email) throw new BadRequestException('Email is required');
      const expiresAt = new Date(Date.now() + MAGIC_TTL_MS);
      const access = await this.prisma.projectWorkerAccess.create({
        data: {
          projectId,
          workerId: null,
          email,
          grantedByProfessionalId: professionalId,
          task: input.task ?? null,
          expiresAt,
        },
      });
      const token = await this.prisma.emailToken.create({
        data: {
          projectId,
          professionalId,
          action: 'worker_project_access',
          email,
          expiresAt,
        },
      });
      return {
        access,
        magicUrl: `${this.webBaseUrl()}/worker-project-access?token=${token.token}`,
      };
    }

    throw new BadRequestException('Provide workerId or email');
  }

  async list(projectId: string, professionalId: string) {
    return this.prisma.projectWorkerAccess.findMany({
      where: { projectId, grantedByProfessionalId: professionalId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(projectId: string, professionalId: string, grantId: string) {
    const grant = await this.prisma.projectWorkerAccess.findUnique({ where: { id: grantId } });
    if (!grant || grant.projectId !== projectId || grant.grantedByProfessionalId !== professionalId) {
      throw new NotFoundException('Grant not found');
    }
    return this.prisma.projectWorkerAccess.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    });
  }

  async resolveMagic(token: string) {
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
      include: { project: { select: { id: true, projectName: true } } },
    });
    if (!emailToken || emailToken.action !== 'worker_project_access') {
      throw new BadRequestException('Invalid link');
    }
    if (new Date() > emailToken.expiresAt) {
      throw new BadRequestException('This link has expired');
    }

    const worker = emailToken.email
      ? await this.prisma.professional.findUnique({ where: { email: emailToken.email } })
      : null;

    // Resolve the corresponding grant to read its task and consumption state.
    const grant = await this.prisma.projectWorkerAccess.findFirst({
      where: { projectId: emailToken.projectId, email: emailToken.email },
      orderBy: { createdAt: 'desc' },
    });

    if (worker && worker.professionType === 'worker') {
      await this.prisma.projectWorkerAccess.updateMany({
        where: { projectId: emailToken.projectId, email: emailToken.email, workerId: null },
        data: { workerId: worker.id },
      });
    }

    if (grant?.consumedAt) {
      throw new BadRequestException('This link has already been used');
    }

    return {
      email: emailToken.email,
      projectId: emailToken.projectId,
      projectName: emailToken.project?.projectName ?? null,
      professionalId: emailToken.professionalId,
      isRegisteredWorker: worker?.professionType === 'worker',
      expiresAt: emailToken.expiresAt,
      task: grant?.task ?? null,
      consumedAt: grant?.consumedAt ?? null,
    };
  }

  /**
   * Resolve the worker Professional and enforce an active, non-expired grant for
   * the given project. Throws ForbiddenException when the actor is not a worker
   * or has no live grant (matched by workerId or email).
   */
  private async assertWorkerAccess(projectId: string, professionalId: string) {
    const worker = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: {
        id: true,
        email: true,
        fullName: true,
        businessName: true,
        professionType: true,
        employerProfessionalId: true,
      },
    });
    if (!worker) throw new ForbiddenException('Professional not found');
    if (worker.professionType !== 'worker') {
      throw new ForbiddenException('Only workers can access this project');
    }

    const now = new Date();
    const grant = await this.prisma.projectWorkerAccess.findFirst({
      where: {
        projectId,
        revokedAt: null,
        OR: [
          { workerId: professionalId },
          ...(worker.email ? [{ email: worker.email.toLowerCase() }] : []),
        ],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!grant) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return { worker, grant };
  }

  /** Worker-scoped project detail — only readable with an active grant. */
  async getWorkerProject(projectId: string, professionalId: string) {
    const { worker, grant } = await this.assertWorkerAccess(projectId, professionalId);

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

    const employer = worker.employerProfessionalId
      ? await this.prisma.professional.findUnique({
          where: { id: worker.employerProfessionalId },
          select: {
            id: true,
            businessName: true,
            fullName: true,
            phone: true,
            serviceArea: true,
            locationPrimary: true,
            locationSecondary: true,
            locationTertiary: true,
          },
        })
      : null;

    return {
      project,
      employer,
      access: {
        id: grant.id,
        expiresAt: grant.expiresAt,
        isOngoing: grant.expiresAt === null,
        accessType: grant.expiresAt === null ? 'ongoing' : 'magic',
        task: grant.task ?? null,
        consumedAt: grant.consumedAt ?? null,
      },
      isWorkerAccess: true,
    };
  }

  /** List of projects the worker currently has an active grant for. */
  async listWorkerProjects(professionalId: string) {
    const worker = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: { id: true, email: true, professionType: true },
    });
    if (!worker || worker.professionType !== 'worker') {
      throw new ForbiddenException('Only workers can list projects');
    }

    const now = new Date();
    const grants = await this.prisma.projectWorkerAccess.findMany({
      where: {
        revokedAt: null,
        consumedAt: null,
        OR: [
          { workerId: professionalId },
          ...(worker.email ? [{ email: worker.email.toLowerCase() }] : []),
        ],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
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
      .map((g) => ({
        ...byId.get(g.projectId),
        access: { id: g.id, expiresAt: g.expiresAt, isOngoing: g.expiresAt === null, accessType: g.expiresAt === null ? 'ongoing' : 'magic', task: g.task ?? null, consumedAt: g.consumedAt ?? null },
        isWorkerAccess: true,
      }));
  }

  /**
   * Record a scoped on-site worker action. Grant is re-verified; the action is
   * persisted as an attributed message on the project chat thread so the client
   * and employer both see it.
   */
  async recordWorkerAction(
    projectId: string,
    professionalId: string,
    action: WorkerAction,
    note?: string,
  ) {
    const { worker } = await this.assertWorkerAccess(projectId, professionalId);

    const labels: Record<WorkerAction, string> = {
      check_in: 'checked in on site',
      start: 'started work on site',
      update: 'posted a progress update',
      complete: 'marked the project complete',
    };

    const cleanNote = (note || '').trim();
    const content = `👷 ${worker.fullName || worker.businessName || 'Worker'} ${labels[action]}${
      cleanNote ? `: ${cleanNote}` : '.'
    }`;

    const thread = await this.chatService.getOrCreateProjectThread(projectId);
    const message = await this.chatService.addProjectMessage(
      thread.id,
      'professional',
      null,
      professionalId,
      content,
    );

    return { success: true, action, message };
  }
}
