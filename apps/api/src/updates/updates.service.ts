import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface FinancialActionItem {
  id: string;
  type: string;
  description: string;
  amount: string;
  status: string;
  projectId: string;
  projectName: string;
  createdAt: Date;
  requestedBy?: string;
  requestedByRole?: string;
}

export interface UnreadMessageGroup {
  projectId: string;
  projectName: string;
  unreadCount: number;
  latestMessage: {
    id: string;
    content: string;
    createdAt: Date;
    senderType: string;
    senderName?: string;
  };
  chatType: 'project-professional' | 'project-general' | 'assist' | 'private-foh';
  threadId?: string;
}

export interface UpdatesSummary {
  financialActions: FinancialActionItem[];
  financialCount: number;
  unreadMessages: UnreadMessageGroup[];
  unreadCount: number;
  totalCount: number;
}

export interface AdminOpsSummary {
  support: {
    unassigned: number;
    claimed: number;
    inProgress: number;
    resolved: number;
    myClaimed: number;
    myInProgress: number;
    totalOpen: number;
  };
  inbox: {
    privateUnreadMessages: number;
    privateUnreadThreads: number;
    anonymousOpenThreads: number;
    anonymousMessages: number;
  };
  assist: {
    open: number;
    inProgress: number;
    closed: number;
    unreadClientMessages: number;
  };
  adminActions: {
    pending: number;
    inReview: number;
    escalated: number;
    urgent: number;
    assignedToMe: number;
  };
  safety: {
    highOrCritical: number;
    requiresEscalation: number;
    emergencyNotTagged: number;
  };
  generatedAt: string;
}

export interface AdminCommsFeedItem {
  id: string;
  sourceType: string;
  sourceId: string;
  type: string;
  transport: string;
  context: string;
  user: string;
  status: string;
  assignmentStatus: string;
  claimedByAdminId?: string;
  claimedByAdminName?: string;
  assignedToAdminId?: string;
  assignedToAdminName?: string;
  isMine?: boolean;
  preview: string;
  createdAt: string;
  href: string;
}

export interface AdminCommsFeed {
  items: AdminCommsFeedItem[];
  generatedAt: string;
}

