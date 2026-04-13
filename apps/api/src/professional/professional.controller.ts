import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { Decimal } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcrypt';
import { buildPublicAssetUrl } from '../storage/media-assets.util';
import { extractObjectKeyFromValue } from '../storage/media-assets.util';

@Controller('professional')
export class ProfessionalController {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  private resolveProfileMediaUrls(professional: any) {
    if (!professional) return professional;
    return {
      ...professional,
      profileImages: (professional.profileImages || []).map((v: string) => buildPublicAssetUrl(v)),
      referenceProjects: (professional.referenceProjects || []).map((rp: any) => ({
        ...rp,
        imageUrls: (rp.imageUrls || []).map((v: string) => buildPublicAssetUrl(v)),
      })),
    };
  }

  private resolveReferenceProjectMediaUrls(referenceProject: any) {
    if (!referenceProject) return referenceProject;
    return {
      ...referenceProject,
      imageUrls: (referenceProject.imageUrls || []).map((v: string) => buildPublicAssetUrl(v)),
    };
  }

  private normalizeQuoteSchedule(input: {
    quoteEstimatedStartAt?: string | Date | null;
    quoteEstimatedDurationMinutes?: number | string | null;
  }) {
    const rawStart = input.quoteEstimatedStartAt;
    const rawDuration = input.quoteEstimatedDurationMinutes;
    const hasStart =
      rawStart !== undefined && rawStart !== null && String(rawStart).trim().length > 0;
    const hasDuration =
      rawDuration !== undefined && rawDuration !== null && String(rawDuration).trim().length > 0;

    if (!hasStart || !hasDuration) {
      throw new BadRequestException(
        'Estimated start date and duration are required when submitting a quote',
      );
    }

    const quoteEstimatedStartAt =
      rawStart instanceof Date ? rawStart : new Date(String(rawStart));
    if (Number.isNaN(quoteEstimatedStartAt.getTime())) {
      throw new BadRequestException('Invalid estimated start date');
    }

    const durationMinutes = Number(rawDuration);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 30) {
      throw new BadRequestException(
        'Estimated duration must be at least 30 minutes',
      );
    }

    if (durationMinutes > 60 * 24 * 365) {
      throw new BadRequestException('Estimated duration is too large');
    }

