import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { join, resolve } from 'path';
import { promises as fs } from 'fs';
import { createId } from '@paralleldrive/cuid2';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  private readonly STATUS_ORDER = [
    'awarded',
    'quoted',
    'accepted',
    'counter_requested',
    'pending',
    'declined',
  ];

  private betterStatus(a?: string | null, b?: string | null): string | null | undefined {
    if (!a) return b;
    if (!b) return a;
    const ia = this.STATUS_ORDER.indexOf(a);
    const ib = this.STATUS_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a;
    if (ia === -1) return b;
    if (ib === -1) return a;
    return ia <= ib ? a : b;
  }

  private dedupeProfessionals(list: any[] | undefined | null): any[] {
    if (!Array.isArray(list) || list.length === 0) return [];
    const map = new Map<string, any>();
    for (const entry of list) {
      const key = entry?.professional?.id || entry?.professional?.email || entry?.id;
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...entry });
      } else {
        const merged: any = { ...existing };
        merged.status = this.betterStatus(existing.status, entry.status) ?? entry.status ?? existing.status;
        if (merged.quoteAmount == null && entry.quoteAmount != null) merged.quoteAmount = entry.quoteAmount;
        if (!merged.quoteNotes && entry.quoteNotes) merged.quoteNotes = entry.quoteNotes;
        if (!merged.quotedAt && entry.quotedAt) merged.quotedAt = entry.quotedAt;
        if (!merged.respondedAt && entry.respondedAt) merged.respondedAt = entry.respondedAt;
        map.set(key, merged);
      }
    }
    return Array.from(map.values());
  }

  async findAll() {
    try {
      const projects = await this.prisma.project.findMany({
        include: {
          client: true,
          professionals: {
            include: {
              professional: true,
            },
          },
        },
      });
      // Consolidate duplicate professionals per project
      return projects.map((p: any) => ({
        ...p,
        professionals: this.dedupeProfessionals(p.professionals),
      }));
    } catch (error) {
      console.error('[ProjectsService.findAll] Database error:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
      });
      return [];
    }
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        professionals: {
          include: {
            professional: true,
          },
        },
      },
    });
    if (!project) return null;
    return {
      ...project,
      professionals: this.dedupeProfessionals((project as any).professionals),
    } as any;
  }

  async getEmailTokens(projectId: string) {
    return this.prisma.emailToken.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            email: true,
            fullName: true,
            businessName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getProjectProfessionals(projectId: string) {
    const pros = await this.prisma.projectProfessional.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            email: true,
            fullName: true,
            businessName: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return this.dedupeProfessionals(pros);
  }

  async create(createProjectDto: CreateProjectDto) {
    const { professionalId, ...projectData } = createProjectDto;

    // Fetch professional details for email
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: { email: true, fullName: true, businessName: true },
    });

    if (!professional) {
      throw new Error('Professional not found');
    }

    // Create project with ProjectProfessional junction
    const project = await this.prisma.project.create({
      data: {
        ...projectData,
        professionals: {
          create: {
            professionalId,
            status: 'pending',
          },
        },
      },
      include: {
        client: true,
        professionals: {
          include: {
            professional: true,
          },
        },
      },
    });

    // Generate secure tokens for accept/decline actions
    const acceptToken = createId();
    const declineToken = createId();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

    // Store tokens in database
    await Promise.all([
      this.prisma.emailToken.create({
        data: {
          token: acceptToken,
          projectId: project.id,
          professionalId,
          action: 'accept',
          expiresAt,
        },
      }),
      this.prisma.emailToken.create({
        data: {
          token: declineToken,
          projectId: project.id,
          professionalId,
          action: 'decline',
          expiresAt,
        },
      }),
    ]);

    // Send invitation email
    const professionalName =
      professional.fullName || professional.businessName || 'Professional';
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    await this.emailService.sendProjectInvitation({
      to: professional.email,
      professionalName,
      projectName: project.projectName,
      projectDescription: project.notes || 'No description provided',
      location: project.region,
      acceptToken,
      declineToken,
      baseUrl,
    });

    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    return this.prisma.project.update({
      where: { id },
      data: updateProjectDto,
      include: {
        client: true,
        professionals: {
          include: {
            professional: true,
          },
        },
      },
    });
  }

  async respondToInvitation(token: string, action: 'accept' | 'decline') {
    // Validate token
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
    });

    if (!emailToken) {
      throw new Error('Invalid or expired token');
    }

    if (emailToken.usedAt) {
      throw new Error('This link has already been used');
    }

    if (new Date() > emailToken.expiresAt) {
      throw new Error('This invitation has expired');
    }

    if (emailToken.action !== action) {
      throw new Error('Invalid action for this token');
    }

    // Fetch professional and project separately
    const [professional, project] = await Promise.all([
      this.prisma.professional.findUnique({
        where: { id: emailToken.professionalId },
      }),
      this.prisma.project.findUnique({
        where: { id: emailToken.projectId },
        include: {
          client: true,
        },
      }),
    ]);

    if (!professional || !project) {
      throw new Error('Professional or project not found');
    }

    // Mark token as used
    await this.prisma.emailToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    // Update ProjectProfessional status
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    await this.prisma.projectProfessional.updateMany({
      where: {
        projectId: emailToken.projectId,
        professionalId: emailToken.professionalId,
      },
      data: {
        status: newStatus,
        respondedAt: new Date(),
      },
    });

    // Send follow-up email if accepted
    if (action === 'accept') {
      const professionalName =
        professional.fullName ||
        professional.businessName ||
        'Professional';
      const webBaseUrl =
        process.env.WEB_BASE_URL ||
        process.env.FRONTEND_BASE_URL ||
        process.env.APP_WEB_URL ||
        'https://fitouthub-web.vercel.app';

      await this.emailService.sendProjectAccepted({
        to: professional.email,
        professionalName,
        projectName: project.projectName,
        projectId: emailToken.projectId,
        professionalId: emailToken.professionalId,
        baseUrl: webBaseUrl,
      });
    }

    return {
      success: true,
      message:
        action === 'accept'
          ? 'Thank you for accepting! Please submit your quote within 24 hours.'
          : 'Project declined. Thank you for your response.',
      projectId: emailToken.projectId,
      professionalId: emailToken.professionalId,
    };
  }

  async submitQuote(
    projectId: string,
    professionalId: string,
    quoteAmount: number,
    quoteNotes?: string,
  ) {
    // Verify professional has accepted this project
    const projectProfessional = await this.prisma.projectProfessional.findUnique(
      {
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          project: {
            include: {
              client: true,
            },
          },
          professional: true,
        },
      },
    );

    if (!projectProfessional) {
      throw new Error('You are not invited to this project');
    }

    if (projectProfessional.status !== 'accepted') {
      throw new Error('You must accept the project before submitting a quote');
    }

    if (projectProfessional.quotedAt) {
      throw new Error('You have already submitted a quote for this project');
    }

    // Update ProjectProfessional with quote
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        status: 'quoted',
        quoteAmount,
        quoteNotes,
        quotedAt: new Date(),
      },
    });

    // Notify client
    const clientEmail = projectProfessional.project.clientId || 'client@example.com'; // TODO: Get real client email
    const professionalName =
      projectProfessional.professional.fullName ||
      projectProfessional.professional.businessName ||
      'Professional';
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    await this.emailService.sendQuoteSubmitted({
      to: clientEmail,
      clientName: projectProfessional.project.clientName,
      professionalName,
      projectName: projectProfessional.project.projectName,
      quoteAmount,
      projectId,
      baseUrl,
    });

    return {
      success: true,
      message: 'Quote submitted successfully',
      quoteAmount,
    };
  }

  async remove(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { notes: true },
    });

    if (project?.notes) {
      await this.deleteProjectFiles(project.notes);
    }

    return this.prisma.project.delete({
      where: { id },
    });
  }

  private async deleteProjectFiles(notes: string) {
    const uploadsRoot = resolve(process.cwd(), 'uploads');
    const matches = notes.match(/(https?:\/\/[^\s,;]+|\/uploads\/[^\s,;]+)/g) || [];

    const files = matches
      .map((url) => {
        const idx = url.indexOf('/uploads/');
        if (idx === -1) return null;
        const relative = url.slice(idx + '/uploads/'.length);
        if (!relative) return null;
        const target = resolve(uploadsRoot, relative);
        // Prevent path traversal
        if (!target.startsWith(uploadsRoot)) return null;
        return target;
      })
      .filter((p): p is string => Boolean(p));

    await Promise.all(
      files.map(async (filepath) => {
        try {
          await fs.unlink(filepath);
        } catch (err) {
          // Ignore missing files or permission issues to avoid blocking deletion
          return;
        }
      }),
    );
  }
}
