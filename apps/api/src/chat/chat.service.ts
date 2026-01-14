import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PrivateChatThreadDto, PrivateChatMessageDto } from './dto/private-chat.dto';
import { AnonymousChatThreadDto, AnonymousChatMessageDto } from './dto/anonymous-chat.dto';
import { ProjectChatThreadDto, ProjectChatMessageDto } from './dto/project-chat.dto';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // ===== PRIVATE CHAT (FOH Support) =====

  /**
   * Get or create a private chat thread for logged-in user or professional
   */
  async getOrCreatePrivateThread(
    userId?: string,
    professionalId?: string,
  ): Promise<PrivateChatThreadDto> {
    // Find thread by either userId or professionalId (whichever is provided)
    let thread = userId
      ? await this.prisma.privateChatThread.findUnique({
          where: { userId },
          include: {
            messages: { orderBy: { createdAt: 'asc' } },
            user: { select: { firstName: true, surname: true, email: true } },
            professional: { select: { businessName: true, email: true } },
          },
        })
      : professionalId
      ? await this.prisma.privateChatThread.findUnique({
          where: { professionalId },
          include: {
            messages: { orderBy: { createdAt: 'asc' } },
            user: { select: { firstName: true, surname: true, email: true } },
            professional: { select: { businessName: true, email: true } },
          },
        })
      : null;

    if (!thread) {
      thread = await this.prisma.privateChatThread.create({
        data: userId ? { userId } : { professionalId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          user: { select: { firstName: true, surname: true, email: true } },
          professional: { select: { businessName: true, email: true } },
        },
      });
    }

    return this.mapPrivateThreadDto(thread);
  }

  /**
   * Get a private chat thread with messages
   */
  async getPrivateThread(threadId: string): Promise<PrivateChatThreadDto> {
    const thread = await this.prisma.privateChatThread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        user: { select: { firstName: true, surname: true, email: true } },
        professional: { select: { businessName: true, email: true } },
      },
    });

    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }

    return this.mapPrivateThreadDto(thread);
  }

  /**
   * Add a message to a private chat thread
   */
  async addPrivateMessage(
    threadId: string,
    senderType: string,
    senderUserId: string | null,
    senderProId: string | null,
    content: string,
    attachments?: any[],
  ): Promise<PrivateChatMessageDto> {
    const thread = await this.prisma.privateChatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }

    const message = await this.prisma.privateChatMessage.create({
      data: {
        threadId,
        senderType,
        senderUserId,
        senderProId,
        content,
        attachments: attachments || [],
      },
    });

    // Update thread's updatedAt
    await this.prisma.privateChatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return this.mapPrivateMessageDto(message);
  }

  /**
   * Mark private thread as read by FOH
   */
  async markPrivateThreadAsRead(threadId: string): Promise<void> {
    await this.prisma.privateChatMessage.updateMany({
      where: { threadId },
      data: { readByFohAt: new Date() },
    });
  }

  // ===== ANONYMOUS CHAT =====

  /**
   * Create an anonymous chat thread
   */
  async createAnonymousThread(sessionId: string): Promise<AnonymousChatThreadDto> {
    const thread = await this.prisma.anonymousChatThread.create({
      data: { sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return this.mapAnonymousThreadDto(thread);
  }

  /**
   * Get an anonymous chat thread
   */
  async getAnonymousThread(threadId: string): Promise<AnonymousChatThreadDto> {
    const thread = await this.prisma.anonymousChatThread.findUnique({
      where: { id: threadId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!thread) {
      throw new NotFoundException('Anonymous chat thread not found');
    }

    return this.mapAnonymousThreadDto(thread);
  }

  /**
   * Add a message to an anonymous thread
   */
  async addAnonymousMessage(
    threadId: string,
    senderType: string,
    content: string,
    attachments?: any[],
  ): Promise<AnonymousChatMessageDto> {
    const thread = await this.prisma.anonymousChatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Anonymous chat thread not found');
    }

    const message = await this.prisma.anonymousChatMessage.create({
      data: {
        threadId,
        senderType,
        content,
        attachments: attachments || [],
      },
    });

    // Update thread's updatedAt
    await this.prisma.anonymousChatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return this.mapAnonymousMessageDto(message);
  }

  // ===== PROJECT CHAT (Post-Award Team Chat) =====

  /**
   * Get or create a project chat thread
   */
  async getOrCreateProjectThread(projectId: string): Promise<ProjectChatThreadDto> {
    let thread = await this.prisma.projectChatThread.findUnique({
      where: { projectId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        project: { select: { projectName: true } },
      },
    });

    if (!thread) {
      thread = await this.prisma.projectChatThread.create({
        data: { projectId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          project: { select: { projectName: true } },
        },
      });
    }

    return this.mapProjectThreadDto(thread);
  }

  /**
   * Get a project chat thread
   */
  async getProjectThread(threadId: string): Promise<ProjectChatThreadDto> {
    const thread = await this.prisma.projectChatThread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        project: { select: { projectName: true } },
      },
    });

    if (!thread) {
      throw new NotFoundException('Project chat thread not found');
    }

    return this.mapProjectThreadDto(thread);
  }

  /**
   * Add a message to a project chat thread
   */
  async addProjectMessage(
    threadId: string,
    senderType: string,
    senderUserId: string | null,
    senderProId: string | null,
    content: string,
    attachments?: any[],
  ): Promise<ProjectChatMessageDto> {
    const thread = await this.prisma.projectChatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Project chat thread not found');
    }

    const message = await this.prisma.projectChatMessage.create({
      data: {
        threadId,
        senderType,
        senderUserId,
        senderProId,
        content,
        attachments: attachments || [],
      },
    });

    // Update thread's updatedAt
    await this.prisma.projectChatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return this.mapProjectMessageDto(message);
  }

  // ===== HELPER MAPPERS =====

  private mapPrivateThreadDto(thread: any): PrivateChatThreadDto {
    return {
      id: thread.id,
      threadId: thread.id, // Alias for frontend compatibility
      userId: thread.userId,
      professionalId: thread.professionalId,
      userName: thread.user ? `${thread.user.firstName} ${thread.user.surname}` : undefined,
      professionalName: thread.professional?.businessName,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      messages: thread.messages.map((m: any) => this.mapPrivateMessageDto(m)),
      unreadCount: thread.messages.filter((m: any) => m.senderType === 'foh' && !m.readByFohAt).length,
    };
  }

  private mapPrivateMessageDto(message: any): PrivateChatMessageDto {
    return {
      id: message.id,
      threadId: message.threadId,
      senderType: message.senderType,
      senderUserId: message.senderUserId,
      senderProId: message.senderProId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      readByFohAt: message.readByFohAt?.toISOString(),
    };
  }

  private mapAnonymousThreadDto(thread: any): AnonymousChatThreadDto {
    return {
      id: thread.id,
      threadId: thread.id,
      sessionId: thread.sessionId,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      messages: thread.messages.map((m: any) => this.mapAnonymousMessageDto(m)),
    };
  }

  private mapAnonymousMessageDto(message: any): AnonymousChatMessageDto {
    return {
      id: message.id,
      threadId: message.threadId,
      senderType: message.senderType,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private mapProjectThreadDto(thread: any): ProjectChatThreadDto {
    return {
      id: thread.id,
      threadId: thread.id,
      projectId: thread.projectId,
      projectName: thread.project?.projectName,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      messages: thread.messages.map((m: any) => this.mapProjectMessageDto(m)),
    };
  }

  private mapProjectMessageDto(message: any): ProjectChatMessageDto {
    return {
      id: message.id,
      threadId: message.threadId,
      senderType: message.senderType,
      senderUserId: message.senderUserId,
      senderProId: message.senderProId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  // ===== ADMIN INBOX =====

  /**
   * Get all threads for admin FOH inbox
   */
  async getAllThreadsForAdmin() {
    // Fetch private threads
    const privateThreads = await this.prisma.privateChatThread.findMany({
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        user: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
        professional: {
          select: { id: true, businessName: true, email: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Fetch anonymous threads
    const anonymousThreads = await this.prisma.anonymousChatThread.findMany({
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Fetch project threads
    const projectThreads = await this.prisma.projectChatThread.findMany({
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        project: {
          select: { id: true, projectName: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Get unread counts separately for efficiency
    const unreadCounts = await Promise.all(
      privateThreads.map(async (thread) => {
        const count = await this.prisma.privateChatMessage.count({
          where: {
            threadId: thread.id,
            readByFohAt: null,
            senderType: { not: 'foh' },
          },
        });
        return { threadId: thread.id, count };
      }),
    );

    const unreadMap = Object.fromEntries(
      unreadCounts.map((item) => [item.threadId, item.count]),
    );

    // Map to unified format
    const threads = [
      ...privateThreads.map((thread) => ({
        id: thread.id,
        type: 'private' as const,
        userId: thread.userId,
        professionalId: thread.professionalId,
        userName: thread.user ? `${thread.user.firstName} ${thread.user.surname}` : undefined,
        professionalName: thread.professional?.businessName,
        updatedAt: thread.updatedAt.toISOString(),
        unreadCount: unreadMap[thread.id] || 0,
        lastMessage: thread.messages[0]?.content,
      })),
      ...anonymousThreads.map((thread) => ({
        id: thread.id,
        type: 'anonymous' as const,
        sessionId: thread.sessionId,
        updatedAt: thread.updatedAt.toISOString(),
        unreadCount: 0, // Anonymous threads don't track read status yet
        lastMessage: thread.messages[0]?.content,
      })),
      ...projectThreads.map((thread) => ({
        id: thread.id,
        type: 'project' as const,
        projectId: thread.projectId,
        projectName: thread.project?.projectName,
        updatedAt: thread.updatedAt.toISOString(),
        unreadCount: 0, // Project threads don't track read status per user
        lastMessage: thread.messages[0]?.content,
      })),
    ];

    // Sort all threads by updatedAt
    threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { threads };
  }
}