    return {
      quoteEstimatedStartAt,
      quoteEstimatedDurationMinutes: Math.round(durationMinutes),
    };
  }

  private formatDurationMinutes(durationMinutes: number) {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return 'unspecified duration';
    }

    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }

    const hours = durationMinutes / 60;
    if (Number.isInteger(hours)) {
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${hours.toFixed(1).replace(/\.0$/, '')} hours`;
  }

  private normalizeUniqueStrings(values: Array<string | null | undefined>) {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const value of values) {
      const cleaned = (value || '').trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(cleaned);
    }

    return normalized;
  }

  private normalizeCsvInput(value?: string) {
    if (value === undefined) return undefined;
    const values = value.split(',').map((part) => part.trim());
    return this.normalizeUniqueStrings(values).join(', ');
  }

  private normalizeTextInput(value?: string) {
    if (value === undefined) return undefined;
    return value.trim();
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProfile(@Request() req: any) {
    const professionalId = req.user.id || req.user.sub;
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id: professionalId },
      include: {
        referenceProjects: { orderBy: { createdAt: 'desc' } },
        notificationPreferences: true,
      },
    });
    if (!professional) throw new BadRequestException('Professional not found');
    return this.resolveProfileMediaUrls(professional);
  }

  @Patch('me/notification-preferences')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateMyNotificationPreferences(
    @Request() req: any,
    @Body()
    body: {
      allowPartnerOffers?: boolean;
      allowPlatformUpdates?: boolean;
      preferredLanguage?: string;
      preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const preferredContactMethod = body.preferredContactMethod?.toUpperCase() as
      | 'EMAIL'
      | 'WHATSAPP'
      | 'SMS'
      | 'WECHAT'
      | undefined;

    if (
      preferredContactMethod &&
      !['EMAIL', 'WHATSAPP', 'SMS', 'WECHAT'].includes(preferredContactMethod)
    ) {
      throw new BadRequestException('Invalid preferred contact method');
    }

    const existing = await (this.prisma as any).notificationPreference.findUnique({
      where: { professionalId },
    });

    if (!existing) {
      return (this.prisma as any).notificationPreference.create({
        data: {
          professionalId,
          primaryChannel: preferredContactMethod ?? 'EMAIL',
          fallbackChannel: 'WHATSAPP',
          enableEmail: true,
          enableWhatsApp: true,
          enableSMS: true,
          enableWeChat: false,
          allowPartnerOffers: body.allowPartnerOffers ?? false,
          allowPlatformUpdates: body.allowPlatformUpdates ?? true,
          preferredLanguage: body.preferredLanguage ?? 'en',
        },
      });
    }

    return (this.prisma as any).notificationPreference.update({
      where: { professionalId },
      data: {
        allowPartnerOffers: body.allowPartnerOffers,
        allowPlatformUpdates: body.allowPlatformUpdates,
        preferredLanguage: body.preferredLanguage,
        ...(preferredContactMethod !== undefined
          ? { primaryChannel: preferredContactMethod }
          : {}),
      },
    });
  }

  @Put('me')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateProfile(
    @Request() req: any,
    @Body()
    body: {
      fullName?: string;
      businessName?: string;
      phone?: string;
      professionType?: string;
      serviceArea?: string;
      locationPrimary?: string;
      locationSecondary?: string;
      locationTertiary?: string;
      suppliesOffered?: string[];
      tradesOffered?: string[];
      primaryTrade?: string;
      profileImages?: string[];
      emergencyCalloutAvailable?: boolean;
    },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const normalizedProfileImages = Array.isArray(body.profileImages)
      ? body.profileImages
          .map((value) => extractObjectKeyFromValue(value))
          .filter((value) => value.length > 0)
      : undefined;

    const normalizedServiceArea = this.normalizeCsvInput(body.serviceArea);
    const normalizedTradesOffered = Array.isArray(body.tradesOffered)
      ? this.normalizeUniqueStrings(body.tradesOffered)
      : undefined;
    const normalizedSuppliesOffered = Array.isArray(body.suppliesOffered)
      ? this.normalizeUniqueStrings(body.suppliesOffered)
      : undefined;

    const data: any = {
      fullName: this.normalizeTextInput(body.fullName),
      businessName: this.normalizeTextInput(body.businessName),
      phone: this.normalizeTextInput(body.phone),
      professionType: this.normalizeTextInput(body.professionType),
      serviceArea: normalizedServiceArea,
      locationPrimary: this.normalizeTextInput(body.locationPrimary),
      locationSecondary: this.normalizeTextInput(body.locationSecondary),
      locationTertiary: this.normalizeTextInput(body.locationTertiary),
      suppliesOffered: normalizedSuppliesOffered,
      tradesOffered: normalizedTradesOffered,
      primaryTrade: this.normalizeTextInput(body.primaryTrade),
      profileImages: normalizedProfileImages,
      emergencyCalloutAvailable: body.emergencyCalloutAvailable,
    };
    // Remove undefined to avoid overwriting
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    const updated = await (this.prisma as any).professional.update({
      where: { id: professionalId },
      data,
    });
    return updated;
  }

  @Put('me/password')
  @UseGuards(AuthGuard('jwt-professional'))
  async updatePassword(@Request() req: any, @Body() body: { password?: string }) {
    const professionalId = req.user.id || req.user.sub;
    if (!body?.password || body.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const hashedPassword = await bcrypt.hash(body.password, 10);
    const updated = await (this.prisma as any).professional.update({
      where: { id: professionalId },
      data: { passwordHash: hashedPassword },
      select: { id: true, email: true, fullName: true, updatedAt: true },
    });
    return updated;
  }

  @Get('projects')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProfessionalProjects(@Request() req: any) {
    try {
      const professionalId = req.user.id || req.user.sub;

      const projectProfessionals = await (
        this.prisma as any
      ).projectProfessional.findMany({
        where: {
          professionalId,
          project: {
            status: { not: 'archived' },
          },
        },
        include: {
          project: {
            select: {
              id: true,
              projectName: true,
              clientName: true,
              region: true,
              budget: true,
              notes: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Attach unread message count per project (client -> professional unread)
      const withUnread = await Promise.all(
        projectProfessionals.map(async (pp: any) => {
          const unreadCount = await (this.prisma as any).message
            .count({
              where: {
                projectProfessionalId: pp.id,
                senderType: 'client',
                readByProfessionalAt: null,
              },
            })
            .catch(() => 0);
          return { ...pp, unreadCount };
        }),
      );

      return withUnread;
    } catch (error) {
      console.error('Error fetching professional projects:', error);
      throw error;
    }
  }

  @Get('reference-projects')
  @UseGuards(AuthGuard('jwt-professional'))
  async listReferenceProjects(@Request() req: any) {
    const professionalId = req.user.id || req.user.sub;
    const projects = await (this.prisma as any).professionalReferenceProject.findMany({
      where: { professionalId },
      orderBy: { createdAt: 'desc' },
    });
    return projects.map((project: any) => this.resolveReferenceProjectMediaUrls(project));
  }

  @Post('reference-projects')
  @UseGuards(AuthGuard('jwt-professional'))
  async createReferenceProject(
    @Request() req: any,
    @Body() body: { title: string; description?: string; imageUrls?: string[] },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;
      const normalizedImageUrls = (body.imageUrls || [])
        .map((value) => extractObjectKeyFromValue(value))
        .filter((value) => value.length > 0);
      console.log('[createReferenceProject] req.user:', req.user);
      console.log('[createReferenceProject] professionalId:', professionalId);
      if (!professionalId) {
        throw new BadRequestException('Professional ID not found in auth token');
      }
      if (!body.title || !body.title.trim()) {
        throw new BadRequestException('Title is required');
      }
      const created = await (this.prisma as any).professionalReferenceProject.create({
        data: {
          professionalId,
          title: body.title.trim(),
          description: body.description?.trim() || null,
          imageUrls: normalizedImageUrls,
        },
      });
      return this.resolveReferenceProjectMediaUrls(created);
    } catch (error) {
      console.error('[createReferenceProject] Error:', error instanceof Error ? error.message : error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException((error as any)?.message || 'Failed to create reference project');
    }
  }

  @Put('reference-projects/:id')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateReferenceProject(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string; imageUrls?: string[] },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;
      const normalizedImageUrls = body.imageUrls
        ? body.imageUrls
            .map((value) => extractObjectKeyFromValue(value))
            .filter((value) => value.length > 0)
        : undefined;
      if (!professionalId) {
        throw new BadRequestException('Professional ID not found in auth token');
      }
      const existing = await (this.prisma as any).professionalReferenceProject.findFirst({
        where: { id, professionalId },
      });
      if (!existing) throw new BadRequestException('Reference project not found');
      const updated = await (this.prisma as any).professionalReferenceProject.update({
        where: { id },
        data: {
          title: body.title?.trim() || existing.title,
          description:
            body.description === undefined
              ? existing.description
              : body.description?.trim() || null,
          imageUrls: normalizedImageUrls ?? existing.imageUrls,
        },
      });
      return this.resolveReferenceProjectMediaUrls(updated);
    } catch (error) {
      console.error('[updateReferenceProject] Error:', error instanceof Error ? error.message : error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException((error as any)?.message || 'Failed to update reference project');
    }
  }

  @Delete('reference-projects/:id')
  @UseGuards(AuthGuard('jwt-professional'))
  async deleteReferenceProject(@Request() req: any, @Param('id') id: string) {
    try {
      const professionalId = req.user.id || req.user.sub;
      if (!professionalId) {
        throw new BadRequestException('Professional ID not found in auth token');
      }
      const existing = await (this.prisma as any).professionalReferenceProject.findFirst({
        where: { id, professionalId },
      });
      if (!existing) throw new BadRequestException('Reference project not found');
      await (this.prisma as any).professionalReferenceProject.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      console.error('[deleteReferenceProject] Error:', error instanceof Error ? error.message : error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException((error as any)?.message || 'Failed to delete reference project');
    }
  }

  @Get('messages/unread-count')
  @UseGuards(AuthGuard('jwt-professional'))
  async getUnreadCount(@Request() req: any) {
    const professionalId = req.user.id || req.user.sub;
    const count = await (this.prisma as any).message.count({
      where: {
        senderType: 'client',
        readByProfessionalAt: null,
        projectProfessional: {
          professionalId,
          project: {
            status: { not: 'archived' },
          },
        },
      },
    });
    return { unreadCount: count };
  }

  @Get('projects/:projectProfessionalId')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProjectDetail(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
          project: {
            status: { not: 'archived' },
          },
        },
        include: {
          project: {
            include: {
              aiIntake: {
                select: {
                  id: true,
                  assumptions: true,
                  risks: true,
                  project: true,
                },
              },
            },
          },
          paymentRequests: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      return projectProfessional;
    } catch (error) {
      console.error('Error fetching project detail:', error);
      throw error;
    }
  }

  @Post('projects/:projectProfessionalId/quote')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async submitQuote(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body()
    body: {
      quoteAmount: number | string;
      quoteNotes?: string;
      quoteEstimatedStartAt?: string;
      quoteEstimatedDurationMinutes?: number | string;
    },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
        },
        include: {
          project: {
            select: {
              isEmergency: true,
            },
          },
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const quoteAmount = parseFloat(String(body.quoteAmount));
      if (isNaN(quoteAmount) || quoteAmount < 0) {
        throw new BadRequestException('Invalid quote amount');
      }
      const quoteSchedule = this.normalizeQuoteSchedule({
        quoteEstimatedStartAt: body.quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes: body.quoteEstimatedDurationMinutes,
      });

      if (projectProfessional.quotedAt) {
        throw new BadRequestException('You have already submitted a quote for this project');
      }

      const inviteCreatedAt = projectProfessional.createdAt
        ? new Date(projectProfessional.createdAt)
        : null;
      const quoteWindowMs = projectProfessional.project?.isEmergency
        ? 12 * 60 * 60 * 1000
        : 3 * 24 * 60 * 60 * 1000;

      if (inviteCreatedAt) {
        const extendedUntil = projectProfessional.quoteExtendedUntil
          ? new Date(projectProfessional.quoteExtendedUntil)
          : null;
        const quoteDeadline = extendedUntil ?? new Date(inviteCreatedAt.getTime() + quoteWindowMs);
        if (new Date() > quoteDeadline) {
          throw new BadRequestException(
            projectProfessional.project?.isEmergency
              ? 'Initial quote window closed (12 hours from invitation)'
              : 'Initial quote window closed (3 days from invitation)',
          );
        }
      }

      await (this.prisma as any).projectProfessional.update({
        where: { id: projectProfessionalId },
        data: {
          quoteAmount: quoteAmount,
          quoteNotes: body.quoteNotes || '',
          quoteEstimatedStartAt: quoteSchedule.quoteEstimatedStartAt,
          quoteEstimatedDurationMinutes:
            quoteSchedule.quoteEstimatedDurationMinutes,
          quotedAt: new Date(),
          status: 'quoted',
          respondedAt: projectProfessional.respondedAt || new Date(),
        },
      });

      const updated = await (this.prisma as any).projectProfessional.findUnique({
        where: { id: projectProfessionalId },
        include: {
          project: { include: { user: true } },
          professional: true,
        },
      });

      if (!updated) {
        throw new BadRequestException('Failed to load updated quote record');
      }

      // Create a message to notify the client in-app
      await (this.prisma as any).message.create({
        data: {
          projectProfessionalId,
          senderType: 'professional',
          senderProfessionalId: professionalId,
          content: `We have submitted a quotation${isNaN(quoteAmount) ? '' : ` for HK$${quoteAmount.toLocaleString?.() ?? quoteAmount}`} starting ${quoteSchedule.quoteEstimatedStartAt.toLocaleString()} for ${this.formatDurationMinutes(quoteSchedule.quoteEstimatedDurationMinutes)}.`,
        },
      });

      // Send email notification to client (best-effort; ignore if email not configured)
      try {
        const baseUrl =
          process.env.WEB_BASE_URL ||
          process.env.FRONTEND_BASE_URL ||
          process.env.APP_WEB_URL ||
          'https://fitouthub-web.vercel.app';

        const clientEmail = updated.project?.user?.email;
        if (clientEmail) {
          await this.email.sendQuoteSubmitted({
            to: clientEmail,
            clientName:
              updated.project?.user?.firstName ||
              updated.project?.clientName ||
              'Client',
            professionalName:
              updated.professional?.fullName ||
              updated.professional?.businessName ||
              'A professional',
            projectName: updated.project?.projectName || 'Your Project',
            quoteAmount: Number(quoteAmount) || 0,
            projectId: updated.project?.id,
            baseUrl,
          });
        }
      } catch (e) {
        console.warn('Failed to send quote submitted email:', e);
      }

      try {
        await (this.prisma as any).activityLog.create({
          data: {
            professionalId,
            actorName:
              updated.professional?.fullName ||
              updated.professional?.businessName ||
              updated.professional?.email ||
              'Professional',
            actorType: 'professional',
            action: 'quote_submitted',
            resource: 'Project',
            resourceId: updated.project?.id || projectProfessional.projectId,
            details: `Submitted quote for ${updated.project?.projectName || 'project'}`,
            metadata: {
              projectProfessionalId,
              quoteAmount: Number(quoteAmount) || 0,
            },
            status: 'success',
          },
        });
      } catch (e) {
        console.error('[ProfessionalController.submitQuote] Failed to write activity log:', (e as any)?.message);
      }

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error submitting quote:', error);
      throw error;
    }
  }

  @Post('projects/:projectProfessionalId/accept')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async acceptProject(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
        },
        include: {
          project: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const updated = await (this.prisma as any).$transaction(async (tx: any) => {
        // Update project professional status
        const updatedPP = await tx.projectProfessional.update({
          where: { id: projectProfessionalId },
          data: {
            status: 'accepted',
            respondedAt: new Date(),
          },
          include: {
            project: true,
          },
        });

        // Create financial transactions for quotation acceptance
        const quoteAmount = projectProfessional.quoteAmount 
          ? new Decimal(projectProfessional.quoteAmount.toString()) 
          : new Decimal(0);

        if (quoteAmount.greaterThan(0)) {
          // Transaction 1: Quotation accepted notification (info status)
          const quoteTx = await tx.financialTransaction.create({
            data: {
              projectId: projectProfessional.projectId,
              projectProfessionalId,
              type: 'quotation_accepted',
              description: `Quotation accepted from ${projectProfessional.project?.contractorName || 'Professional'}`,
              amount: quoteAmount,
              status: 'info', // informational, not actionable
              requestedBy: professionalId,
              requestedByRole: 'professional',
              actionBy: professionalId,
              actionByRole: 'professional',
              actionComplete: true,
            },
          });

          // Persist approved budget + award pointers on project
          await tx.project.update({
            where: { id: projectProfessional.projectId },
            data: {
              approvedBudget: quoteAmount,
              approvedBudgetTxId: quoteTx.id,
              awardedProjectProfessionalId: projectProfessionalId,
              escrowRequired: quoteAmount,
            },
          });

          // Transaction 2: Escrow deposit request (pending until client confirms payment) - from FOH
          const project = projectProfessional.project;
          const clientId = project?.clientId || project?.userId;
          await tx.financialTransaction.create({
            data: {
              projectId: projectProfessional.projectId,
              projectProfessionalId,
              type: 'escrow_deposit_request',
              description: `Request to deposit project fees to escrow`,
              amount: quoteAmount,
              status: 'pending',
              requestedBy: 'foh',
              requestedByRole: 'platform',
              actionBy: clientId,
              actionByRole: 'client',
              actionComplete: false,
              notes: `Quote amount for project ${project?.projectName || 'Project'}`,
            },
          });
        }

        return updatedPP;
      });

      try {
        await (this.prisma as any).activityLog.create({
          data: {
            professionalId,
            actorName: req.user?.fullName || req.user?.email || 'Professional',
            actorType: 'professional',
            action: 'project_invitation_accepted',
            resource: 'ProjectProfessional',
            resourceId: projectProfessionalId,
            details: `Accepted project invitation for ${projectProfessional.project?.projectName || 'project'}`,
            metadata: {
              projectId: projectProfessional.projectId,
              projectProfessionalId,
            },
            status: 'success',
          },
        });
      } catch (e) {
        console.error('[ProfessionalController.acceptProject] Failed to write activity log:', (e as any)?.message);
      }

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error accepting project:', error);
      throw error;
    }
  }

  @Post('projects/:projectProfessionalId/reject')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async rejectProject(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const updated = await (this.prisma as any).projectProfessional.update({
        where: { id: projectProfessionalId },
        data: {
          status: 'rejected',
          respondedAt: new Date(),
        },
      });

      try {
        await (this.prisma as any).activityLog.create({
          data: {
            professionalId,
            actorName: req.user?.fullName || req.user?.email || 'Professional',
            actorType: 'professional',
            action: 'project_invitation_rejected',
            resource: 'ProjectProfessional',
            resourceId: projectProfessionalId,
            details: 'Declined project invitation',
            metadata: {
              projectProfessionalId,
            },
            status: 'info',
          },
        });
      } catch (e) {
        console.error('[ProfessionalController.rejectProject] Failed to write activity log:', (e as any)?.message);
      }

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error rejecting project:', error);
      throw error;
    }
  }

  // Messages: list with pagination (default 30 newest)
  @Get('projects/:projectProfessionalId/messages')
  @UseGuards(AuthGuard('jwt-professional'))
  async getMessages(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const professionalId = req.user.id || req.user.sub;

    const projectProfessional = await (
      this.prisma as any
    ).projectProfessional.findFirst({
      where: { id: projectProfessionalId, professionalId },
    });
    if (!projectProfessional) {
      throw new BadRequestException('Project not found');
    }

    const messages = await (this.prisma as any).message.findMany({
      where: { projectProfessionalId },
      orderBy: { createdAt: 'asc' },
      take: 100, // initial cap; client will show first 30 and allow more
    });
    return { messages };
  }

  // Messages: send from professional
  @Post('projects/:projectProfessionalId/messages')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: { content: string },
  ) {
    const professionalId = req.user.id || req.user.sub;
    if (!body?.content || body.content.trim().length === 0) {
      throw new BadRequestException('Message content is required');
    }

    const projectProfessional = await (
      this.prisma as any
    ).projectProfessional.findFirst({
      where: { id: projectProfessionalId, professionalId },
    });
    if (!projectProfessional) {
      throw new BadRequestException('Project not found');
    }

    const message = await (this.prisma as any).message.create({
      data: {
        projectProfessionalId,
        senderType: 'professional',
        senderProfessionalId: professionalId,
        content: body.content.trim(),
      },
    });
    return { success: true, message };
  }

  // Messages: mark client messages as read by professional
  @Post('projects/:projectProfessionalId/messages/mark-read')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async markMessagesRead(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const professionalId = req.user.id || req.user.sub;
    const projectProfessional = await (
      this.prisma as any
    ).projectProfessional.findFirst({
      where: { id: projectProfessionalId, professionalId },
    });
    if (!projectProfessional) {
      throw new BadRequestException('Project not found');
    }

    await (this.prisma as any).message.updateMany({
      where: {
        projectProfessionalId,
        senderType: 'client',
        readByProfessionalAt: null,
      },
      data: { readByProfessionalAt: new Date() },
    });
    return { success: true };
  }

  // Request advance payment for upfront costs
  @Post('projects/:projectProfessionalId/advance-payment-request')
  @UseGuards(AuthGuard('jwt-professional'))
  async requestAdvancePayment(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: { 
      requestType?: 'fixed' | 'percentage'; 
      paymentMilestoneId?: string;
      amount?: number; 
      percentage?: number;
      notes?: string;
    },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this is the professional's project and it's awarded
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: { 
          id: projectProfessionalId, 
          professionalId,
          status: 'awarded',
        },
        include: {
          project: {
            include: {
              user: true,
            },
          },
          professional: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException(
          'Project not found or not awarded to you',
        );
      }

      const paymentPlan = await (this.prisma as any).projectPaymentPlan.findUnique({
        where: { projectId: projectProfessional.projectId },
        include: {
          milestones: {
            orderBy: { sequence: 'asc' },
          },
        },
      });

      // Allow multiple payment requests; no invoice dependency

      // Validate request
      const quoteAmount = Number(projectProfessional.quoteAmount || 0);
      const now = new Date();
      const trimmedNotes = String(body.notes || '').trim();

      let requestType: string | undefined = body.requestType;
      let requestAmount = 0;
      let requestPercentage: number | null = null;
      let requestNotes = trimmedNotes || null;
      let requestDescription = 'Payment request';
      let emailRequestType: string = body.requestType || 'fixed';
      let milestoneUpdateData: Record<string, any> | null = null;

      if (body.paymentMilestoneId) {
        if (!paymentPlan) {
          throw new BadRequestException('No payment plan exists for this project');
        }

        if (!['locked', 'active'].includes(paymentPlan.status)) {
          throw new BadRequestException('Payment plan must be locked or active before requesting milestone payments');
        }

        const milestone = paymentPlan.milestones.find((item: any) => item.id === body.paymentMilestoneId);
        if (!milestone) {
          throw new BadRequestException('Selected milestone was not found on this payment plan');
        }

        if (paymentPlan.escrowFundingPolicy === 'ROLLING_TWO_MILESTONES' && milestone.status !== 'escrow_funded') {
          throw new BadRequestException('This milestone is not yet funded in escrow for release');
        }

        if (!['scheduled', 'escrow_funded'].includes(milestone.status)) {
          throw new BadRequestException('This milestone is not currently eligible for a payment request');
        }

        const plannedDueAt = milestone.plannedDueAt ? new Date(milestone.plannedDueAt) : null;
        const requestDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const dueDay = plannedDueAt
          ? new Date(plannedDueAt.getFullYear(), plannedDueAt.getMonth(), plannedDueAt.getDate()).getTime()
          : null;
        const timingStatus =
          dueDay == null
            ? 'on_time'
            : requestDay < dueDay
              ? 'early'
              : requestDay > dueDay
                ? 'late'
                : 'on_time';

        const milestoneMeta = {
          paymentMilestoneId: milestone.id,
          paymentPlanId: paymentPlan.id,
          milestoneSequence: milestone.sequence,
          milestoneTitle: milestone.title,
          timingStatus,
          plannedDueAt: plannedDueAt ? plannedDueAt.toISOString() : null,
        };

        requestType = 'milestone';
        emailRequestType = 'milestone';
        requestAmount = Number(milestone.amount || 0);
        requestPercentage = typeof milestone.percentOfTotal === 'number' ? milestone.percentOfTotal : null;
        requestDescription = `Milestone payment request: ${milestone.title}${requestPercentage ? ` (${requestPercentage}%)` : ''}`;
        requestNotes = [
          trimmedNotes || null,
          `Milestone: ${milestone.title}`,
          plannedDueAt ? `Planned due: ${plannedDueAt.toISOString()}` : null,
          `Timing: ${timingStatus}`,
          `__FOH_MILESTONE__${JSON.stringify(milestoneMeta)}`,
        ]
          .filter(Boolean)
          .join(' | ');

        milestoneUpdateData = {
          status: 'release_requested',
          releaseRequestedAt: now,
          adminComment:
            timingStatus === 'late'
              ? 'Late milestone request submitted; schedule extension review may be required.'
              : null,
        };
      } else if (body.requestType === 'fixed') {
        if (!body.amount || body.amount <= 0) {
          throw new BadRequestException('Invalid amount');
        }
        if (quoteAmount > 0 && body.amount > quoteAmount) {
          throw new BadRequestException(
            'Amount cannot exceed quote total',
          );
        }
        requestAmount = body.amount;
      } else if (body.requestType === 'percentage') {
        if (!body.percentage || body.percentage <= 0 || body.percentage > 100) {
          throw new BadRequestException('Percentage must be between 1 and 100');
        }
        requestAmount = (quoteAmount * body.percentage) / 100;
        requestPercentage = body.percentage;
        requestDescription = `Payment request (${body.percentage}%)`;
      } else {
        throw new BadRequestException('Invalid request type');
      }

      // Create payment request in PaymentRequest table
      const paymentRequest = await (
        this.prisma as any
      ).paymentRequest.create({
        data: {
          projectProfessionalId,
          requestType: requestType || 'fixed',
          requestAmount,
          requestPercentage: requestPercentage ?? undefined,
          status: 'pending',
          notes: requestNotes,
        },
      });

      // Also create a FinancialTransaction for visibility in financials view
      const decimalAmount = new Decimal(requestAmount.toString());
      const clientId = projectProfessional.project?.clientId || projectProfessional.project?.userId;
      await (this.prisma as any).financialTransaction.create({
        data: {
          projectId: projectProfessional.projectId,
          projectProfessionalId,
          type: 'payment_request',
          description: requestDescription,
          amount: decimalAmount,
          status: 'pending',
          requestedBy: professionalId,
          requestedByRole: 'professional',
          actionBy: clientId,
          actionByRole: 'client',
          actionComplete: false,  // Pending client approval
          notes: requestNotes || `Payment request for project milestone`,
        },
      });

      if (milestoneUpdateData && body.paymentMilestoneId) {
        await (this.prisma as any).paymentMilestone.update({
          where: { id: body.paymentMilestoneId },
          data: milestoneUpdateData,
        });
      }

      // Send notification to client
      const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';
      const professionalName = projectProfessional.professional.fullName ||
        projectProfessional.professional.businessName ||
        'Professional';
      const clientEmail = projectProfessional.project.user?.email;

      if (clientEmail) {
        await this.email.sendAdvancePaymentRequestNotification({
          to: clientEmail,
          clientName: projectProfessional.project.clientName,
          professionalName,
          projectName: projectProfessional.project.projectName,
          requestType: emailRequestType,
          requestAmount: `$${requestAmount.toFixed(2)}`,
          requestPercentage: requestPercentage ?? undefined,
          invoiceAmount: `$${quoteAmount.toFixed(2)}`,
          projectUrl: `${webBaseUrl}/projects/${projectProfessional.project.id}`,
        });
      }

      // Add system message to chat
      await (this.prisma as any).message.create({
        data: {
          projectProfessionalId,
          senderType: 'professional',
          senderProfessionalId: professionalId,
          content: body.paymentMilestoneId
            ? `💰 Milestone payment requested: $${requestAmount.toFixed(2)} for ${requestDescription}.${requestNotes?.includes('Timing: late') ? ' ⚠️ Submitted after the planned milestone date; schedule review may be required.' : ''}`
            : `💰 Payment requested: ${body.requestType === 'percentage' ? `${body.percentage}% (` : ''}$${requestAmount.toFixed(2)}${body.requestType === 'percentage' ? ')' : ''} for upfront costs. Fitout Hub will review and contact the client.`,
        },
      });

      return { success: true, paymentRequest };
    } catch (err) {
      console.error('[ProfessionalController.requestAdvancePayment] Error:', err);
      throw err;
    }
  }

  // ─── B.2: Rolling policy milestone funding request ───────────────────────

  /**
   * POST /professional/projects/:projectProfessionalId/payment-plan/milestones/:milestoneId/request-funding
   *
   * For ROLLING_TWO_MILESTONES projects only.
   * Professional (or platform on their behalf) requests that the client fund the
   * next milestone window into escrow.
   *
   * Transitions: milestone scheduled → escrow_requested
   * Creates:     FinancialTransaction type=escrow_deposit_request with milestone metadata
   */
  @Post('projects/:projectProfessionalId/payment-plan/milestones/:milestoneId/request-funding')
  @UseGuards(AuthGuard('jwt-professional'))
  async requestMilestoneFunding(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: { notes?: string },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      const projectProfessional = await (this.prisma as any).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
          status: 'awarded',
        },
        include: {
          project: { include: { user: true } },
          professional: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found or not awarded to you');
      }

      const paymentPlan = await (this.prisma as any).projectPaymentPlan.findUnique({
        where: { projectId: projectProfessional.projectId },
        include: {
          milestones: { orderBy: { sequence: 'asc' } },
        },
      });

      if (!paymentPlan) {
        throw new BadRequestException('No payment plan exists for this project');
      }

      if (paymentPlan.escrowFundingPolicy !== 'ROLLING_TWO_MILESTONES') {
        throw new BadRequestException(
          'Funding requests only apply to ROLLING_TWO_MILESTONES projects; all escrow is held upfront for this project',
        );
      }

      if (!['locked', 'active'].includes(paymentPlan.status)) {
        throw new BadRequestException('Payment plan must be locked or active to request milestone funding');
      }

      const milestone = paymentPlan.milestones.find((m: any) => m.id === milestoneId);
      if (!milestone) {
        throw new BadRequestException('Milestone not found on this payment plan');
      }

      if (milestone.status !== 'scheduled') {
        throw new BadRequestException(
          `Milestone is already in status '${milestone.status}' and cannot be funding-requested again`,
        );
      }

      const now = new Date();
      const milestoneMeta = {
        paymentMilestoneId: milestone.id,
        paymentPlanId: paymentPlan.id,
        milestoneSequence: milestone.sequence,
        milestoneTitle: milestone.title,
        context: 'funding_request',
        plannedDueAt: milestone.plannedDueAt ? new Date(milestone.plannedDueAt).toISOString() : null,
      };

      const trimmedNotes = String(body.notes || '').trim();
      const transactionNotes = [
        trimmedNotes || null,
        `Milestone: ${milestone.title}`,
        milestone.plannedDueAt ? `Planned due: ${new Date(milestone.plannedDueAt).toISOString()}` : null,
        `__FOH_MILESTONE__${JSON.stringify(milestoneMeta)}`,
      ]
        .filter(Boolean)
        .join(' | ');

      // Create the escrow deposit request transaction (client will pay from the project page)
      const clientId = projectProfessional.project?.clientId || projectProfessional.project?.userId;
      const transaction = await (this.prisma as any).financialTransaction.create({
        data: {
          projectId: projectProfessional.projectId,
          projectProfessionalId,
          type: 'escrow_deposit_request',
          description: `Escrow funding request for milestone: ${milestone.title} (${typeof milestone.percentOfTotal === 'number' ? `${milestone.percentOfTotal}%` : 'progress payment'})`,
          amount: milestone.amount,
          status: 'pending',
          requestedBy: professionalId,
          requestedByRole: 'professional',
          actionBy: clientId || null,
          actionByRole: 'client',
          actionComplete: false,
          notes: transactionNotes,
        },
      });

      // Transition milestone to escrow_requested
      await (this.prisma as any).paymentMilestone.update({
        where: { id: milestoneId },
        data: {
          status: 'escrow_requested',
          escrowRequestedAt: now,
        },
      });

      // Chat message
      await (this.prisma as any).message.create({
        data: {
          projectProfessionalId,
          senderType: 'professional',
          senderProfessionalId: professionalId,
          content: `📋 Escrow funding requested for milestone ${milestone.sequence}: "${milestone.title}" — HK$${Number(milestone.amount).toLocaleString()}. The client will be asked to fund this milestone window before work proceeds.`,
        },
      }).catch(() => void 0);

      return {
        success: true,
        transactionId: transaction.id,
        milestoneId: milestone.id,
        milestoneStatus: 'escrow_requested',
      };
    } catch (err) {
      console.error('[ProfessionalController.requestMilestoneFunding] Error:', err);
      throw err;
    }
  }
}
