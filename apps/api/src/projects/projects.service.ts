import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { ChatService } from '../chat/chat.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { resolve } from 'path';
import { promises as fs } from 'fs';
import { createId } from '@paralleldrive/cuid2';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { ProjectStage } from '@prisma/client';
import { NotificationChannel } from '@prisma/client';

type NotificationDeliveryStatus = 'sent' | 'failed' | 'skipped';
type NotificationActorType = 'professional' | 'client' | 'reseller' | 'platform' | 'unknown';

interface NotificationAuditRecipient {
  actorType: NotificationActorType;
  actorId: string;
  role: string;
  email: {
    status: NotificationDeliveryStatus;
    error?: string;
  };
  direct: {
    status: NotificationDeliveryStatus;
    preferredChannel?: NotificationChannel | null;
    channel?: NotificationChannel | null;
    reason?: string;
    error?: string;
  };
}

interface NotificationAuditEvent {
  event: string;
  projectId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  recipients: NotificationAuditRecipient[];
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private chatService: ChatService,
    private notificationService: NotificationService,
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

  private readonly ARCHIVED_STATUS = 'archived';
  private readonly PROJECT_SELECTABLE_PROFESSION_TYPES = ['contractor', 'company'] as const;

  private createNotificationAudit(
    event: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): NotificationAuditEvent {
    return {
      event,
      projectId,
      timestamp: new Date().toISOString(),
      metadata,
      recipients: [],
    };
  }

  private pushNotificationAuditRecipient(
    audit: NotificationAuditEvent,
    recipient: NotificationAuditRecipient,
  ): void {
    audit.recipients.push(recipient);
  }

  private async finalizeNotificationAudit(audit: NotificationAuditEvent): Promise<void> {
    const summary = {
      recipients: audit.recipients.length,
      email: {
        sent: audit.recipients.filter((r) => r.email.status === 'sent').length,
        failed: audit.recipients.filter((r) => r.email.status === 'failed').length,
        skipped: audit.recipients.filter((r) => r.email.status === 'skipped').length,
      },
      direct: {
        sent: audit.recipients.filter((r) => r.direct.status === 'sent').length,
        failed: audit.recipients.filter((r) => r.direct.status === 'failed').length,
        skipped: audit.recipients.filter((r) => r.direct.status === 'skipped').length,
      },
    };

    console.log('[ProjectsService.notificationAudit]', {
      ...audit,
      summary,
    });

    try {
      await (this.prisma as any).activityLog.create({
        data: {
          actorName: 'System',
          actorType: 'system',
          action: 'notification_audit',
          resource: 'Project',
          resourceId: audit.projectId,
          details: `Notification audit for ${audit.event}`,
          metadata: {
            ...audit,
            summary,
          },
          status: summary.email.failed > 0 || summary.direct.failed > 0 ? 'warning' : 'success',
        },
      });
    } catch (error) {
      console.error('[ProjectsService.notificationAudit] Failed to persist activity log:', {
        event: audit.event,
        projectId: audit.projectId,
        message: (error as any)?.message,
      });
    }
  }

  private async getProjectSelectableProfessionals(ids: string[]) {
    const professionals = await this.prisma.professional.findMany({
      where: {
        id: { in: ids },
        professionType: { in: [...this.PROJECT_SELECTABLE_PROFESSION_TYPES] },
      },
      select: { id: true, email: true, phone: true, fullName: true, businessName: true },
    });

    if (professionals.length !== ids.length) {
      throw new BadRequestException(
        'Only company and contractor professionals can be selected for projects',
      );
    }

    return professionals;
  }

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

