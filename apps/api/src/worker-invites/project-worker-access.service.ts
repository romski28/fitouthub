import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const MAGIC_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class ProjectWorkerAccessService {
  constructor(private readonly prisma: PrismaService) {}

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
    input: { workerId?: string; email?: string },
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (input.workerId) {
      const worker = await this.prisma.worker.findUnique({
        where: { id: input.workerId },
        include: { user: { select: { email: true } } },
      });
      if (!worker) throw new BadRequestException('Worker not found');
      const access = await this.prisma.projectWorkerAccess.create({
        data: {
          projectId,
          workerId: worker.id,
          email: worker.user?.email ?? null,
          grantedByProfessionalId: professionalId,
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

    const user = emailToken.email
      ? await this.prisma.user.findUnique({ where: { email: emailToken.email } })
      : null;
    const worker = user
      ? await this.prisma.worker.findUnique({ where: { userId: user.id } })
      : null;

    if (worker) {
      await this.prisma.projectWorkerAccess.updateMany({
        where: { projectId: emailToken.projectId, email: emailToken.email, workerId: null },
        data: { workerId: worker.id },
      });
    }

    return {
      email: emailToken.email,
      projectId: emailToken.projectId,
      projectName: emailToken.project?.projectName ?? null,
      professionalId: emailToken.professionalId,
      isRegisteredWorker: !!worker,
      expiresAt: emailToken.expiresAt,
    };
  }
}
