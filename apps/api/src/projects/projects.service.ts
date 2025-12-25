/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { resolve } from 'path';
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

  private betterStatus(
    a?: string | null,
    b?: string | null,
  ): string | null | undefined {
    if (!a) return b;
    if (!b) return a;
    const ia = this.STATUS_ORDER.indexOf(a);
    const ib = this.STATUS_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a;
    if (ia === -1) return b;
    if (ib === -1) return a;
    return ia <= ib ? a : b;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dedupeProfessionals(list: any[] | undefined | null): any[] {
    if (!Array.isArray(list) || list.length === 0) return [];
    const map = new Map<string, unknown>();
    for (const entry of list) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = entry as any;
      const key = (e?.professional?.id || e?.professional?.email || e?.id) as string;
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...e });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const merged: any = { ...(existing as any) };
        merged.status = this.betterStatus(
          (existing as any)?.status,
          e?.status,
        ) ?? e?.status ?? (existing as any)?.status;
        if (merged.quoteAmount == null && e?.quoteAmount != null) {
          merged.quoteAmount = e.quoteAmount;
        }
        if (!merged.quoteNotes && e?.quoteNotes) {
          merged.quoteNotes = e.quoteNotes;
        }
        if (!merged.quotedAt && e?.quotedAt) {
          merged.quotedAt = e.quotedAt;
        }
        if (!merged.respondedAt && e?.respondedAt) {
          merged.respondedAt = e.respondedAt;
        }
        map.set(key, merged);
      }
    }
    return Array.from(map.values());
  }

  private canon(s?: string | null): string {
    return (s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  async findCanonical(clientId?: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projects = (await this.prisma.project.findMany({
        where: clientId ? { clientId } : undefined,
        include: {
          client: true,
          professionals: {
            include: { professional: true },
          },
        },
      })) as any[];

      const byKey = new Map<string, unknown>();
      for (const p of projects) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proj = p as any;
        const key = clientId
          ? `${clientId}|${this.canon(proj.projectName)}`
          : `${this.canon(proj.clientName)}|${this.canon(proj.projectName)}`;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, {
            ...proj,
            canonicalKey: key,
            sourceIds: [String(proj.id)],
            professionals: this.dedupeProfessionals(proj.professionals),
          });
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing_proj = existing as any;
          const mergedPros = [
            ...(existing_proj.professionals ?? []),
            ...(proj.professionals ?? []),
          ];
          existing_proj.professionals = this.dedupeProfessionals(mergedPros);
          existing_proj.sourceIds = Array.from(
            new Set([
              ...(existing_proj.sourceIds ?? []),
              String(proj.id),
            ]),
          );
          // Prefer the most recently updated record for primary fields
          if ((proj.updatedAt || '') > (existing_proj.updatedAt || '')) {
            existing_proj.id = proj.id;
            existing_proj.region = proj.region;
            existing_proj.status = proj.status;
            existing_proj.contractorName = proj.contractorName;
            existing_proj.budget = proj.budget;
            existing_proj.notes = proj.notes;
            existing_proj.updatedAt = proj.updatedAt;
          }
        }
      }
      return Array.from(byKey.values());
    } catch (error) {
      console.error('[ProjectsService.findCanonical] Database error:', {
        message: (error as any)?.message,
        code: (error as any)?.code,
        meta: (error as any)?.meta,
      });
      return [];
    }
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
    const { professionalIds, userId, ...rest } = createProjectDto;
    // Strip legacy professionalId from the data object so Prisma does not see an unknown field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { professionalId: _legacyField, ...projectData } = rest as any;

    // Backward compatibility: allow single professionalId in payload
    const ids: string[] = Array.isArray(professionalIds)
      ? professionalIds.filter(Boolean)
      : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyId = (createProjectDto as any).professionalId;
    if (legacyId && !ids.includes(legacyId)) ids.push(legacyId);

    // Validate professional IDs
    if (!ids || ids.length === 0) {
      throw new Error('At least one professional ID is required');
    }

    // Debug: log invitation targets (safe for troubleshooting)
    // eslint-disable-next-line no-console
    console.log('[ProjectsService.create] inviting professionals:', ids);

    // Fetch all professionals for email
    const professionals = await this.prisma.professional.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, fullName: true, businessName: true },
    });

    if (professionals.length !== ids.length) {
      // eslint-disable-next-line no-console
      console.warn('[ProjectsService.create] missing professionals', {
        requested: ids,
        found: professionals.map((p) => p.id),
      });
      throw new BadRequestException('One or more professionals not found');
    }

    // Transform userId into user relation for Prisma
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createData: any = {
      ...projectData,
      professionals: {
        create: ids.map((id) => ({
          professionalId: id,
          status: 'pending',
        })),
      },
    };

    if (userId) {
      createData.user = { connect: { id: userId } };
    }

    // Create project with all ProjectProfessional junctions
    const project = await this.prisma.project.create({
      data: createData,
      include: {
        client: true,
        professionals: {
          include: {
            professional: true,
          },
        },
      },
    });

    // Generate secure tokens and send invitation emails for each professional
    const tokenPromises: any[] = [];
    const emailPromises: any[] = [];

    for (const professional of professionals) {
      const acceptToken = createId();
      const declineToken = createId();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

      // Store tokens in database
      tokenPromises.push(
        this.prisma.emailToken.create({
          data: {
            token: acceptToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'accept',
            expiresAt,
          },
        }),
        this.prisma.emailToken.create({
          data: {
            token: declineToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'decline',
            expiresAt,
          },
        }),
      );

      // Send invitation email
      const professionalName =
        professional.fullName || professional.businessName || 'Professional';
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      emailPromises.push(
        this.emailService
          .sendProjectInvitation({
            to: professional.email,
            professionalName,
            projectName: project.projectName,
            projectDescription: project.notes || 'No description provided',
            location: project.region,
            acceptToken,
            declineToken,
            baseUrl,
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[ProjectsService.create] failed to send invite', {
              to: professional.email,
              error: err?.message,
            });
            return null;
          }),
      );
    }

    // Execute all token creations and email sends in parallel
    await Promise.all([...tokenPromises, ...emailPromises]);

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