  private formatDateTime(value?: Date | string | null): string {
    if (!value) return 'TBD';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return 'TBD';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private async addProjectChatMessage(
    projectId: string,
    senderType: 'client' | 'professional',
    senderUserId: string | null,
    senderProId: string | null,
    content: string,
  ): Promise<void> {
    const thread = await this.chatService.getOrCreateProjectThread(projectId);
    await this.chatService.addProjectMessage(
      thread.id,
      senderType,
      senderUserId,
      senderProId,
      content,
    );
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

  async findCanonical(userId?: string) {
    try {
      const projects = (await this.prisma.project.findMany({
        // Frontend passes the authenticated user's id
        // Only check userId (clientId is legacy)
        where: userId
          ? {
              userId: userId,
              status: { not: this.ARCHIVED_STATUS },
            }
          : {
              status: { not: this.ARCHIVED_STATUS },
            },
        include: {

          professionals: {
            include: { professional: true },
          },
          photos: true,
        },
      })) as any[];

      const byKey = new Map<string, unknown>();
      for (const p of projects) {
        const proj = p;
        const key = userId
          ? `${userId}|${this.canon(proj.projectName)}`
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
  
  async findAllForClient(userId: string) {
    try {
      // Step 1: Basic query without includes (to check if data exists)
      // NOTE: Only checking userId now (clientId is legacy and never set for new projects)
      const basicProjects = await this.prisma.project.findMany({
        where: {
          userId: userId,
          status: { not: this.ARCHIVED_STATUS },
        },
        select: {
          id: true,
          projectName: true,
          clientId: true,
          userId: true,
          status: true,
        },
      });

      if (basicProjects.length === 0) {
        return [];
      }

      // Step 2: Now fetch full projects with includes
      let projects;
      try {
        projects = await this.prisma.project.findMany({
          where: {
            id: { in: basicProjects.map(p => p.id) },
          },
          include: {

            professionals: {
              include: {
                professional: true,
              },
            },
            photos: true,
          },
        });
      } catch (includesError) {
        // Fallback to basic projects if includes fail (handles schema mismatch issues)
        console.error('[ProjectsService.findAllForClient] Warning: includes query failed, returning basic projects:', includesError?.message);
        projects = basicProjects;
      }

      try {
        const mapped = projects.map((p: any) => {
          try {
            return {
              ...p,
              professionals: this.dedupeProfessionals(p.professionals),
            };
          } catch (mapError) {
            return {
              ...p,
              professionals: [],
            };
          }
        });
        return mapped;
      } catch (mapError) {
        console.error('[ProjectsService.findAllForClient] Error in map operation:', mapError?.message);
        return projects as any[];
      }
    } catch (error) {
      console.error('[ProjectsService.findAllForClient] Database error:', error?.message);
      return [];
    }
  }

  async findOne(id: string) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id },
        include: {

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
    } catch (error) {
      console.error('[ProjectsService.findOne] Error:', error?.message, error?.stack);
      return null;
    }
  }

  async findOneForClient(id: string, userId: string) {
    try {
      console.log('[ProjectsService.findOneForClient] Fetching project:', id, 'for userId:', userId);
      const project = await this.prisma.project.findFirst({
        where: {
          id,
          userId: userId,
          status: { not: this.ARCHIVED_STATUS },
        },
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          photos: true,
        },
      });
      console.log('[ProjectsService.findOneForClient] Project found:', !!project);
      if (!project) return null;
      return {
        ...project,
        professionals: this.dedupeProfessionals((project as any).professionals),
      } as any;
    } catch (error) {
      console.error('[ProjectsService.findOneForClient] Error:', error?.message, error?.stack);
      return null;
    }
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
      ? Array.from(new Set(professionalIds.filter(Boolean)))
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('At least one professionalId is required');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    const professionals = await this.getProjectSelectableProfessionals(ids);
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

    const junctionResults = await Promise.all(junctionPromises);

    // Create invitation messages for each professional
    const messagePromises = junctionResults.map(async (projectProfessional) => {
      const professional = professionals.find(p => p.id === projectProfessional.professionalId);
      if (!professional) return;

      const tradesText = project.tradesRequired && project.tradesRequired.length > 0
        ? `Trades Required: ${project.tradesRequired.join(', ')}`
        : 'Trades: To be discussed';

      const timelineText = project.endDate 
        ? `Timeline: Needed by ${new Date(project.endDate).toLocaleDateString()}`
        : 'Timeline: Flexible';

      const invitationMessage = `📋 Project Invitation: ${project.projectName}

You've been invited to submit a quote for this project.

${tradesText}
Region: ${project.region}
${timelineText}

Please review the project details and respond with your quote or decline the invitation.`;

      return this.prisma.message.create({
        data: {
          projectProfessionalId: projectProfessional.id,
          senderType: 'client',
          senderClientId: project.userId || project.clientId,
          content: invitationMessage,
        },
      });
    });

    await Promise.all(messagePromises);

    // Generate tokens for all professionals in parallel (no rate limit concern)
    const tokenData: Array<{ professional: typeof professionals[0]; acceptToken: string; declineToken: string; authToken: string }> = [];
    const tokenPromises: any[] = [];

    for (const professional of professionals) {
      const acceptToken = createId();
      const declineToken = createId();
      const authToken = createId();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const authExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      tokenData.push({ professional, acceptToken, declineToken, authToken });

      tokenPromises.push(
        this.prisma.emailToken.create({ data: { token: acceptToken, projectId, professionalId: professional.id, action: 'accept', expiresAt } }),
        this.prisma.emailToken.create({ data: { token: declineToken, projectId, professionalId: professional.id, action: 'decline', expiresAt } }),
        this.prisma.emailToken.create({ data: { token: authToken, projectId, professionalId: professional.id, action: 'auth', expiresAt: authExpiresAt } }),
      );
    }

    await Promise.all(tokenPromises);

    // Send notifications sequentially — 1.1s gap between emails to respect Resend free-tier rate limit (1 req/s)
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const notificationAudit = this.createNotificationAudit(
      'project_invitation_notifications',
      projectId,
      { invitedCount: tokenData.length },
    );

    for (let i = 0; i < tokenData.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }

      const { professional, acceptToken, declineToken, authToken } = tokenData[i];
      const professionalName = professional.fullName || professional.businessName || 'Professional';
      const recipientAudit: NotificationAuditRecipient = {
        actorType: 'professional',
        actorId: professional.id,
        role: 'invitee',
        email: { status: 'skipped' },
        direct: { status: 'skipped' },
      };

      // Always send email (carries accept/decline token links)
      try {
        await this.emailService.sendProjectInvitation({
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
        });
        recipientAudit.email.status = 'sent';
      } catch (err) {
        recipientAudit.email.status = 'failed';
        recipientAudit.email.error = err?.message;
        console.error('[ProjectsService.inviteProfessionals] email failed', { to: professional.email, error: err?.message });
      }

      // Also send WhatsApp/SMS if professional has a non-email primary channel and a phone number
      if (professional.phone) {
        try {
          const preference = await this.prisma.notificationPreference.findUnique({
            where: { professionalId: professional.id },
            select: {
              primaryChannel: true,
              fallbackChannel: true,
              enableWhatsApp: true,
              enableSMS: true,
            },
          });
          const preferredChannel = preference?.primaryChannel;
          const fallbackChannel = preference?.fallbackChannel;

          const isMessagingChannel = (channel?: NotificationChannel | null) =>
            channel === NotificationChannel.WHATSAPP ||
            channel === NotificationChannel.SMS;

          const isChannelEnabled = (channel?: NotificationChannel | null) => {
            if (!channel) return false;
            if (channel === NotificationChannel.WHATSAPP) {
              return preference?.enableWhatsApp ?? true;
            }
            if (channel === NotificationChannel.SMS) {
              return preference?.enableSMS ?? true;
            }
            return false;
          };

          let directChannel: NotificationChannel | null = null;
          if (
            isMessagingChannel(preferredChannel) &&
            isChannelEnabled(preferredChannel)
          ) {
            directChannel = preferredChannel as NotificationChannel;
          } else if (
            isMessagingChannel(fallbackChannel) &&
            isChannelEnabled(fallbackChannel)
          ) {
            directChannel = fallbackChannel as NotificationChannel;
          } else if (!preference) {
            directChannel = NotificationChannel.WHATSAPP;
          }

          recipientAudit.direct.preferredChannel = preferredChannel;
          recipientAudit.direct.channel = directChannel;

          if (directChannel) {
            const shortMsg = `📋 New project invitation: "${project.projectName}" in ${project.region}. Check your email or log in to respond.`;
            const sendResult = await this.notificationService.send({
              professionalId: professional.id,
              phoneNumber: professional.phone,
              channel: directChannel,
              eventType: 'project_invitation',
              message: shortMsg,
            });

            if (sendResult.success) {
              recipientAudit.direct.status = 'sent';
            } else {
              recipientAudit.direct.status = 'failed';
              recipientAudit.direct.error =
                sendResult.error || 'Direct invitation notification failed';
            }
          } else {
            recipientAudit.direct.status = 'skipped';
            recipientAudit.direct.reason = preference
              ? 'no_enabled_messaging_channel'
              : 'missing_notification_preference';
          }
        } catch (err) {
          recipientAudit.direct.status = 'failed';
          recipientAudit.direct.error = err?.message;
          console.error('[ProjectsService.inviteProfessionals] WhatsApp/SMS failed', { professionalId: professional.id, error: err?.message });
        }
      } else {
        recipientAudit.direct.status = 'skipped';
        recipientAudit.direct.reason = 'missing_phone';
      }

      this.pushNotificationAuditRecipient(notificationAudit, recipientAudit);
    }

    await this.finalizeNotificationAudit(notificationAudit);

    return { success: true, invitedCount: professionals.length };
  }

  // Mark professionals as selected for a project without invitations
  async selectProfessionals(projectId: string, professionalIds: string[]) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const ids = Array.isArray(professionalIds)
      ? Array.from(new Set(professionalIds.filter(Boolean)))
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('At least one professionalId is required');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    await this.getProjectSelectableProfessionals(ids);

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
      ? Array.from(new Set(professionalIds.filter(Boolean)))
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
      professionals = await this.getProjectSelectableProfessionals(ids);
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
      currentStage: ids.length > 0 ? ProjectStage.BIDDING_ACTIVE : ProjectStage.CREATED,
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

        professionals: {
          include: {
            professional: true,
          },
        },
        photos: true,
      },
    });

    // Create invitation messages for each professional
    if (professionals.length > 0 && project.professionals.length > 0) {
      const messagePromises = project.professionals.map(async (projectProfessional) => {
        const professional = professionals.find(p => p.id === projectProfessional.professionalId);
        if (!professional) return;

        const budgetText = project.budget 
          ? `Budget: HK$${project.budget.toLocaleString()}`
          : 'Budget: TBD';
        
        const tradesText = project.tradesRequired && project.tradesRequired.length > 0
          ? `Trades Required: ${project.tradesRequired.join(', ')}`
          : 'Trades: To be discussed';

        const timelineText = project.endDate 
          ? `Timeline: Needed by ${new Date(project.endDate).toLocaleDateString()}`
          : 'Timeline: Flexible';

        const invitationMessage = `📋 Project Invitation: ${project.projectName}

You've been invited to submit a quote for this project.

${budgetText}
${tradesText}
Region: ${project.region}
${timelineText}

Please review the project details and respond with your quote or decline the invitation.`;

        return this.prisma.message.create({
          data: {
            projectProfessionalId: projectProfessional.id,
            senderType: 'client',
            senderClientId: project.userId || project.clientId,
            content: invitationMessage,
          },
        });
      });

      await Promise.all(messagePromises);
    }

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

  /**
   * Create a financial transaction for a project
   */
  async createFinancialTransaction(
    projectId: string,
    data: {
      type: string;
      description: string;
      amount: string;
      status: string;
      requestedBy?: string;
      requestedByRole?: string;
      actionBy?: string;
      actionByRole?: string;
      projectProfessionalId?: string;
    },
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const amount = new Decimal(data.amount);

    return this.prisma.financialTransaction.create({
      data: {
        projectId,
        projectProfessionalId: data.projectProfessionalId || null,
        type: data.type,
        description: data.description,
        amount,
        status: data.status,
        requestedBy: data.requestedBy,
        requestedByRole: data.requestedByRole,
        actionBy: data.actionBy,
        actionByRole: data.actionByRole,
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

    const projectProfessional = await this.prisma.projectProfessional.findUnique({
      where: {
        projectId_professionalId: {
          projectId: emailToken.projectId,
          professionalId: emailToken.professionalId,
        },
      },
      select: { id: true },
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
      projectProfessionalId: projectProfessional?.id,
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
              user: {
                select: {
                  id: true,
                  email: true,
                },
              },
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

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const hasApprovedAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);
    const isVisitScheduled =
      latestAccessRequest?.status === 'approved_visit_scheduled';
    const hasVisited =
      !!latestAccessRequest?.visitedAt || latestAccessRequest?.status === 'visited';
    const isRemoteQuote = !hasApprovedAccess || (isVisitScheduled && !hasVisited);
    const visitApprovedButNotDone = isVisitScheduled && !hasVisited;

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
        visitApprovedButNotDone,
      },
    });

    if (latestAccessRequest) {
      await this.prisma.siteAccessRequest.update({
        where: { id: latestAccessRequest.id },
        data: {
          quoteCreatedAfterAccess: true,
          quoteIsRemote: isRemoteQuote,
        },
      });
    }

    // Notify client
    const clientActorId =
      projectProfessional.project.user?.id ||
      projectProfessional.project.userId ||
      projectProfessional.project.clientId ||
      'unknown-client';
    const clientEmail = projectProfessional.project.user?.email || 'client@example.com';
    const professionalName =
      projectProfessional.professional.fullName ||
      projectProfessional.professional.businessName ||
      'Professional';
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const notificationAudit = this.createNotificationAudit(
      'quote_submitted_notifications',
      projectId,
      {
        professionalId,
        projectProfessionalId: projectProfessional.id,
      },
    );

    const clientAudit: NotificationAuditRecipient = {
      actorType: 'client',
      actorId: clientActorId,
      role: 'quote_submit_recipient',
      email: { status: 'skipped' },
      direct: {
        status: 'skipped',
        reason: 'not_implemented_client_direct_notification',
      },
    };

    try {
      await this.emailService.sendQuoteSubmitted({
        to: clientEmail,
        clientName: projectProfessional.project.clientName,
        professionalName,
        projectName: projectProfessional.project.projectName,
        quoteAmount,
        projectId,
        baseUrl,
      });
      clientAudit.email.status = 'sent';
    } catch (error) {
      clientAudit.email.status = 'failed';
      clientAudit.email.error = error?.message;
      this.pushNotificationAuditRecipient(notificationAudit, clientAudit);
      await this.finalizeNotificationAudit(notificationAudit);
      throw error;
    }

    this.pushNotificationAuditRecipient(notificationAudit, clientAudit);
    await this.finalizeNotificationAudit(notificationAudit);

    return {
      success: true,
      message: 'Quote submitted successfully',
      quoteAmount,
      quoteIsRemote: isRemoteQuote,
    };
  }

  private async assertClientProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const isOwner =
      (project.userId && project.userId === userId) ||
      (project.clientId && project.clientId === userId) ||
      (!project.userId && !project.clientId);

    if (!isOwner) {
      throw new BadRequestException('You do not have access to this project');
    }

    return project;
  }

  async requestSiteAccess(projectId: string, professionalId: string) {
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
        },
      });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    if (!['pending', 'accepted', 'quoted', 'awarded'].includes(projectProfessional.status)) {
      throw new BadRequestException('Professional must be invited to request site access');
    }

    const existingRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: {
          in: ['pending', 'approved_visit_scheduled'],
        },
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    if (existingRequest) {
      return {
        success: true,
        request: existingRequest,
        message: 'A site access request is already pending',
      };
    }

    const request = await this.prisma.siteAccessRequest.create({
      data: {
        projectId,
        projectProfessionalId: projectProfessional.id,
        professionalId,
        status: 'pending',
      },
    });

    const professionalName =
      projectProfessional.professional?.businessName ||
      projectProfessional.professional?.fullName ||
      'Professional';
    await this.addProjectChatMessage(
      projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} requested site access on ${this.formatDateTime(new Date())}.`,
    );

    return {
      success: true,
      request,
    };
  }

  async submitSiteAccessData(
    projectId: string,
    userId: string,
    body: {
      addressFull: string;
      unitNumber?: string;
      floorLevel?: string;
      accessDetails?: string;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
    },
  ) {
    await this.assertClientProjectAccess(projectId, userId);

    if (!body.addressFull) {
      throw new BadRequestException('Address is required');
    }

    const data = await this.prisma.siteAccessData.upsert({
      where: { projectId },
      create: {
        projectId,
        addressFull: body.addressFull,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        accessDetails: body.accessDetails,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        submittedBy: userId,
      },
      update: {
        addressFull: body.addressFull,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        accessDetails: body.accessDetails,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        lastUpdatedBy: userId,
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        siteAccessDataCollected: true,
        siteAccessDataCollectedAt: new Date(),
      },
    });

    return {
      success: true,
      data,
    };
  }

  async respondToSiteAccessRequest(
    requestId: string,
    userId: string,
    body: {
      status: 'approved_no_visit' | 'approved_visit_scheduled' | 'denied';
      visitScheduledFor?: string;
      visitScheduledAt?: string;
      reasonDenied?: string;
      addressFull?: string;
      unitNumber?: string;
      floorLevel?: string;
      accessDetails?: string;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
    },
  ) {
    const request = await this.prisma.siteAccessRequest.findUnique({
      where: { id: requestId },
      include: { project: true },
    });

    if (!request) {
      throw new BadRequestException('Site access request not found');
    }

    await this.assertClientProjectAccess(request.projectId, userId);

    if (body.status === 'approved_visit_scheduled' && !body.visitScheduledFor) {
      if (!body.visitScheduledAt) {
        throw new BadRequestException('visitScheduledAt or visitScheduledFor is required for scheduled visits');
      }
    }

    // Fetch location details to get project timezone
    const locationDetails = await this.prisma.projectLocationDetails.findUnique({
      where: { projectId: request.projectId },
    });

    const projectTimezone = locationDetails?.timezone || 'Asia/Hong_Kong';

    const parseOptionalDate = (value?: string) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    };

    // Convert local time string in a timezone to UTC
    // Example: "2024-03-01T13:00" in "Asia/Hong_Kong" timezone
    const convertLocalToUTC = (localDateTime: string, timezone: string): Date | null => {
      try {
        // Create formatter for the target timezone to get offset
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });

        // Parse the local datetime
        const localDate = new Date(localDateTime);
        if (Number.isNaN(localDate.getTime())) {
          return null;
        }

        // Get the formatted string in the target timezone
        const parts = formatter.formatToParts(localDate);
        const partsObj: Record<string, string> = {};
        parts.forEach((part) => {
          partsObj[part.type] = part.value;
        });

        // Create a date from the formatted parts
        const tzDate = new Date(
          parseInt(partsObj.year),
          parseInt(partsObj.month) - 1,
          parseInt(partsObj.day),
          parseInt(partsObj.hour),
          parseInt(partsObj.minute),
          parseInt(partsObj.second)
        );

        // Calculate offset between local and target timezone
        const offsetMs = localDate.getTime() - tzDate.getTime();
        
        // Return UTC time (add offset to get back to UTC)
        return new Date(localDate.getTime() + offsetMs);
      } catch {
        return null;
      }
    };

    if (body.status === 'denied') {
      const denied = await this.prisma.siteAccessRequest.update({
        where: { id: requestId },
        data: {
          status: 'denied',
          respondedAt: new Date(),
          clientApprovedBy: userId,
          reasonDenied: body.reasonDenied,
        },
      });

      await this.addProjectChatMessage(
        request.projectId,
        'client',
        userId,
        null,
        `Client denied site access${body.reasonDenied ? `: ${body.reasonDenied}` : '.'}`,
      );

      return {
        success: true,
        request: denied,
      };
    }

    const existingData = await this.prisma.siteAccessData.findUnique({
      where: { projectId: request.projectId },
    });

    if (!existingData && !body.addressFull) {
      throw new BadRequestException('Address is required to approve site access');
    }

    if (body.addressFull) {
      await this.prisma.siteAccessData.upsert({
        where: { projectId: request.projectId },
        create: {
          projectId: request.projectId,
          addressFull: body.addressFull,
          unitNumber: body.unitNumber,
          floorLevel: body.floorLevel,
          accessDetails: body.accessDetails,
          onSiteContactName: body.onSiteContactName,
          onSiteContactPhone: body.onSiteContactPhone,
          submittedBy: userId,
        },
        update: {
          addressFull: body.addressFull,
          unitNumber: body.unitNumber,
          floorLevel: body.floorLevel,
          accessDetails: body.accessDetails,
          onSiteContactName: body.onSiteContactName,
          onSiteContactPhone: body.onSiteContactPhone,
          lastUpdatedBy: userId,
        },
      });

      await this.prisma.project.update({
        where: { id: request.projectId },
        data: {
          siteAccessDataCollected: true,
          siteAccessDataCollectedAt: new Date(),
        },
      });
    }

    const scheduledForInput = body.visitScheduledFor?.trim();
    const scheduledAtInput = body.visitScheduledAt?.trim();

    let scheduledAt: Date | null = null;
    if (scheduledForInput || scheduledAtInput) {
      let localDateTime: string | null = null;
      
      if (scheduledForInput && scheduledAtInput) {
        const isTimeOnly = /^\d{2}:\d{2}(:\d{2})?$/.test(scheduledAtInput);
        if (isTimeOnly) {
          localDateTime = `${scheduledForInput}T${scheduledAtInput}`;
        } else {
          scheduledAt = parseOptionalDate(scheduledAtInput);
        }
      } else if (scheduledForInput) {
        localDateTime = scheduledForInput;
      } else if (scheduledAtInput) {
        const isTimeOnly = /^\d{2}:\d{2}(:\d{2})?$/.test(scheduledAtInput);
        if (isTimeOnly && !scheduledForInput) {
          throw new BadRequestException('Date is required when time is provided');
        }
        localDateTime = scheduledAtInput;
      }

      if (localDateTime && !scheduledAt) {
        scheduledAt = convertLocalToUTC(localDateTime, projectTimezone);
      }
    }

    const isValidDate = (value: Date | null) =>
      !!value && !Number.isNaN(value.getTime());

    const safeScheduledFor = scheduledAt
      ? new Date(scheduledAt.getFullYear(), scheduledAt.getMonth(), scheduledAt.getDate())
      : null;

    const safeScheduledAt = isValidDate(scheduledAt) ? scheduledAt : null;

    if (body.status === 'approved_visit_scheduled' && !safeScheduledAt) {
      throw new BadRequestException('A valid visit date/time is required for scheduled visits');
    }

    const approved = await this.prisma.siteAccessRequest.update({
      where: { id: requestId },
      data: {
        status: body.status,
        respondedAt: new Date(),
        clientApprovedBy: userId,
        reasonDenied: body.reasonDenied,
        visitScheduledFor: safeScheduledFor,
        visitScheduledAt: safeScheduledAt,
      },
    });

    if (body.status === 'approved_visit_scheduled' && safeScheduledAt) {
      await this.prisma.siteAccessVisit.create({
        data: {
          projectId: request.projectId,
          projectProfessionalId: request.projectProfessionalId,
          professionalId: request.professionalId,
          proposedAt: safeScheduledAt,
          proposedByRole: 'client',
          status: 'proposed',
        },
      });
    }

    await this.addProjectChatMessage(
      request.projectId,
      'client',
      userId,
      null,
      body.status === 'approved_no_visit'
        ? 'Client approved site access (no visit required).'
        : `Client approved site access with a proposed visit on ${this.formatDateTime(safeScheduledAt)}.`,
    );

    // Send notification to professional
    try {
      const professional = await this.prisma.professional.findUnique({
        where: { id: request.professionalId },
      });

      if (professional?.phone) {
        const project = await this.prisma.project.findUnique({
          where: { id: request.projectId },
          select: { projectName: true },
        });

        const notificationMessage = body.status === 'approved_no_visit'
          ? `Good news! Your site access request for "${project?.projectName}" has been approved. No site visit required.`
          : `Good news! Your site access request for "${project?.projectName}" has been approved with a scheduled visit on ${this.formatDateTime(safeScheduledAt)}.`;

        await this.notificationService.send({
          professionalId: professional.id,
          phoneNumber: professional.phone,
          eventType: 'site_access_approved',
          message: notificationMessage,
        });
      }
    } catch (error) {
      // Log but don't fail the request if notification fails
      console.error('Failed to send site access approval notification:', error);
    }

    return {
      success: true,
      request: approved,
    };
  }

  async confirmSiteVisit(
    requestId: string,
    professionalId: string,
    body: { visitDetails?: string },
  ) {
    const request = await this.prisma.siteAccessRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new BadRequestException('Site access request not found');
    }

    if (request.professionalId !== professionalId) {
      throw new BadRequestException('You do not have access to this request');
    }

    if (!['approved_visit_scheduled', 'approved_no_visit', 'visited'].includes(request.status)) {
      throw new BadRequestException('Site visit cannot be confirmed for this request');
    }

    const updatedRequest = await this.prisma.siteAccessRequest.update({
      where: { id: requestId },
      data: {
        status: 'visited',
        visitedAt: new Date(),
        visitDetails: body.visitDetails,
      },
    });

    await this.prisma.projectProfessional.update({
      where: { id: request.projectProfessionalId },
      data: {
        siteVisitedAt: new Date(),
        visitNotes: body.visitDetails,
        visitApprovedButNotDone: false,
      },
    });

    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
    });
    const professionalName =
      professional?.businessName || professional?.fullName || 'Professional';
    await this.addProjectChatMessage(
      request.projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} confirmed a site visit on ${this.formatDateTime(updatedRequest.visitedAt)}.`,
    );

    return {
      success: true,
      request: updatedRequest,
    };
  }

  async requestSiteVisit(
    projectId: string,
    professionalId: string,
    body: { scheduledAt: string; notes?: string },
  ) {
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is required');
    }

    const projectProfessional = await this.prisma.projectProfessional.findUnique({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      include: {
        professional: true,
      },
    });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    if (!['pending', 'accepted', 'quoted', 'awarded'].includes(projectProfessional.status)) {
      throw new BadRequestException('Professional must be invited to request a site visit');
    }

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const hasAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);

    if (!hasAccess) {
      throw new BadRequestException('Site access must be approved before requesting a visit');
    }

    const existingPending = await this.prisma.siteAccessVisit.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: 'proposed',
        proposedByRole: 'professional',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPending) {
      return {
        success: true,
        visit: existingPending,
        message: 'A site visit proposal is already pending',
      };
    }

    const latestAccepted = await this.prisma.siteAccessVisit.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: 'accepted',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestAccepted) {
      await this.prisma.siteAccessVisit.update({
        where: { id: latestAccepted.id },
        data: {
          status: 'cancelled',
          responseNotes: 'Rescheduled by professional',
        },
      });
    }

    const visit = await this.prisma.siteAccessVisit.create({
      data: {
        projectId,
        projectProfessionalId: projectProfessional.id,
        professionalId,
        proposedAt: scheduledAt,
        proposedByRole: 'professional',
        notes: body.notes,
        status: 'proposed',
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    const professionalName =
      projectProfessional.professional?.businessName ||
      projectProfessional.professional?.fullName ||
      'Professional';
    await this.addProjectChatMessage(
      projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} requested a site visit on ${this.formatDateTime(scheduledAt)}.`,
    );

    return {
      success: true,
      visit,
    };
  }

  async respondToSiteVisit(
    visitId: string,
    actorId: string,
    isProfessional: boolean,
    body: { status: 'accepted' | 'declined'; responseNotes?: string },
  ) {
    const visit = await this.prisma.siteAccessVisit.findUnique({
      where: { id: visitId },
      include: {
        project: true,
        professional: true,
      },
    });

    if (!visit) {
      throw new BadRequestException('Site visit not found');
    }

    if (visit.status !== 'proposed') {
      throw new BadRequestException('This site visit has already been responded to');
    }

    if (visit.proposedByRole === 'professional') {
      if (isProfessional) {
        throw new BadRequestException('Only clients can respond to this visit proposal');
      }
      await this.assertClientProjectAccess(visit.projectId, actorId);
    } else {
      if (!isProfessional) {
        throw new BadRequestException('Only professionals can respond to this visit proposal');
      }
      if (visit.professionalId !== actorId) {
        throw new BadRequestException('You do not have access to this visit proposal');
      }
    }

    const updated = await this.prisma.siteAccessVisit.update({
      where: { id: visitId },
      data: {
        status: body.status,
        respondedAt: new Date(),
        respondedBy: !isProfessional ? actorId : null,
        responseNotes: body.responseNotes,
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    if (body.status === 'accepted') {
      await this.prisma.projectProfessional.update({
        where: { id: visit.projectProfessionalId },
        data: {
          visitApprovedButNotDone: true,
        },
      });
    }

    const professionalName =
      visit.professional?.businessName || visit.professional?.fullName || 'Professional';
    const actorLabel = isProfessional ? professionalName : 'Client';
    await this.addProjectChatMessage(
      visit.projectId,
      isProfessional ? 'professional' : 'client',
      isProfessional ? null : actorId,
      isProfessional ? actorId : null,
      body.status === 'accepted'
        ? `${actorLabel} accepted the proposed site visit for ${this.formatDateTime(visit.proposedAt)}.`
        : `${actorLabel} declined the proposed site visit for ${this.formatDateTime(visit.proposedAt)}${body.responseNotes ? `: ${body.responseNotes}` : '.'}`,
    );

    return {
      success: true,
      visit: updated,
    };
  }

  async completeSiteVisit(
    visitId: string,
    professionalId: string,
    body: { visitDetails?: string },
  ) {
    const visit = await this.prisma.siteAccessVisit.findUnique({
      where: { id: visitId },
    });

    if (!visit) {
      throw new BadRequestException('Site visit not found');
    }

    if (visit.professionalId !== professionalId) {
      throw new BadRequestException('You do not have access to this visit');
    }

    if (visit.status !== 'accepted') {
      throw new BadRequestException('Only accepted visits can be completed');
    }

    const updated = await this.prisma.siteAccessVisit.update({
      where: { id: visitId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        responseNotes: body.visitDetails ?? visit.responseNotes,
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    await this.prisma.projectProfessional.update({
      where: { id: visit.projectProfessionalId },
      data: {
        siteVisitedAt: new Date(),
        visitNotes: body.visitDetails,
        visitApprovedButNotDone: false,
      },
    });

    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
    });
    const professionalName =
      professional?.businessName || professional?.fullName || 'Professional';
    await this.addProjectChatMessage(
      visit.projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} marked the site visit as completed on ${this.formatDateTime(updated.completedAt)}.`,
    );

    return {
      success: true,
      visit: updated,
    };
  }

  async getSiteVisits(
    projectId: string,
    actorId: string,
    isProfessional: boolean,
  ) {
    if (isProfessional) {
      const projectProfessional = await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId: actorId,
          },
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Professional is not linked to this project');
      }

      const visits = await this.prisma.siteAccessVisit.findMany({
        where: { projectProfessionalId: projectProfessional.id },
        include: { professional: true },
        orderBy: { proposedAt: 'desc' },
      });

      return { success: true, visits };
    }

    await this.assertClientProjectAccess(projectId, actorId);
    const visits = await this.prisma.siteAccessVisit.findMany({
      where: { projectId },
      include: { professional: true },
      orderBy: { proposedAt: 'desc' },
    });

    return { success: true, visits };
  }

  async getSiteAccessStatus(projectId: string, professionalId: string) {
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
      });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const hasAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);

    const siteAccessData = hasAccess
      ? await this.prisma.siteAccessData.findUnique({
          where: { projectId },
        })
      : null;

    return {
      success: true,
      requestId: latestAccessRequest?.id || null,
      requestStatus: latestAccessRequest?.status || 'none',
      visitScheduledFor: latestAccessRequest?.visitScheduledFor || null,
      visitScheduledAt: latestAccessRequest?.visitScheduledAt || null,
      visitedAt: latestAccessRequest?.visitedAt || null,
      reasonDenied: latestAccessRequest?.reasonDenied || null,
      hasAccess,
      siteAccessData,
    };
  }

  async submitLocationDetails(
    projectId: string,
    userId: string,
    body: {
      addressFull: string;
      postalCode?: string;
      gpsCoordinates?: { lat: number; lng: number };
      unitNumber?: string;
      floorLevel?: string;
      propertyType?: string;
      propertySize?: string;
      propertyAge?: string;
      accessDetails?: string;
      existingConditions?: string;
      specialRequirements?: Array<string> | Record<string, unknown>;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
      accessHoursDescription?: string;
      desiredStartDate?: string;
      photoUrls?: string[];
    },
  ) {
    const project = await this.assertClientProjectAccess(projectId, userId);

    const awardedAssignment = await this.prisma.projectProfessional.findFirst({
      where: {
        projectId,
        status: 'awarded',
      },
      select: { id: true },
    });

    const isAwardedStage = project.status === 'awarded' || !!awardedAssignment;

    const missingFields: string[] = [];

    if (!body.addressFull?.trim()) missingFields.push('Full Address');
    if (!body.unitNumber?.trim()) missingFields.push('Unit Number');
    if (!body.floorLevel?.trim()) missingFields.push('Floor Level');

    if (isAwardedStage) {
      if (!body.postalCode?.trim()) missingFields.push('Postal Code / District');
      if (!body.propertyType?.trim()) missingFields.push('Property Type');
      if (!body.propertySize?.trim()) missingFields.push('Property Size');
      if (!body.propertyAge?.trim()) missingFields.push('Property Age');
      if (!body.existingConditions?.trim()) missingFields.push('Existing Conditions');
      if (!body.accessDetails?.trim()) missingFields.push('Access Details');
      if (!body.accessHoursDescription?.trim()) missingFields.push('Access Hours');
      if (!body.onSiteContactName?.trim()) missingFields.push('On-site Contact Name');
      if (!body.onSiteContactPhone?.trim()) missingFields.push('On-site Contact Phone');
      if (!body.desiredStartDate?.trim()) missingFields.push('Desired Start Date');
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        isAwardedStage
          ? `Awarded projects require complete location details. Missing: ${missingFields.join(', ')}`
          : `Bidding stage requires basic location details. Missing: ${missingFields.join(', ')}`,
      );
    }

    if (
      project.escrowRequired &&
      project.escrowHeld &&
      new Decimal(project.escrowHeld.toString()).lessThan(
        new Decimal(project.escrowRequired.toString()),
      )
    ) {
      throw new BadRequestException('Escrow must be confirmed before submitting location details');
    }

    const details = await this.prisma.projectLocationDetails.upsert({
      where: { projectId },
      create: {
        projectId,
        addressFull: body.addressFull,
        postalCode: body.postalCode,
        gpsCoordinates: body.gpsCoordinates || undefined,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        propertyType: body.propertyType,
        propertySize: body.propertySize,
        propertyAge: body.propertyAge,
        accessDetails: body.accessDetails,
        existingConditions: body.existingConditions,
        specialRequirements: (body.specialRequirements as Prisma.InputJsonValue) || undefined,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        accessHoursDescription: body.accessHoursDescription,
        desiredStartDate: body.desiredStartDate
          ? new Date(body.desiredStartDate)
          : undefined,
        photoUrls: body.photoUrls || [],
        status: 'submitted',
        submittedBy: userId,
      },
      update: {
        addressFull: body.addressFull,
        postalCode: body.postalCode,
        gpsCoordinates: body.gpsCoordinates || undefined,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        propertyType: body.propertyType,
        propertySize: body.propertySize,
        propertyAge: body.propertyAge,
        accessDetails: body.accessDetails,
        existingConditions: body.existingConditions,
        specialRequirements: (body.specialRequirements as Prisma.InputJsonValue) || undefined,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        accessHoursDescription: body.accessHoursDescription,
        desiredStartDate: body.desiredStartDate
          ? new Date(body.desiredStartDate)
          : undefined,
        photoUrls: body.photoUrls || [],
        status: 'submitted',
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        locationDetailsStatus: 'submitted',
        locationDetailsProvidedAt: new Date(),
        locationDetailsRequiredAt: project.locationDetailsRequiredAt || new Date(),
      },
    });

    return {
      success: true,
      details,
    };
  }

  async getSiteAccessRequests(projectId: string, userId: string) {
    await this.assertClientProjectAccess(projectId, userId);

    const requests = await this.prisma.siteAccessRequest.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            fullName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
        projectProfessional: {
          select: {
            id: true,
            status: true,
            quoteAmount: true,
            quotedAt: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    const siteAccessData = await this.prisma.siteAccessData.findUnique({
      where: { projectId },
    });

    return {
      success: true,
      requests,
      siteAccessData,
    };
  }

  async confirmDepositPaid(transactionId: string, projectId: string) {
    // Verify the transaction exists and is a pending escrow deposit request
    const transaction = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        project: {
          include: {

          },
        },
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.projectId !== projectId) {
      throw new Error('Transaction does not belong to this project');
    }

    if (transaction.type !== 'escrow_deposit_request') {
      throw new Error('This transaction is not an escrow deposit request');
    }

    if ((transaction.status || '').toLowerCase() !== 'pending') {
      throw new Error('This deposit request is not pending');
    }

    // Create a new transaction confirming the payment was made by client
    await this.prisma.financialTransaction.create({
      data: {
        projectId,
        projectProfessionalId: transaction.projectProfessionalId,
        type: 'escrow_deposit_confirmation',
        description: 'Client confirms deposit payment made to Fitout Hub escrow',
        amount: transaction.amount,
        status: 'pending',
        requestedBy: transaction.requestedBy,
        requestedByRole: 'client',
        actionBy: 'foh',  // Action required from FOH/platform admin team
        actionByRole: 'platform',
        actionAt: new Date(),
        actionComplete: false,  // Pending FOH admin confirmation
        notes: `Confirmation for escrow deposit request ${transactionId}`,
      },
    });

    // Update the original transaction status (client confirmed payment)
    await this.prisma.financialTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'paid',
        actionBy: transaction.requestedBy,
        actionByRole: 'client',
        actionAt: new Date(),
        actionComplete: true,
        notes: `${transaction.notes || ''} | Client confirmed payment made`,
      },
    });

    // Move project to PRE_WORK once escrow deposit is confirmed by client
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        currentStage: ProjectStage.PRE_WORK,
        stageStartedAt: new Date(),
      },
    });

    return { success: true };
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

    const { awarded } = await this.prisma.$transaction(async (tx) => {
      // Update this professional's status to "awarded"
      const awardedPP = await tx.projectProfessional.update({
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

            },
          },
        },
      });

      // Auto-approve awarded professional's pending site access request (if any)
      await tx.siteAccessRequest.updateMany({
        where: {
          projectProfessionalId: awardedPP.id,
          status: 'pending',
        },
        data: {
          status: 'approved_no_visit',
          respondedAt: new Date(),
        },
      });

      // Mark project as awarded for downstream views
      await tx.project.update({
        where: { id: projectId },
        data: {
          status: 'awarded',
          currentStage: ProjectStage.CONTRACT_PHASE,
          awardedProjectProfessionalId: awardedPP.id,
        },
      });

      // Create financial transactions mirroring the client acceptance flow
      const quoteAmount = projectProfessional.quoteAmount
        ? new Decimal(projectProfessional.quoteAmount.toString())
        : new Decimal(0);

      if (quoteAmount.greaterThan(0)) {
        const clientId = projectProfessional.project?.clientId || projectProfessional.project?.userId;
        // Informational line: quotation accepted (mark as complete since no action needed)
        const quoteTx = await tx.financialTransaction.create({
          data: {
            projectId,
            projectProfessionalId: awardedPP.id,
            type: 'quotation_accepted',
            description: `Quotation accepted from ${projectProfessional.professional?.businessName || projectProfessional.professional?.fullName || 'Professional'}`,
            amount: quoteAmount,
            status: 'info',
            requestedBy: clientId,
            requestedByRole: 'client',
            actionBy: clientId,
            actionByRole: 'client',
            actionComplete: true,  // Info transactions don't require action
          },
        });

        // Persist approved budget + award pointers on project
        await tx.project.update({
          where: { id: projectId },
          data: {
            approvedBudget: quoteAmount,
            approvedBudgetTxId: quoteTx.id,
            awardedProjectProfessionalId: awardedPP.id,
            escrowRequired: quoteAmount,
          },
        });

        // Escrow deposit request is intentionally created later,
        // after both parties have signed the standard contract.
      }

      return { awarded: awardedPP };
    });

    const project = projectProfessional.project;
    const professionals = project.professionals;
    const winnerName =
      projectProfessional.professional.fullName ||
      projectProfessional.professional.businessName ||
      'Professional';
    const clientName = project.clientName;
    const notificationAudit = this.createNotificationAudit(
      'quote_award_notifications',
      projectId,
      {
        awardedProfessionalId: professionalId,
      },
    );
    const winnerAudit: NotificationAuditRecipient = {
      actorType: 'professional',
      actorId: professionalId,
      role: 'winner',
      email: { status: 'skipped' },
      direct: { status: 'skipped' },
    };

    // Send winner notification

    console.log('[ProjectsService.awardQuote] Notifying winner:', {
      projectId,
      professionalId,
      email: projectProfessional.professional.email,
    });

    try {
      await this.emailService.sendWinnerNotification({
        to: projectProfessional.professional.email,
        professionalName: winnerName,
        projectName: project.projectName,
        quoteAmount: projectProfessional.quoteAmount?.toString() || '0',
        nextStepsMessage:
          'The client will contact you soon to discuss next steps. You can share your contact details or continue communicating via the platform for transparency and project management.',
      });
      winnerAudit.email.status = 'sent';
    } catch (error) {
      winnerAudit.email.status = 'failed';
      winnerAudit.email.error = error?.message;
      throw error;
    }

    // Send preferred channel notification to winner (email remains as backup)
    try {
      console.log('[ProjectsService.awardQuote] Preparing notification for professional:', {
        professionalId: projectProfessional.professional.id,
        professionalEmail: projectProfessional.professional.email,
        professionalPhone: projectProfessional.professional.phone ? `${projectProfessional.professional.phone.substring(0, 4)}...` : null,
      });

      const preference = await this.prisma.notificationPreference.findUnique({
        where: { professionalId: projectProfessional.professional.id },
        select: { primaryChannel: true },
      });

      const preferredChannel = preference?.primaryChannel;
      const directChannel =
        preferredChannel === NotificationChannel.WHATSAPP ||
        preferredChannel === NotificationChannel.SMS
          ? preferredChannel
          : null;
      winnerAudit.direct.preferredChannel = preferredChannel;
      winnerAudit.direct.channel = directChannel;

      // TODO(notification-templates): revisit award-notification templates per channel in a dedicated template pass.
      const winnerShortMsg = `Congratulations! Your quote for "${project.projectName}" has been awarded. The client will contact you soon to discuss next steps.`;

      if (projectProfessional.professional.phone && directChannel) {
        console.log('[ProjectsService.awardQuote] Sending notification to:', projectProfessional.professional.phone);
        
        await this.notificationService.send({
          professionalId: projectProfessional.professional.id,
          phoneNumber: projectProfessional.professional.phone,
          channel: directChannel,
          eventType: 'quote_awarded',
          message: winnerShortMsg,
        });
        winnerAudit.direct.status = 'sent';
        console.log('[ProjectsService.awardQuote] Notification sent successfully');
      } else {
        winnerAudit.direct.status = 'skipped';
        winnerAudit.direct.reason = !projectProfessional.professional.phone
          ? 'missing_phone'
          : 'preferred_channel_email_or_unsupported';
        console.log('[ProjectsService.awardQuote] Skipping direct winner notification (no phone or primary channel is EMAIL/unsupported)', {
          hasPhone: Boolean(projectProfessional.professional.phone),
          preferredChannel,
        });
      }
    } catch (error) {
      winnerAudit.direct.status = 'failed';
      winnerAudit.direct.error = error?.message;
      console.error('[ProjectsService.awardQuote] Failed to send preferred-channel notification to winner:', error);
      console.error('[ProjectsService.awardQuote] Error details:', {
        message: error?.message,
      });
    }

    this.pushNotificationAuditRecipient(notificationAudit, winnerAudit);

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

    for (const pp of otherProfessionals) {
      const nonWinnerAudit: NotificationAuditRecipient = {
        actorType: 'professional',
        actorId: pp.professional.id,
        role: 'non_winner',
        email: { status: 'skipped' },
        direct: { status: 'skipped' },
      };

      try {
        await this.emailService.sendLoserNotification({
          to: pp.professional.email,
          professionalName:
            pp.professional.fullName ||
            pp.professional.businessName ||
            'Professional',
          projectName: project.projectName,
          thankYouMessage:
            'Thank you for your time and effort on this project. We hope to work with you on future opportunities.',
        });
        nonWinnerAudit.email.status = 'sent';
      } catch (err) {
        nonWinnerAudit.email.status = 'failed';
        nonWinnerAudit.email.error = err?.message;
        console.error(
          '[ProjectsService.awardQuote] Failed to send loser notification',
          {
            to: pp.professional.email,
            error: err?.message,
          },
        );
      }

      try {
        const preference = await this.prisma.notificationPreference.findUnique({
          where: { professionalId: pp.professional.id },
          select: { primaryChannel: true },
        });

        const preferredChannel = preference?.primaryChannel;
        const directChannel =
          preferredChannel === NotificationChannel.WHATSAPP ||
          preferredChannel === NotificationChannel.SMS
            ? preferredChannel
            : null;
        nonWinnerAudit.direct.preferredChannel = preferredChannel;
        nonWinnerAudit.direct.channel = directChannel;

        if (pp.professional.phone && directChannel) {
          await this.notificationService.send({
            professionalId: pp.professional.id,
            phoneNumber: pp.professional.phone,
            channel: directChannel,
            eventType: 'quote_not_awarded',
            message: `Update on "${project.projectName}": another professional was selected this time. Thank you for your quote—we hope to work with you on a future project.`,
          });
          nonWinnerAudit.direct.status = 'sent';
        } else {
          nonWinnerAudit.direct.status = 'skipped';
          nonWinnerAudit.direct.reason = !pp.professional.phone
            ? 'missing_phone'
            : 'preferred_channel_email_or_unsupported';
        }
      } catch (err) {
        nonWinnerAudit.direct.status = 'failed';
        nonWinnerAudit.direct.error = err?.message;
        console.error(
          '[ProjectsService.awardQuote] Failed to send preferred-channel non-winner notification',
          {
            professionalId: pp.professional?.id,
            error: err?.message,
          },
        );
      }

      this.pushNotificationAuditRecipient(notificationAudit, nonWinnerAudit);
    }

    await this.finalizeNotificationAudit(notificationAudit);

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

        // Cancel any pending site access requests from non-awarded professionals
        await this.prisma.siteAccessRequest.updateMany({
          where: {
            projectProfessionalId: pp.id,
            status: 'pending',
          },
          data: {
            status: 'cancelled',
            respondedAt: new Date(),
          },
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

  async archive(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if ((project.status || '').toLowerCase() === this.ARCHIVED_STATUS) {
      return { success: true, status: this.ARCHIVED_STATUS, alreadyArchived: true };
    }

    await this.prisma.project.update({
      where: { id },
      data: { status: this.ARCHIVED_STATUS, updatedAt: new Date() },
    });

    return { success: true, status: this.ARCHIVED_STATUS };
  }

  async unarchive(id: string, status = 'pending') {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if ((status || '').toLowerCase() === this.ARCHIVED_STATUS) {
      throw new BadRequestException('Unarchive status cannot be archived');
    }

    if ((project.status || '').toLowerCase() !== this.ARCHIVED_STATUS) {
      return { success: true, status: project.status, alreadyActive: true };
    }

    await this.prisma.project.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });

    return { success: true, status };
  }

  async remove(id: string) {
    return this.archive(id);
  }

  async hardRemove(id: string) {
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

  // Removed payInvoice flow; payments are handled via escrow and payment requests
}