export interface AdminCommsAssignee {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);
  private readonly summaryCache = new Map<
    string,
    { expiresAt: number; value: UpdatesSummary }
  >();
  private readonly summaryCacheTtlMs = Number(
    process.env.UPDATES_SUMMARY_CACHE_TTL_MS || '15000',
  );

  constructor(private prisma: PrismaService) {}

  private normalizeSeverity(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
  }

  private isEscalationSignal(safetyAssessment: any): boolean {
    if (!safetyAssessment || typeof safetyAssessment !== 'object') return false;
    const directFlags = [
      safetyAssessment.requiresEscalation,
      safetyAssessment.immediateActionRequired,
      safetyAssessment.contactEmergencyServices,
      safetyAssessment.escalationRequired,
    ];
    if (directFlags.some((flag) => flag === true)) return true;

    const recommendedAction =
      typeof safetyAssessment.recommendedAction === 'string'
        ? safetyAssessment.recommendedAction.toLowerCase()
        : '';
    return (
      recommendedAction.includes('emergency') ||
      recommendedAction.includes('urgent') ||
      recommendedAction.includes('escalat')
    );
  }

  async getAdminOpsSummary(adminId: string): Promise<AdminOpsSummary> {
    const [
      supportCounts,
      myClaimed,
      myInProgress,
      privateUnreadMessages,
      privateUnreadThreads,
      anonymousOpenThreads,
      anonymousMessages,
      assistOpen,
      assistInProgress,
      assistClosed,
      unreadClientAssistMessages,
      adminPending,
      adminInReview,
      adminEscalated,
      adminUrgent,
      adminAssignedToMe,
      aiProjects,
    ] = await Promise.all([
      this.prisma.supportRequest.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.supportRequest.count({
        where: { assignedAdminId: adminId, status: 'claimed' },
      }),
      this.prisma.supportRequest.count({
        where: { assignedAdminId: adminId, status: 'in_progress' },
      }),
      this.prisma.privateChatMessage.count({
        where: {
          readByFohAt: null,
          senderType: { not: 'foh' },
        },
      }),
      this.prisma.privateChatThread.count({
        where: {
          messages: {
            some: {
              readByFohAt: null,
              senderType: { not: 'foh' },
            },
          },
        },
      }),
      this.prisma.anonymousChatThread.count({
        where: {
          messages: {
            some: {
              senderType: { not: 'foh' },
            },
          },
        },
      }),
      this.prisma.anonymousChatMessage.count({
        where: {
          senderType: { not: 'foh' },
        },
      }),
      this.prisma.projectAssistRequest.count({ where: { status: 'open' } }),
      this.prisma.projectAssistRequest.count({ where: { status: 'in_progress' } }),
      this.prisma.projectAssistRequest.count({ where: { status: 'closed' } }),
      this.prisma.assistMessage.count({
        where: {
          senderType: 'client',
          readByFohAt: null,
        },
      }),
      this.prisma.adminAction.count({ where: { status: 'PENDING' } }),
      this.prisma.adminAction.count({ where: { status: 'IN_REVIEW' } }),
      this.prisma.adminAction.count({ where: { status: 'ESCALATED' } }),
      this.prisma.adminAction.count({ where: { priority: 'URGENT', status: { not: 'APPROVED' } } }),
      this.prisma.adminAction.count({
        where: {
          assignedToAdminId: adminId,
          status: { in: ['PENDING', 'IN_REVIEW', 'ESCALATED'] },
        },
      }),
      this.prisma.project.findMany({
        where: {
          status: { not: 'archived' },
          aiIntake: { isNot: null },
        },
        select: {
          id: true,
          isEmergency: true,
          aiIntake: {
            select: {
              project: true,
            },
          },
        },
      }),
    ]);

    const support = {
      unassigned: 0,
      claimed: 0,
      inProgress: 0,
      resolved: 0,
      myClaimed,
      myInProgress,
      totalOpen: 0,
    };

    for (const row of supportCounts) {
      const count = row._count.status;
      if (row.status === 'unassigned') support.unassigned = count;
      if (row.status === 'claimed') support.claimed = count;
      if (row.status === 'in_progress') support.inProgress = count;
      if (row.status === 'resolved') support.resolved = count;
    }
    support.totalOpen = support.unassigned + support.claimed + support.inProgress;

    let highOrCritical = 0;
    let requiresEscalation = 0;
    let emergencyNotTagged = 0;

    for (const project of aiProjects) {
      const projectJson = project.aiIntake?.project as Record<string, any> | null | undefined;
      const safety = projectJson?.safetyAssessment;
      if (!safety || typeof safety !== 'object') continue;

      const severity = this.normalizeSeverity(
        safety.level ?? safety.riskLevel ?? safety.severity,
      );
      const isHighOrCritical = ['high', 'critical', 'severe'].includes(severity);
      const hasEscalation = this.isEscalationSignal(safety);

      if (isHighOrCritical) highOrCritical += 1;
      if (hasEscalation) requiresEscalation += 1;
      if ((isHighOrCritical || hasEscalation) && !project.isEmergency) {
        emergencyNotTagged += 1;
      }
    }

    return {
      support,
      inbox: {
        privateUnreadMessages,
        privateUnreadThreads,
        anonymousOpenThreads,
        anonymousMessages,
      },
      assist: {
        open: assistOpen,
        inProgress: assistInProgress,
        closed: assistClosed,
        unreadClientMessages: unreadClientAssistMessages,
      },
      adminActions: {
        pending: adminPending,
        inReview: adminInReview,
        escalated: adminEscalated,
        urgent: adminUrgent,
        assignedToMe: adminAssignedToMe,
      },
      safety: {
        highOrCritical,
        requiresEscalation,
        emergencyNotTagged,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private feedKey(sourceType: string, sourceId: string) {
    return `${sourceType}:${sourceId}`;
  }

  private displayAdminName(admin?: { firstName?: string | null; surname?: string | null; email?: string | null } | null) {
    if (!admin) return undefined;
    const fullName = `${admin.firstName || ''} ${admin.surname || ''}`.trim();
    return fullName || admin.email || undefined;
  }

  async listAdminAssignees(): Promise<AdminCommsAssignee[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin' },
      select: {
        id: true,
        firstName: true,
        surname: true,
        email: true,
      },
      orderBy: [{ firstName: 'asc' }, { surname: 'asc' }],
    });

    return admins.map((admin) => ({
      id: admin.id,
      name: `${admin.firstName || ''} ${admin.surname || ''}`.trim() || admin.email,
      email: admin.email,
    }));
  }

  async claimAdminCommsItem(adminId: string, sourceType: string, sourceId: string) {
    const assignment = await this.prisma.adminMessageAssignment.upsert({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId,
        },
      },
      create: {
        sourceType,
        sourceId,
        claimedByAdminId: adminId,
        assignedToAdminId: adminId,
        status: 'claimed',
      },
      update: {
        claimedByAdminId: adminId,
        assignedToAdminId: adminId,
        status: 'claimed',
      },
    });

    return { success: true, assignment };
  }

  async assignAdminCommsItem(
    adminId: string,
    sourceType: string,
    sourceId: string,
    assignedToAdminId: string,
  ) {
    const assignment = await this.prisma.adminMessageAssignment.upsert({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId,
        },
      },
      create: {
        sourceType,
        sourceId,
        claimedByAdminId: adminId,
        assignedToAdminId,
        status: assignedToAdminId === adminId ? 'claimed' : 'assigned',
      },
      update: {
        claimedByAdminId: adminId,
        assignedToAdminId,
        status: assignedToAdminId === adminId ? 'claimed' : 'assigned',
      },
    });

    return { success: true, assignment };
  }

  async releaseAdminCommsItem(adminId: string, sourceType: string, sourceId: string) {
    const existing = await this.prisma.adminMessageAssignment.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId,
        },
      },
    });

    if (!existing) {
      return { success: true };
    }

    if (
      existing.claimedByAdminId &&
      existing.claimedByAdminId !== adminId &&
      existing.assignedToAdminId !== adminId
    ) {
      throw new BadRequestException('Only the owning admin can release this message');
    }

    await this.prisma.adminMessageAssignment.update({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId,
        },
      },
      data: {
        claimedByAdminId: null,
        assignedToAdminId: null,
        status: 'unassigned',
      },
    });

    return { success: true };
  }

  async getAdminCommsFeed(
    limit?: number,
    adminId?: string,
    scope: 'all' | 'my' | 'unassigned' = 'all',
  ): Promise<AdminCommsFeed> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Number(limit), 10), 300) : 120;

    const [supportRequests, assistMessages, privateMessages, anonymousMessages, notificationLogs, aiProjects] =
      await Promise.all([
        this.prisma.supportRequest.findMany({
          take: safeLimit,
          orderBy: { updatedAt: 'desc' },
          include: {
            project: {
              select: {
                id: true,
                projectName: true,
              },
            },
            assignedAdmin: {
              select: {
                id: true,
                firstName: true,
                surname: true,
                email: true,
              },
            },
          },
        }),
        this.prisma.assistMessage.findMany({
          take: safeLimit,
          where: {
            senderType: 'client',
          },
          orderBy: { createdAt: 'desc' },
          include: {
            assistRequest: {
              include: {
                project: {
                  select: {
                    id: true,
                    projectName: true,
                  },
                },
                user: {
                  select: {
                    firstName: true,
                    surname: true,
                    email: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.privateChatMessage.findMany({
          take: safeLimit,
          where: {
            senderType: { in: ['user', 'professional'] },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            thread: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    surname: true,
                    email: true,
                  },
                },
                professional: {
                  select: {
                    fullName: true,
                    businessName: true,
                    email: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.anonymousChatMessage.findMany({
          take: safeLimit,
          where: {
            senderType: 'anonymous',
          },
          orderBy: { createdAt: 'desc' },
          include: {
            thread: {
              select: {
                id: true,
                sessionId: true,
                status: true,
                updatedAt: true,
              },
            },
          },
        }),
        this.prisma.notificationLog.findMany({
          take: safeLimit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                firstName: true,
                surname: true,
                email: true,
              },
            },
            professional: {
              select: {
                fullName: true,
                businessName: true,
                email: true,
              },
            },
          },
        }),
        this.prisma.project.findMany({
          where: {
            status: { not: 'archived' },
            aiIntake: { isNot: null },
          },
          select: {
            id: true,
            projectName: true,
            isEmergency: true,
            updatedAt: true,
            aiIntake: {
              select: {
                project: true,
              },
            },
          },
          take: safeLimit,
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

    const feedItems: AdminCommsFeedItem[] = [];

    supportRequests.forEach((request) => {
      const assignedName = request.assignedAdmin
        ? `${request.assignedAdmin.firstName || ''} ${request.assignedAdmin.surname || ''}`.trim() || request.assignedAdmin.email
        : 'Unassigned';
      feedItems.push({
        id: `support:${request.id}`,
        sourceType: 'support',
        sourceId: request.id,
        type: 'Support Request',
        transport: request.channel === 'whatsapp' ? 'WhatsApp' : 'Callback',
        context: request.project
          ? `Project · ${request.project.projectName}`
          : 'Support Pool',
        user: request.clientName || request.clientEmail || request.fromNumber || 'Unknown client',
        status: request.status,
        assignmentStatus: 'unassigned',
        preview: request.body,
        createdAt: request.updatedAt.toISOString(),
        href: '/admin/messaging?view=general&type=support',
      });
    });

    assistMessages.forEach((message) => {
      const author = message.assistRequest.user
        ? `${message.assistRequest.user.firstName || ''} ${message.assistRequest.user.surname || ''}`.trim() || message.assistRequest.user.email || 'Client'
        : 'Client';
      feedItems.push({
        id: `assist:${message.id}`,
        sourceType: 'assist',
        sourceId: message.id,
        type: 'Assist Message',
        transport: message.assistRequest.contactMethod === 'whatsapp'
          ? 'WhatsApp'
          : message.assistRequest.contactMethod === 'call'
            ? 'Call'
            : 'In-app Chat',
        context: message.assistRequest.project
          ? `Project · ${message.assistRequest.project.projectName}`
          : 'Assist Queue',
        user: author,
        status: message.assistRequest.status,
        assignmentStatus: 'unassigned',
        preview: message.content,
        createdAt: message.createdAt.toISOString(),
        href: '/admin/messaging?view=assist',
      });
    });

    privateMessages.forEach((message) => {
      const userLabel =
        message.senderType === 'professional'
          ? message.thread.professional?.fullName || message.thread.professional?.businessName || message.thread.professional?.email || 'Professional'
          : message.thread.user
            ? `${message.thread.user.firstName || ''} ${message.thread.user.surname || ''}`.trim() || message.thread.user.email || 'Client'
            : 'Client';

      feedItems.push({
        id: `private:${message.id}`,
        sourceType: 'private',
        sourceId: message.id,
        type: message.senderType === 'professional' ? 'Professional Inbox' : 'Client Inbox',
        transport: 'In-app Chat',
        context: message.senderType === 'professional' ? 'FOH Professional Thread' : 'FOH Client Thread',
        user: userLabel,
        status: message.thread.status,
        assignmentStatus: 'unassigned',
        preview: message.content,
        createdAt: message.createdAt.toISOString(),
        href: '/admin/messaging?view=general&type=support',
      });
    });

    anonymousMessages.forEach((message) => {
      feedItems.push({
        id: `anonymous:${message.id}`,
        sourceType: 'anonymous',
        sourceId: message.id,
        type: 'Anonymous Inbox',
        transport: 'In-app Chat',
        context: `Session · ${message.thread.sessionId.slice(0, 8)}`,
        user: 'Anonymous visitor',
        status: message.thread.status,
        assignmentStatus: 'unassigned',
        preview: message.content,
        createdAt: message.createdAt.toISOString(),
        href: '/admin/messaging?view=general&type=anonymous',
      });
    });

    notificationLogs.forEach((log) => {
      const recipient = log.user
        ? `${log.user.firstName || ''} ${log.user.surname || ''}`.trim() || log.user.email || 'Client'
        : log.professional?.fullName || log.professional?.businessName || log.professional?.email || 'Unknown recipient';
      feedItems.push({
        id: `notification:${log.id}`,
        sourceType: 'notification',
        sourceId: log.id,
        type: 'Platform Notification',
        transport: String(log.channel).toUpperCase(),
        context: log.eventType,
        user: recipient,
        status: log.status,
        assignmentStatus: 'unassigned',
        preview: log.message,
        createdAt: log.createdAt.toISOString(),
        href: '/admin/activity-log',
      });
    });

    aiProjects.forEach((project) => {
      const projectJson = project.aiIntake?.project as Record<string, any> | null | undefined;
      const safety = projectJson?.safetyAssessment;
      if (!safety || typeof safety !== 'object') return;

      const severity = this.normalizeSeverity(
        safety.level ?? safety.riskLevel ?? safety.severity,
      );
      const isHighOrCritical = ['high', 'critical', 'severe'].includes(severity);
      const hasEscalation = this.isEscalationSignal(safety);

      if (!isHighOrCritical && !hasEscalation) return;

      feedItems.push({
        id: `safety:${project.id}`,
        sourceType: 'safety',
        sourceId: project.id,
        type: 'Safety Triage',
        transport: 'Internal',
        context: `Project · ${project.projectName}`,
        user: 'Platform signal',
        status: project.isEmergency ? 'tagged_emergency' : 'needs_review',
        assignmentStatus: 'unassigned',
        preview:
          typeof safety.recommendedAction === 'string' && safety.recommendedAction.trim()
            ? safety.recommendedAction
            : 'High-risk safety signal detected and requires admin review.',
        createdAt: project.updatedAt.toISOString(),
        href: '/admin/projects',
      });
    });

    const uniqueKeys = Array.from(
      new Set(feedItems.map((item) => this.feedKey(item.sourceType, item.sourceId))),
    );

    if (uniqueKeys.length > 0) {
      const assignmentWhereOr = uniqueKeys.map((key) => {
        const [sourceType, ...rest] = key.split(':');
        return {
          sourceType,
          sourceId: rest.join(':'),
        };
      });

      const assignments = await this.prisma.adminMessageAssignment.findMany({
        where: {
          OR: assignmentWhereOr,
        },
        include: {
          claimedByAdmin: {
            select: {
              firstName: true,
              surname: true,
              email: true,
            },
          },
          assignedToAdmin: {
            select: {
              firstName: true,
              surname: true,
              email: true,
            },
          },
        },
      });

      const assignmentByKey = new Map(
        assignments.map((assignment) => [
          this.feedKey(assignment.sourceType, assignment.sourceId),
          assignment,
        ]),
      );

      for (const item of feedItems) {
        const assignment = assignmentByKey.get(this.feedKey(item.sourceType, item.sourceId));
        if (!assignment) continue;

        item.claimedByAdminId = assignment.claimedByAdminId || undefined;
        item.claimedByAdminName = this.displayAdminName(assignment.claimedByAdmin);
        item.assignedToAdminId = assignment.assignedToAdminId || undefined;
        item.assignedToAdminName = this.displayAdminName(assignment.assignedToAdmin);

        if (assignment.assignedToAdminId && assignment.assignedToAdminId !== assignment.claimedByAdminId) {
          item.assignmentStatus = 'assigned';
        } else if (assignment.claimedByAdminId) {
          item.assignmentStatus = 'claimed';
        } else {
          item.assignmentStatus = 'unassigned';
        }

        item.isMine =
          !!adminId &&
          (assignment.assignedToAdminId === adminId || assignment.claimedByAdminId === adminId);
      }
    }

    const scopedItems = feedItems.filter((item) => {
      if (scope === 'all') return true;
      if (scope === 'unassigned') return item.assignmentStatus === 'unassigned';
      if (scope === 'my') return item.isMine === true;
      return true;
    });

    const items = scopedItems
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, safeLimit);

    return {
      items,
      generatedAt: new Date().toISOString(),
    };
  }

  private getSummaryCacheKey(
    userId: string,
    role: 'client' | 'professional' | 'admin',
  ) {
    return `${role}:${userId}`;
  }

  private getCachedSummary(
    userId: string,
    role: 'client' | 'professional' | 'admin',
  ): UpdatesSummary | null {
    const key = this.getSummaryCacheKey(userId, role);
    const entry = this.summaryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.summaryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCachedSummary(
    userId: string,
    role: 'client' | 'professional' | 'admin',
    value: UpdatesSummary,
  ) {
    const key = this.getSummaryCacheKey(userId, role);
    this.summaryCache.set(key, {
      value,
      expiresAt: Date.now() + this.summaryCacheTtlMs,
    });
  }

  private invalidateSummaryCache(
    userId: string,
    role: 'client' | 'professional' | 'admin',
  ) {
    const key = this.getSummaryCacheKey(userId, role);
    this.summaryCache.delete(key);
  }

  /**
   * Get financial transactions requiring action from the user
   * Simplified: Use actionBy, actionByRole, and actionComplete fields
   */
  async getFinancialActions(
    userId: string,
    role: 'client' | 'professional' | 'admin',
  ): Promise<FinancialActionItem[]> {
    // Simple filter: transactions where this user needs to take action
    // actionComplete=false means action is still required
    // actionBy=userId and actionByRole=role means it's meant for this user in this role
    // For admins: also include platform tasks (actionByRole='platform')

    const whereClause: any = {
      actionComplete: {
        equals: false,        // Action still needed
      },
    };

    // For admin role, include both admin tasks and platform tasks
    if (role === 'admin') {
      whereClause.OR = [
        {
          actionBy: userId,
          actionByRole: 'admin',
        },
        {
          actionByRole: 'platform',  // Platform tasks visible to all admins
        },
      ];
    } else {
      // For client/professional, match exact user and role
      whereClause.actionBy = userId;
      whereClause.actionByRole = role;
    }

    const transactions = await this.prisma.financialTransaction.findMany({
      where: whereClause,
      include: {
        project: {
          select: {
            projectName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let actions: FinancialActionItem[] = transactions.map((t) => ({
      id: t.id,
      type: t.type,
      description: t.description,
      amount: t.amount.toString(),
      status: t.status,
      projectId: t.projectId,
      projectName: t.project?.projectName || 'Project',
      createdAt: t.createdAt,
      ...(t.requestedBy && { requestedBy: t.requestedBy }),
      ...(t.requestedByRole && { requestedByRole: t.requestedByRole }),
    }));

    // For clients, add pending quotations that need review (admin impersonation handled at controller level)
    if (role === 'client') {
      const pendingQuotations = await this.getPendingQuotations(userId);
      actions = [...actions, ...pendingQuotations];
      // Sort by creation date descending
      actions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return actions;
  }

  /**
   * Get projects with pending quotations for a client (status='quoted', not yet accepted)
   */
  private async getPendingQuotations(clientId: string): Promise<FinancialActionItem[]> {
    const quotedItems = await this.prisma.projectProfessional.findMany({
      where: {
        status: 'quoted',
        project: {
          OR: [{ userId: clientId }, { clientId }],
          status: { not: 'archived' },
        },
      },
      select: {
        id: true,
        quoteAmount: true,
        quotedAt: true,
        professionalId: true,
        project: {
          select: {
            id: true,
            projectName: true,
          },
        },
      },
    });

    return quotedItems.map((item) => ({
        id: `quotation-${item.id}`,
        type: 'quotation_review',
        description: `Project quotation in progress, please review`,
        amount: item.quoteAmount?.toString() || '0',
        status: 'pending',
        projectId: item.project.id,
        projectName: item.project.projectName || 'Project',
        createdAt: item.quotedAt || new Date(),
        requestedBy: item.professionalId,
        requestedByRole: 'professional',
      }));
  }

  /**
   * Get unread messages grouped by project/thread
   */
  async getUnreadMessages(
    userId: string,
    role: 'client' | 'professional' | 'admin',
  ): Promise<UnreadMessageGroup[]> {
    const groups: UnreadMessageGroup[] = [];

    if (role === 'client') {
      // 1. ProjectProfessional messages (Message model)
      const unreadProfessionalMessages = await this.prisma.message.groupBy({
        by: ['projectProfessionalId'],
        where: {
          readByClientAt: null,
          senderType: 'professional',
        },
        _count: {
          id: true,
        },
      });

      for (const group of unreadProfessionalMessages) {
        const latestMessage = await this.prisma.message.findFirst({
          where: {
            projectProfessionalId: group.projectProfessionalId,
            readByClientAt: null,
            senderType: 'professional',
          },
          orderBy: { createdAt: 'desc' },
          include: {
            projectProfessional: {
              include: {
                project: {
                  select: { id: true, projectName: true, userId: true, clientName: true },
                },
                professional: {
                  select: { id: true, businessName: true, fullName: true },
                },
              },
            },
          },
        });

        if (latestMessage && latestMessage.projectProfessional.project.userId === userId) {
          groups.push({
            projectId: latestMessage.projectProfessional.project.id,
            projectName: latestMessage.projectProfessional.project.projectName,
            unreadCount: group._count.id,
            latestMessage: {
              id: latestMessage.id,
              content: latestMessage.content,
              createdAt: latestMessage.createdAt,
              senderType: latestMessage.senderType,
              senderName:
                latestMessage.senderType === 'professional'
                  ? (latestMessage.projectProfessional?.professional?.businessName ||
                     latestMessage.projectProfessional?.professional?.fullName ||
                     'Professional')
                  : latestMessage.senderType === 'client'
                  ? 'Client'
                  : 'Sender',
            },
            chatType: 'project-professional',
            threadId: group.projectProfessionalId,
          });
        }
      }

      // 2. ProjectChatMessages (general project chat)
      const unreadProjectChat = await this.prisma.$queryRaw<
        Array<{
          threadId: string;
          unreadCount: bigint;
          projectId: string;
          projectName: string;
        }>
      >`
        SELECT 
          pcm."threadId",
          COUNT(pcm.id)::bigint as "unreadCount",
          pct."projectId",
          p."projectName"
        FROM "ProjectChatMessage" pcm
        INNER JOIN "ProjectChatThread" pct ON pct.id = pcm."threadId"
        INNER JOIN "Project" p ON p.id = pct."projectId"
        WHERE pcm."readByClientAt" IS NULL
          AND pcm."senderType" != 'client'
          AND p."userId" = ${userId}
          AND p.status != 'archived'
        GROUP BY pcm."threadId", pct."projectId", p."projectName"
      `;

      for (const group of unreadProjectChat) {
        const latestMessage = await this.prisma.projectChatMessage.findFirst({
          where: {
            threadId: group.threadId,
            readByClientAt: null,
            senderType: { not: 'client' },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (latestMessage) {
          groups.push({
            projectId: group.projectId,
            projectName: group.projectName,
            unreadCount: Number(group.unreadCount),
            latestMessage: {
              id: latestMessage.id,
              content: latestMessage.content,
              createdAt: latestMessage.createdAt,
              senderType: latestMessage.senderType,
              senderName:
                latestMessage.senderType === 'professional'
                  ? 'Professional'
                  : latestMessage.senderType === 'client'
                  ? 'Client'
                  : 'Project Team',
            },
            chatType: 'project-general',
            threadId: group.threadId,
          });
        }
      }

      // 3. AssistMessages (client support)
      const unreadAssistMessages = await this.prisma.$queryRaw<
        Array<{
          assistRequestId: string;
          unreadCount: bigint;
          projectId: string;
          projectName: string;
        }>
      >`
        SELECT 
          am."assistRequestId",
          COUNT(am.id)::bigint as "unreadCount",
          ar."projectId",
          p."projectName"
        FROM "AssistMessage" am
        INNER JOIN "ProjectAssistRequest" ar ON ar.id = am."assistRequestId"
        INNER JOIN "Project" p ON p.id = ar."projectId"
        WHERE am."readByClientAt" IS NULL
          AND am."senderType" = 'foh'
          AND p."userId" = ${userId}
          AND p.status != 'archived'
        GROUP BY am."assistRequestId", ar."projectId", p."projectName"
      `;

      for (const group of unreadAssistMessages) {
        const latestMessage = await this.prisma.assistMessage.findFirst({
          where: {
            assistRequestId: group.assistRequestId,
            readByClientAt: null,
            senderType: 'foh',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (latestMessage) {
          groups.push({
            projectId: group.projectId,
            projectName: group.projectName,
            unreadCount: Number(group.unreadCount),
            latestMessage: {
              id: latestMessage.id,
              content: latestMessage.content,
              createdAt: latestMessage.createdAt,
              senderType: latestMessage.senderType,
              senderName:
                latestMessage.senderType === 'foh'
                  ? 'FOH Support'
                  : latestMessage.senderType === 'client'
                  ? 'Client'
                  : 'Sender',
            },
            chatType: 'assist',
            threadId: group.assistRequestId,
          });
        }
      }

      // 4. Private FOH support thread
      const privateChatThread = await this.prisma.privateChatThread.findUnique({
        where: { userId: userId },
      });

      if (privateChatThread) {
        const unreadPrivateCount = await this.prisma.privateChatMessage.count({
          where: {
            threadId: privateChatThread.id,
            readByUserAt: null,
            senderType: 'foh',
          },
        });

        if (unreadPrivateCount > 0) {
          const latestMessage = await this.prisma.privateChatMessage.findFirst({
            where: {
              threadId: privateChatThread.id,
              readByUserAt: null,
              senderType: 'foh',
            },
            orderBy: { createdAt: 'desc' },
          });

          if (latestMessage) {
            groups.push({
              projectId: 'private-support',
              projectName: 'FOH Support',
              unreadCount: unreadPrivateCount,
              latestMessage: {
                id: latestMessage.id,
                content: latestMessage.content,
                createdAt: latestMessage.createdAt,
                senderType: latestMessage.senderType,
                senderName:
                  latestMessage.senderType === 'foh'
                    ? 'FOH Support'
                    : latestMessage.senderType === 'client'
                    ? 'Client'
                    : 'Sender',
              },
              chatType: 'private-foh',
              threadId: privateChatThread.id,
            });
          }
        }
      }
    } else if (role === 'professional') {
      // Get professional record
      const professional = await this.prisma.professional.findFirst({
        where: {
          OR: [{ userId }, { id: userId }],
        },
      });

      if (!professional) {
        this.logger.warn(
          `[getUnreadMessages] Professional not found for userId=${userId}`,
        );
        return [];
      }

      // 1. ProjectProfessional messages (Message model)
      const unreadClientMessages = await this.prisma.$queryRaw<
        Array<{
          projectProfessionalId: string;
          unreadCount: bigint;
          projectId: string;
          projectName: string;
        }>
      >`
        SELECT 
          m."projectProfessionalId",
          COUNT(m.id)::bigint as "unreadCount",
          p.id as "projectId",
          p."projectName"
        FROM "Message" m
        INNER JOIN "ProjectProfessional" pp ON pp.id = m."projectProfessionalId"
        INNER JOIN "Project" p ON p.id = pp."projectId"
        WHERE m."readByProfessionalAt" IS NULL
          AND m."senderType" = 'client'
          AND pp."professionalId" = ${professional.id}
          AND p.status != 'archived'
        GROUP BY m."projectProfessionalId", p.id, p."projectName"
      `;

      for (const group of unreadClientMessages) {
        const latestMessage = await this.prisma.message.findFirst({
          where: {
            projectProfessionalId: group.projectProfessionalId,
            readByProfessionalAt: null,
            senderType: 'client',
          },
          orderBy: { createdAt: 'desc' },
          include: {
            projectProfessional: {
              include: {
                project: {
                  select: { clientName: true },
                },
              },
            },
          },
        });

        if (latestMessage) {
          groups.push({
            projectId: group.projectId,
            projectName: group.projectName,
            unreadCount: Number(group.unreadCount),
            latestMessage: {
              id: latestMessage.id,
              content: latestMessage.content,
              createdAt: latestMessage.createdAt,
              senderType: latestMessage.senderType,
              senderName:
                latestMessage.senderType === 'client'
                  ? (latestMessage.projectProfessional?.project?.clientName || 'Client')
                  : latestMessage.senderType === 'professional'
                  ? 'Professional'
                  : 'Sender',
            },
            chatType: 'project-professional',
            threadId: group.projectProfessionalId,
          });
        }
      }

      // 2. ProjectChatMessages (general project chat) - professionals in awarded projects
      const unreadProjectChat = await this.prisma.$queryRaw<
        Array<{
          threadId: string;
          unreadCount: bigint;
          projectId: string;
          projectName: string;
        }>
      >`
        SELECT 
          pcm."threadId",
          COUNT(pcm.id)::bigint as "unreadCount",
          pct."projectId",
          p."projectName"
        FROM "ProjectChatMessage" pcm
        INNER JOIN "ProjectChatThread" pct ON pct.id = pcm."threadId"
        INNER JOIN "Project" p ON p.id = pct."projectId"
        INNER JOIN "ProjectProfessional" pp ON pp."projectId" = p.id
        WHERE pcm."readByProAt" IS NULL
          AND pcm."senderType" != 'professional'
          AND pp."professionalId" = ${professional.id}
          AND pp.status = 'awarded'
          AND p.status != 'archived'
        GROUP BY pcm."threadId", pct."projectId", p."projectName"
      `;

      for (const group of unreadProjectChat) {
        const latestMessage = await this.prisma.projectChatMessage.findFirst({
          where: {
            threadId: group.threadId,
            readByProAt: null,
            senderType: { not: 'professional' },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (latestMessage) {
          groups.push({
            projectId: group.projectId,
            projectName: group.projectName,
            unreadCount: Number(group.unreadCount),
            latestMessage: {
              id: latestMessage.id,
              content: latestMessage.content,
              createdAt: latestMessage.createdAt,
              senderType: latestMessage.senderType,
              senderName:
                latestMessage.senderType === 'professional'
                  ? 'Professional'
                  : latestMessage.senderType === 'client'
                  ? 'Client'
                  : 'Project Team',
            },
            chatType: 'project-general',
            threadId: group.threadId,
          });
        }
      }

      // 3. Private FOH support thread
      const privateChatThread = await this.prisma.privateChatThread.findUnique({
        where: { professionalId: professional.id },
      });

      if (privateChatThread) {
        const unreadPrivateCount = await this.prisma.privateChatMessage.count({
          where: {
            threadId: privateChatThread.id,
            readByProAt: null,
            senderType: 'foh',
          },
        });

        if (unreadPrivateCount > 0) {
          const latestMessage = await this.prisma.privateChatMessage.findFirst({
            where: {
              threadId: privateChatThread.id,
              readByProAt: null,
              senderType: 'foh',
            },
            orderBy: { createdAt: 'desc' },
          });

          if (latestMessage) {
            groups.push({
              projectId: 'private-support',
              projectName: 'FOH Support',
              unreadCount: unreadPrivateCount,
              latestMessage: {
                id: latestMessage.id,
                content: latestMessage.content,
                createdAt: latestMessage.createdAt,
                senderType: latestMessage.senderType,
                senderName:
                  latestMessage.senderType === 'foh'
                    ? 'FOH Support'
                    : latestMessage.senderType === 'client'
                    ? 'Client'
                    : 'Sender',
              },
              chatType: 'private-foh',
              threadId: privateChatThread.id,
            });
          }
        }
      }
    } else if (role === 'admin') {
      // Admin sees unread support messages from PrivateChatThread and AnonymousChatThread
      
      // 1. Private support threads - with readByFohAt tracking
      const unreadPrivateThreads = await this.prisma.privateChatThread.findMany({
        include: {
          messages: {
            where: {
              readByFohAt: null,
              senderType: { not: 'foh' },
            },
            orderBy: { createdAt: 'desc' },
          },
          user: {
            select: { firstName: true, surname: true },
          },
          professional: {
            select: { businessName: true },
          },
        },
      });

      for (const thread of unreadPrivateThreads) {
        if (thread.messages.length > 0) {
          const latestMessage = thread.messages[0];
          const userName = thread.user ? `${thread.user.firstName} ${thread.user.surname}` : undefined;
          const professionalName = thread.professional?.businessName;
          const senderName = userName || professionalName || 'User';

          groups.push({
            projectId: 'admin-support',
            projectName: 'Support Messages',
            unreadCount: thread.messages.length,
            latestMessage: {
              id: latestMessage.id,
              content: latestMessage.content,
              createdAt: latestMessage.createdAt,
              senderType: latestMessage.senderType,
              senderName,
            },
            chatType: 'private-foh',
            threadId: thread.id,
          });
        }
      }

      // 2. Anonymous support threads - no read tracking, show all non-FOH messages
      const anonymousThreads = await this.prisma.anonymousChatThread.findMany({
        include: {
          messages: {
            where: {
              senderType: { not: 'foh' },
            },
            orderBy: { createdAt: 'desc' },
            take: 1, // Only get latest message for grouping
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      for (const thread of anonymousThreads) {
        if (thread.messages.length > 0) {
          const latestMessage = thread.messages[0];
          
          // Count all messages from anonymous users (not FOH)
          const messageCount = await this.prisma.anonymousChatMessage.count({
            where: {
              threadId: thread.id,
              senderType: { not: 'foh' },
            },
          });

          if (messageCount > 0) {
            groups.push({
              projectId: 'admin-support',
              projectName: 'Support Messages',
              unreadCount: messageCount,
              latestMessage: {
                id: latestMessage.id,
                content: latestMessage.content,
                createdAt: latestMessage.createdAt,
                senderType: latestMessage.senderType,
                senderName: 'Anonymous User',
              },
              chatType: 'private-foh',
              threadId: thread.id,
            });
          }
        }
      }
    }

    return groups.sort(
      (a, b) =>
        b.latestMessage.createdAt.getTime() - a.latestMessage.createdAt.getTime(),
    );
  }

  async markMessageGroupAsRead(
    userId: string,
    role: 'client' | 'professional' | 'admin',
    body: {
      chatType: 'project-professional' | 'project-general' | 'assist' | 'private-foh';
      threadId: string;
    },
  ): Promise<{ success: boolean }> {
    const { chatType, threadId } = body;

    if (!chatType || !threadId) {
      throw new BadRequestException('chatType and threadId are required');
    }

    // Resolve professional record once if needed
    const professional =
      role === 'professional'
        ? await this.prisma.professional.findFirst({
            where: {
              OR: [{ userId }, { id: userId }],
            },
          })
        : null;

    if (role === 'professional' && !professional) {
      throw new BadRequestException('Professional not found');
    }

    if (chatType === 'project-professional') {
      const projectProfessional = await this.prisma.projectProfessional.findUnique({
        where: { id: threadId },
        include: { project: true },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project thread not found');
      }

      if (role === 'client') {
        if (
          projectProfessional.project.userId !== userId &&
          projectProfessional.project.clientId !== userId
        ) {
          throw new BadRequestException('Not authorized');
        }

        await this.prisma.message.updateMany({
          where: {
            projectProfessionalId: threadId,
            senderType: 'professional',
            readByClientAt: null,
          },
          data: { readByClientAt: new Date() },
        });
      } else if (role === 'professional') {
        if (projectProfessional.professionalId !== professional!.id) {
          throw new BadRequestException('Not authorized');
        }

        await this.prisma.message.updateMany({
          where: {
            projectProfessionalId: threadId,
            senderType: 'client',
            readByProfessionalAt: null,
          },
          data: { readByProfessionalAt: new Date() },
        });
      }
    } else if (chatType === 'project-general') {
      const thread = await this.prisma.projectChatThread.findUnique({
        where: { id: threadId },
        include: { project: true },
      });

      if (!thread) {
        throw new BadRequestException('Project chat not found');
      }

      if (role === 'client') {
        if (thread.project.userId !== userId && thread.project.clientId !== userId) {
          throw new BadRequestException('Not authorized');
        }

        await this.prisma.projectChatMessage.updateMany({
          where: {
            threadId,
            senderType: { not: 'client' },
            readByClientAt: null,
          },
          data: { readByClientAt: new Date() },
        });
      } else if (role === 'professional') {
        const awarded = await this.prisma.projectProfessional.findFirst({
          where: {
            projectId: thread.projectId,
            professionalId: professional!.id,
            status: 'awarded',
          },
        });

        if (!awarded) {
          throw new BadRequestException('Not authorized');
        }

        await this.prisma.projectChatMessage.updateMany({
          where: {
            threadId,
            senderType: { not: 'professional' },
            readByProAt: null,
          },
          data: { readByProAt: new Date() },
        });
      }
    } else if (chatType === 'assist') {
      const assistRequest = await this.prisma.projectAssistRequest.findUnique({
        where: { id: threadId },
        include: { project: true },
      });

      if (!assistRequest) {
        throw new BadRequestException('Assist request not found');
      }

      if (
        role !== 'client' ||
        (assistRequest.project.userId !== userId && assistRequest.project.clientId !== userId)
      ) {
        throw new BadRequestException('Not authorized');
      }

      await this.prisma.assistMessage.updateMany({
        where: {
          assistRequestId: threadId,
          senderType: 'foh',
          readByClientAt: null,
        },
        data: { readByClientAt: new Date() },
      });
    } else if (chatType === 'private-foh') {
      if (role === 'client') {
        const thread = await this.prisma.privateChatThread.findFirst({
          where: { id: threadId, userId },
        });

        if (!thread) {
          throw new BadRequestException('Support thread not found');
        }

        await this.prisma.privateChatMessage.updateMany({
          where: {
            threadId,
            senderType: 'foh',
            readByUserAt: null,
          },
          data: { readByUserAt: new Date() },
        });
      } else if (role === 'professional') {
        const thread = await this.prisma.privateChatThread.findFirst({
          where: { id: threadId, professionalId: professional!.id },
        });

        if (!thread) {
          throw new BadRequestException('Support thread not found');
        }

        await this.prisma.privateChatMessage.updateMany({
          where: {
            threadId,
            senderType: 'foh',
            readByProAt: null,
          },
          data: { readByProAt: new Date() },
        });
      }
    } else {
      throw new BadRequestException('Invalid chat type');
    }

    this.invalidateSummaryCache(userId, role);
    return { success: true };
  }

  /**
   * Get complete updates summary
   */
  async getUpdatesSummary(
    userId: string,
    role: 'client' | 'professional' | 'admin',
  ): Promise<UpdatesSummary> {
    const cached = this.getCachedSummary(userId, role);
    if (cached) {
      return cached;
    }

    try {
      const [financialActions, unreadMessages] = await Promise.all([
        this.getFinancialActions(userId, role).catch(err => {
          this.logger.error(
            `[getUpdatesSummary] Error fetching financial actions for userId=${userId}, role=${role}: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
          return [] as FinancialActionItem[];
        }),
        this.getUnreadMessages(userId, role).catch(err => {
          this.logger.error(
            `[getUpdatesSummary] Error fetching unread messages for userId=${userId}, role=${role}: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
          return [] as UnreadMessageGroup[];
        }),
      ]);

      const financialCount = financialActions.length;
      const unreadCount = unreadMessages.reduce((sum, g) => sum + g.unreadCount, 0);

      const summary: UpdatesSummary = {
        financialActions,
        financialCount,
        unreadMessages,
        unreadCount,
        totalCount: financialCount + unreadCount,
      };

      this.setCachedSummary(userId, role, summary);
      return summary;
    } catch (error) {
      this.logger.error(
        `[getUpdatesSummary] Unexpected error for userId=${userId}, role=${role}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      // Return empty summary instead of crashing
      return {
        financialActions: [],
        financialCount: 0,
        unreadMessages: [],
        unreadCount: 0,
        totalCount: 0,
      };
    }
  }
}
