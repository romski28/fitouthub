import { BadRequestException, Injectable } from '@nestjs/common';
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

@Injectable()
export class UpdatesService {
  constructor(private prisma: PrismaService) {}

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

    console.log(`[getFinancialActions] Role: ${role}, Found ${transactions.length} transactions`);
    if (role === 'admin') {
      console.log(`[getFinancialActions] Platform tasks:`, transactions.filter(t => t.actionByRole === 'platform').map(t => ({
        id: t.id,
        type: t.type,
        actionByRole: t.actionByRole,
        actionBy: t.actionBy,
        actionComplete: t.actionComplete,
        status: t.status,
      })));
    }

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

    // For clients (and admins who own projects), add pending quotations that need review
    if (role === 'client' || role === 'admin') {
      console.log(`[getFinancialActions] ${role} role detected, fetching pending quotations...`);
      const pendingQuotations = await this.getPendingQuotations(userId);
      console.log(`[getFinancialActions] Found ${pendingQuotations.length} pending quotations for user ${userId}`);
      actions = [...actions, ...pendingQuotations];
      // Sort by creation date descending
      actions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    console.log(`[getFinancialActions] Returning ${actions.length} total actions`);
    return actions;
  }

  /**
   * Get projects with pending quotations for a client (status='quoted', not yet accepted)
   */
  private async getPendingQuotations(clientId: string): Promise<FinancialActionItem[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [
          { userId: clientId },
          { clientId: clientId },
        ],
        professionals: {
          some: {
            status: 'quoted',  // Professional has quoted but client hasn't accepted
          },
        },
      },
      include: {
        professionals: {
          where: {
            status: 'quoted',
          },
          include: {
            professional: {
              select: {
                businessName: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    console.log(`[getPendingQuotations] Found ${projects.length} projects with quoted professionals for client ${clientId}`);
    if (projects.length > 0) {
      console.log('[getPendingQuotations] Projects:', projects.map(p => ({
        id: p.id,
        name: p.projectName,
        quotedProfessionals: p.professionals.length,
      })));
    }

    return projects.flatMap((project) =>
      project.professionals.map((pp) => ({
        id: `quotation-${pp.id}`,  // Synthetic ID for quotation items
        type: 'quotation_review',
        description: `Project quotation in progress, please review`,
        amount: pp.quoteAmount?.toString() || '0',
        status: 'pending',
        projectId: project.id,
        projectName: project.projectName || 'Project',
        createdAt: pp.quotedAt || new Date(),
        requestedBy: pp.professionalId,
        requestedByRole: 'professional',
      })),
    );
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
        console.log('[UpdatesService.getUnreadMessages] Professional not found for userId:', userId);
        return [];
      }

      console.log('[UpdatesService.getUnreadMessages] Found professional:', professional.id);

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
        GROUP BY m."projectProfessionalId", p.id, p."projectName"
      `;

      console.log('[UpdatesService.getUnreadMessages] Unread client messages found:', unreadClientMessages.length);

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
    }
    // Admin role would have different logic (FOH inbox)

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

    return { success: true };
  }

  /**
   * Get complete updates summary
   */
  async getUpdatesSummary(
    userId: string,
    role: 'client' | 'professional' | 'admin',
  ): Promise<UpdatesSummary> {
    console.log(`[getUpdatesSummary] Starting for userId: ${userId}, role: ${role}`);
    
    const [financialActions, unreadMessages] = await Promise.all([
      this.getFinancialActions(userId, role),
      this.getUnreadMessages(userId, role),
    ]);

    console.log(`[getUpdatesSummary] financialActions count: ${financialActions.length}`);
    if (financialActions.length > 0) {
      console.log('[getUpdatesSummary] Financial actions:', financialActions.map(a => ({ id: a.id, type: a.type, description: a.description, projectId: a.projectId })));
    }

    const financialCount = financialActions.length;
    const unreadCount = unreadMessages.reduce((sum, g) => sum + g.unreadCount, 0);

    return {
      financialActions,
      financialCount,
      unreadMessages,
      unreadCount,
      totalCount: financialCount + unreadCount,
    };
  }
}
