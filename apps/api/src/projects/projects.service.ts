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
    'withdrawn',
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

  private dedupeProfessionals(list: any[] | undefined | null): any[] {
    if (!Array.isArray(list) || list.length === 0) return [];
    const map = new Map<string, unknown>();
    for (const entry of list) {
      const e = entry;
      const key = (e?.professional?.id ||
        e?.professional?.email ||
        e?.id) as string;
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...e });
      } else {
        const merged: any = { ...(existing as any) };
        merged.status =
          this.betterStatus((existing as any)?.status, e?.status) ??
          e?.status ??
          (existing as any)?.status;
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

  private normalizePhotos(
    photos?: Array<{ url?: string; note?: string }> | null,
    legacyUrls?: string[] | null,
  ): Array<{ url: string; note?: string }> {
    const result: Array<{ url: string; note?: string }> = [];
    if (Array.isArray(photos)) {
      for (const p of photos) {
        if (!p) continue;
        const url = typeof p.url === 'string' ? p.url.trim() : '';
        if (!url) continue;
        result.push({ url, note: typeof p.note === 'string' ? p.note : undefined });
      }
    }
    if (Array.isArray(legacyUrls)) {
      for (const u of legacyUrls) {
        const url = typeof u === 'string' ? u.trim() : '';
        if (!url) continue;
        // Avoid duplicates
        if (!result.some((p) => p.url === url)) {
          result.push({ url });
        }
      }
    }
    return result;
  }

  async findCanonical(clientId?: string) {
    try {
      const projects = (await this.prisma.project.findMany({
        // Frontend passes the authenticated user's id via `clientId`
        // Include projects where either `clientId` or `userId` matches
        where: clientId
          ? {
              OR: [{ clientId: clientId }, { userId: clientId }],
            }
          : undefined,
        include: {
          client: true,
          professionals: {
            include: { professional: true },
          },
          photos: true,
        },
      })) as any[];

      const byKey = new Map<string, unknown>();
      for (const p of projects) {
        const proj = p;
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
          const existing_proj = existing as any;
          const mergedPros = [
            ...(existing_proj.professionals ?? []),
            ...(proj.professionals ?? []),
          ];
          existing_proj.professionals = this.dedupeProfessionals(mergedPros);
          existing_proj.sourceIds = Array.from(
            new Set([...(existing_proj.sourceIds ?? []), String(proj.id)]),
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
        message: error?.message,
        code: error?.code,
        meta: error?.meta,
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
          photos: true,
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
        photos: true,
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

  async inviteProfessionals(projectId: string, professionalIds: string[]) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const ids = Array.isArray(professionalIds)
      ? professionalIds.filter(Boolean)
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('At least one professionalId is required');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    const professionals = await this.prisma.professional.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, fullName: true, businessName: true },
    });
    if (professionals.length === 0) {
      throw new BadRequestException('No professionals found for given ids');
    }

    // Create or ensure ProjectProfessional relations (update status to 'pending' if exists)
    const junctionPromises = professionals.map((pro) =>
      this.prisma.projectProfessional.upsert({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId: pro.id,
          },
        },
        update: { status: 'pending' },
        create: {
          projectId,
          professionalId: pro.id,
          status: 'pending',
        },
      }),
    );

    await Promise.all(junctionPromises);

    // Generate tokens and send emails
    const tokenPromises: any[] = [];
    const emailPromises: any[] = [];
    for (const professional of professionals) {
      const acceptToken = createId();
      const declineToken = createId();
      const authToken = createId();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const authExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for auth token

      tokenPromises.push(
        this.prisma.emailToken.create({
          data: {
            token: acceptToken,
            projectId,
            professionalId: professional.id,
            action: 'accept',
            expiresAt,
          },
        }),
        this.prisma.emailToken.create({
          data: {
            token: declineToken,
            projectId,
            professionalId: professional.id,
            action: 'decline',
            expiresAt,
          },
        }),
        this.prisma.emailToken.create({
          data: {
            token: authToken,
            projectId,
            professionalId: professional.id,
            action: 'auth',
            expiresAt: authExpiresAt,
          },
        }),
      );

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
            authToken,
            projectId,
            baseUrl,
          })
          .catch((err) => {
            console.error(
              '[ProjectsService.inviteProfessionals] failed to send invite',
              {
                to: professional.email,
                error: err?.message,
              },
            );
            return null;
          }),
      );
    }

    await Promise.all([...tokenPromises, ...emailPromises]);

    return { success: true, invitedCount: professionals.length };
  }

  // Mark professionals as selected for a project without invitations
  async selectProfessionals(projectId: string, professionalIds: string[]) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const ids = Array.isArray(professionalIds)
      ? professionalIds.filter(Boolean)
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('At least one professionalId is required');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    const results: any[] = [];
    for (const proId of ids) {
      const existing = await this.prisma.projectProfessional
        .findUnique({
          where: {
            projectId_professionalId: { projectId, professionalId: proId },
          },
        })
        .catch(() => null);

      if (!existing) {
        const created = await this.prisma.projectProfessional.create({
          data: {
            projectId,
            professionalId: proId,
            status: 'selected',
          },
        });
        results.push(created);
      } else {
        // Preserve existing status if they have already been invited/responded
        // Otherwise mark as selected for visibility in the UI
        if (!existing.respondedAt && existing.status === 'pending') {
          const updated = await this.prisma.projectProfessional.update({
            where: { id: existing.id },
            data: { status: 'selected' },
          });
          results.push(updated);
        } else {
          results.push(existing);
        }
      }
    }

    return {
      ok: true,
      count: results.length,
      items: this.dedupeProfessionals(results),
    } as any;
  }

  async create(createProjectDto: CreateProjectDto) {
    const { professionalIds, userId, photos, photoUrls, ...rest } = createProjectDto;
    // Strip legacy professionalId from the data object so Prisma does not see an unknown field

    const { professionalId: _legacyField, ...projectData } = rest as any;

    const normalizedPhotos = this.normalizePhotos(photos, photoUrls);

    // Backward compatibility: allow single professionalId in payload
    const ids: string[] = Array.isArray(professionalIds)
      ? professionalIds.filter(Boolean)
      : [];

    const legacyId = (createProjectDto as any).professionalId;
    if (legacyId && !ids.includes(legacyId)) ids.push(legacyId);

    // Professional IDs are optional - projects can be created without selecting professionals yet
    // Professionals can be invited after project creation

    // Debug: log invitation targets (safe for troubleshooting)
    if (ids.length > 0) {
      console.log('[ProjectsService.create] inviting professionals:', ids);
    }

    // Fetch professionals for email (if any)
    let professionals: any[] = [];
    if (ids.length > 0) {
      professionals = await this.prisma.professional.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, fullName: true, businessName: true },
      });

      if (professionals.length !== ids.length) {
        console.warn('[ProjectsService.create] missing professionals', {
          requested: ids,
          found: professionals.map((p) => p.id),
        });
        throw new BadRequestException('One or more professionals not found');
      }
    }

    // Transform userId into user relation for Prisma
    // Normalize date fields if provided
    const normalized: any = { ...projectData };
    if (typeof normalized.startDate === 'string' && normalized.startDate) {
      normalized.startDate = new Date(normalized.startDate);
    }
    if (typeof normalized.endDate === 'string' && normalized.endDate) {
      normalized.endDate = new Date(normalized.endDate);
    }

    const createData: any = {
      ...normalized,
      professionals: {
        create: ids.map((id) => ({
          professionalId: id,
          status: 'pending',
        })),
      },
    };

    if (normalizedPhotos.length > 0) {
      createData.photos = {
        create: normalizedPhotos.map((p) => ({ url: p.url, note: p.note })),
      };
    }

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
        photos: true,
      },
    });

    // Generate secure tokens and send invitation emails for each professional
    const tokenPromises: any[] = [];
    const emailPromises: any[] = [];

    for (const professional of professionals) {
      const acceptToken = createId();
      const declineToken = createId();
      const authToken = createId();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      const authExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for auth token

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
        this.prisma.emailToken.create({
          data: {
            token: authToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'auth',
            expiresAt: authExpiresAt,
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
            authToken,
            projectId: project.id,
            baseUrl,
          })
          .catch((err) => {
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
    const { photos, photoUrls, ...rest } = updateProjectDto;
    const hasPhotoUpdate = photos !== undefined || photoUrls !== undefined;
    const normalizedPhotos = hasPhotoUpdate
      ? this.normalizePhotos(photos, photoUrls)
      : [];

    // Normalize dates if provided
    if (typeof (rest as any).startDate === 'string' && (rest as any).startDate) {
      (rest as any).startDate = new Date((rest as any).startDate);
    }
    if (typeof (rest as any).endDate === 'string' && (rest as any).endDate) {
      (rest as any).endDate = new Date((rest as any).endDate);
    }

    return this.prisma.$transaction(async (tx) => {
      if (hasPhotoUpdate) {
        await tx.projectPhoto.deleteMany({ where: { projectId: id } });
        if (normalizedPhotos.length > 0) {
          await tx.projectPhoto.createMany({
            data: normalizedPhotos.map((p) => ({ projectId: id, url: p.url, note: p.note })),
          });
        }
      }

      const project = await tx.project.update({
        where: { id },
        data: rest,
        include: {
          client: true,
          professionals: {
            include: {
              professional: true,
            },
          },
          photos: true,
        },
      });

      return {
        ...project,
        professionals: this.dedupeProfessionals((project as any).professionals),
      } as any;
    });
  }

  /**
   * Get S3 client for Cloudflare R2
   */
  private getS3Client() {
    try {
      const { S3Client } = require('@aws-sdk/client-s3');
      
      const accountId = process.env.STORAGE_ACCOUNT_ID;
      const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
      const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

      if (!accountId || !accessKeyId || !secretAccessKey) {
        console.warn('Storage credentials not configured');
        return null;
      }

      return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } catch (error) {
      console.error('Failed to initialize S3 client:', error);
      return null;
    }
  }

  /**
   * Delete a specific photo and remove it from Cloudflare R2
   */
  async deletePhoto(projectId: string, photoId: string) {
    // Get photo to extract filename
    const photo = await this.prisma.projectPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new BadRequestException('Photo not found');
    }

    if (photo.projectId !== projectId) {
      throw new BadRequestException('Photo does not belong to this project');
    }

    try {
      // Extract filename from URL
      const url = photo.url;
      const filename = url.split('/').pop();
      
      if (filename) {
        // Delete from Cloudflare R2
        const s3 = this.getS3Client();
        if (s3) {
          try {
            const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
            const bucket = process.env.STORAGE_BUCKET;
            
            if (bucket) {
              await s3.send(
                new DeleteObjectCommand({
                  Bucket: bucket,
                  Key: filename,
                }),
              );
            }
          } catch (s3Error) {
            console.error('Failed to delete from R2:', s3Error);
            // Continue - delete from DB even if R2 delete fails
          }
        }
      }

      // Delete from database
      await this.prisma.projectPhoto.delete({
        where: { id: photoId },
      });

      return { success: true, photoId };
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw new BadRequestException('Failed to delete photo');
    }
  }

  /**
   * Update a photo's note
   */
  async updatePhoto(projectId: string, photoId: string, note?: string) {
    const photo = await this.prisma.projectPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new BadRequestException('Photo not found');
    }

    if (photo.projectId !== projectId) {
      throw new BadRequestException('Photo does not belong to this project');
    }

    return this.prisma.projectPhoto.update({
      where: { id: photoId },
      data: { note: note || null },
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
        professional.fullName || professional.businessName || 'Professional';
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

  async validateMagicAuthToken(token: string) {
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
    });

    if (!emailToken) {
      throw new Error('Invalid or expired token');
    }

    if (emailToken.action !== 'auth') {
      throw new Error('Invalid token type');
    }

    if (new Date() > emailToken.expiresAt) {
      throw new Error('This link has expired');
    }

    const professional = await this.prisma.professional.findUnique({
      where: { id: emailToken.professionalId },
    });

    if (!professional) {
      throw new Error('Professional not found');
    }

    return {
      professional,
      projectId: emailToken.projectId,
      professionalId: emailToken.professionalId,
    };
  }

  async getAcceptTokenForMagicLink(magicToken: string) {
    // Find the auth token to get projectId and professionalId
    const authToken = await this.prisma.emailToken.findUnique({
      where: { token: magicToken },
    });

    if (!authToken) {
      return null;
    }

    // Find the corresponding accept token for same project/professional
    const acceptToken = await this.prisma.emailToken.findFirst({
      where: {
        projectId: authToken.projectId,
        professionalId: authToken.professionalId,
        action: 'accept',
      },
    });

    return acceptToken || null;
  }

  async submitQuote(
    projectId: string,
    professionalId: string,
    quoteAmount: number,
    quoteNotes?: string,
  ) {
    // Verify professional has accepted this project
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
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
      });

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
    const clientEmail =
      projectProfessional.project.clientId || 'client@example.com'; // TODO: Get real client email
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

  async awardQuote(projectId: string, professionalId: string) {
    // Verify ProjectProfessional relationship exists and has a quote
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
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
              professionals: {
                include: { professional: true },
              },
            },
          },
          professional: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (!projectProfessional.quotedAt) {
      throw new Error('Professional has not submitted a quote yet');
    }

    // Update this professional's status to "awarded"
    const awarded = await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        status: 'awarded',
      },
      include: {
        professional: true,
        project: {
          include: {
            client: true,
          },
        },
      },
    });

    // Create invoice for the awarded project
    await this.prisma.invoice.create({
      data: {
        projectProfessionalId: awarded.id,
        amount: projectProfessional.quoteAmount || 0,
        paymentStatus: 'pending',
      },
    });

    const project = projectProfessional.project;
    const professionals = project.professionals;
    const winnerName =
      projectProfessional.professional.fullName ||
      projectProfessional.professional.businessName ||
      'Professional';
    const clientName = project.clientName;

    // Send winner notification

    console.log('[ProjectsService.awardQuote] Notifying winner:', {
      projectId,
      professionalId,
      email: projectProfessional.professional.email,
    });

    await this.emailService.sendWinnerNotification({
      to: projectProfessional.professional.email,
      professionalName: winnerName,
      projectName: project.projectName,
      quoteAmount: projectProfessional.quoteAmount?.toString() || '0',
      nextStepsMessage:
        'The client will contact you soon to discuss next steps. You can share your contact details or continue communicating via the platform for transparency and project management.',
    });

    // Send escrow notification to professional
    const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';
    await this.emailService.sendEscrowNotification({
      to: projectProfessional.professional.email,
      professionalName: winnerName,
      projectName: project.projectName,
      invoiceAmount: `$${projectProfessional.quoteAmount?.toString() || '0'}`,
      projectUrl: `${webBaseUrl}/professional-projects/${awarded.id}`,
    });

    // Send notifications to non-declined, non-awarded professionals
    const otherProfessionals = professionals.filter(
      (pp: any) =>
        pp.professionalId !== professionalId && pp.status !== 'declined',
    );

    const emailPromises = otherProfessionals.map((pp: any) =>
      this.emailService
        .sendLoserNotification({
          to: pp.professional.email,
          professionalName:
            pp.professional.fullName ||
            pp.professional.businessName ||
            'Professional',
          projectName: project.projectName,
          winnerName,
          thankYouMessage:
            'Thank you for your time and effort on this project. We hope to work with you on future opportunities.',
        })
        .catch((err) => {
          console.error(
            '[ProjectsService.awardQuote] Failed to send loser notification',
            {
              to: pp.professional.email,
              error: err?.message,
            },
          );
          return null;
        }),
    );

    await Promise.all(emailPromises);

    // Add system messages to project chat
    // Winner message
    await this.prisma.message.create({
      data: {
        projectProfessionalId: projectProfessional.id,
        senderType: 'client',
        senderClientId: project.clientId,
        content: `✓ Quote awarded. ${clientName} has selected your quote. Next steps will be discussed via the platform or direct contact.`,
      },
    });

    // Loser messages
    for (const pp of otherProfessionals) {
      // Update status to declined for non-awarded professionals
      try {
        await this.prisma.projectProfessional.update({
          where: { id: pp.id },
          data: { status: 'declined' },
        });
      } catch (err) {
        console.error(
          '[ProjectsService.awardQuote] Failed to update loser status to declined',
          {
            projectProfessionalId: pp.id,
            error: (err as Error)?.message,
          },
        );
      }
      await this.prisma.message.create({
        data: {
          projectProfessionalId: pp.id,
          senderType: 'client',
          senderClientId: project.clientId,
          content: `Thank you for your quote on "${project.projectName}". Another professional was selected for this project. We appreciate your time and hope to work with you in the future.`,
        },
      });
    }

    return awarded;
  }

  async shareContact(
    projectId: string,
    professionalId: string,
    clientId?: string,
  ) {
    // Verify ProjectProfessional relationship exists and quote is awarded
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: {
            include: {
              user: true,
              client: true,
            },
          },
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (projectProfessional.status !== 'awarded') {
      throw new Error('Quote must be awarded before sharing contact details');
    }

    // Update ProjectProfessional to mark contact shared
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        directContactShared: true,
        directContactSharedAt: new Date(),
      },
    });

    const project = projectProfessional.project;
    const professional = projectProfessional.professional;
    const clientName = project.user
      ? `${project.user.firstName} ${project.user.surname}`.trim()
      : project.clientName;
    const clientPhone = project.user?.mobile || 'Not provided';
    const professionalName =
      professional.fullName || professional.businessName || 'Professional';

    // Send notification email to professional with client contact
    await this.emailService.sendContactShared({
      to: professional.email,
      professionalName,
      clientName,
      clientPhone,
      projectName: project.projectName,
    });

    // Return professional contact to client
    return {
      success: true,
      professional: {
        name: professionalName,
        phone: professional.phone,
        email: professional.email,
      },
    };
  }

  async counterRequest(projectId: string, professionalId: string) {
    // Verify ProjectProfessional exists and has a quote
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (!projectProfessional.quotedAt) {
      throw new Error('Professional has not submitted a quote yet');
    }

    // Update status to counter_requested
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        status: 'counter_requested',
      },
    });

    const project = projectProfessional.project;
    const professional = projectProfessional.professional;
    const professionalName =
      professional.fullName || professional.businessName || 'Professional';

    // Send notification email to professional
    await this.emailService.sendCounterRequest({
      to: professional.email,
      professionalName,
      projectName: project.projectName,
      currentQuote: projectProfessional.quoteAmount?.toString() || '0',
    });

    // Add system message
    await this.prisma.message.create({
      data: {
        projectProfessionalId: projectProfessional.id,
        senderType: 'client',
        senderClientId: project.clientId,
        content: `The client has requested a better offer. Please review and submit an updated quote if possible.`,
      },
    });

    return {
      success: true,
      message: 'Counter-request sent to professional',
    };
  }

  async updateQuote(
    projectId: string,
    professionalId: string,
    quoteAmount: number,
    quoteNotes?: string,
  ) {
    // Verify ProjectProfessional exists
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    // Update quote
    const updated = await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        quoteAmount,
        quoteNotes,
        quotedAt: new Date(),
        status: 'quoted', // Reset to quoted for client review
      },
      include: {
        professional: true,
      },
    });

    // Add system message
    await this.prisma.message.create({
      data: {
        projectProfessionalId: projectProfessional.id,
        senderType: 'professional',
        senderProfessionalId: professionalId,
        content: `Updated quote: $${quoteAmount}${quoteNotes ? ` - ${quoteNotes}` : ''}`,
      },
    });

    return {
      success: true,
      message: 'Quote updated successfully',
      projectProfessional: updated,
    };
  }

  async updateProjectSchedule(
    projectId: string,
    startDate?: string,
    endDate?: string,
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Update schedule fields
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });

    return {
      success: true,
      message: 'Schedule updated successfully',
      project: updated,
    };
  }

  async updateContractorContact(
    projectId: string,
    name?: string,
    phone?: string,
    email?: string,
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Update contractor contact fields
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        contractorContactName: name,
        contractorContactPhone: phone,
        contractorContactEmail: email,
      },
    });

    return {
      success: true,
      message: 'Contractor contact updated successfully',
      project: updated,
    };
  }

  async withdrawProject(projectId: string, userId: string) {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        client: true,
        professionals: {
          include: { professional: true },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found or not authorized');
    }

    const hasAwarded = project.professionals?.some(
      (pp: any) => pp.status === 'awarded',
    );
    if (hasAwarded) {
      throw new Error('Project already awarded; cannot withdraw');
    }

    const toNotify = (project.professionals || []).filter((pp: any) => {
      if (pp.status === 'awarded') return false;
      if (pp.status === 'accepted' || pp.status === 'quoted' || pp.status === 'counter_requested') return true;
      if (pp.createdAt && pp.createdAt >= cutoff) return true;
      return false;
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'withdrawn' },
    });

    await this.prisma.projectProfessional.updateMany({
      where: {
        projectId,
        status: { in: ['pending', 'accepted', 'quoted', 'counter_requested'] },
      },
      data: { status: 'withdrawn' },
    });

    // Notify professionals via email and system message
    await Promise.all(
      toNotify.map(async (pp: any) => {
        const professionalName =
          pp.professional.fullName || pp.professional.businessName || 'Professional';

        await this.prisma.message.create({
          data: {
            projectProfessionalId: pp.id,
            senderType: 'client',
            senderClientId: project.clientId,
            content:
              '🚫 Project withdrawn by client. Thank you for your participation.',
          },
        });

        try {
          await this.emailService.sendProjectWithdrawnNotification({
            to: pp.professional.email,
            professionalName,
            projectName: project.projectName,
          });
        } catch (err) {
          console.error('[ProjectsService.withdrawProject] Email failed', {
            to: pp.professional.email,
            error: (err as Error)?.message,
          });
        }
      }),
    );

    return { success: true, status: 'withdrawn' };
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
    const matches =
      notes.match(/(https?:\/\/[^\s,;]+|\/uploads\/[^\s,;]+)/g) || [];

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

  async payInvoice(projectId: string, userId: string) {
    // Verify user owns this project
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        professionals: {
          where: { status: 'awarded' },
          include: {
            invoice: true,
            professional: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found or not authorized');
    }

    const awardedProfessional = project.professionals[0];
    if (!awardedProfessional) {
      throw new Error('No awarded professional found for this project');
    }

    if (!awardedProfessional.invoice) {
      throw new Error('No invoice found for this project');
    }

    if (awardedProfessional.invoice.paymentStatus === 'paid') {
      throw new Error('Invoice already paid');
    }

    // Update invoice payment status
    const updatedInvoice = await this.prisma.invoice.update({
      where: { id: awardedProfessional.invoice.id },
      data: {
        paymentStatus: 'paid',
        paidAt: new Date(),
      },
    });

    // Add system message to chat
    await this.prisma.message.create({
      data: {
        projectProfessionalId: awardedProfessional.id,
        senderType: 'client',
        senderClientId: project.clientId,
        content: `✓ Invoice paid! $${awardedProfessional.invoice.amount.toString()} has been deposited into Fitout Hub's escrow account. Funds will be released according to project milestones.`,
      },
    });

    console.log('[ProjectsService.payInvoice] Invoice paid:', {
      projectId,
      invoiceId: updatedInvoice.id,
      amount: updatedInvoice.amount.toString(),
    });

    return { success: true, invoice: updatedInvoice };
  }}