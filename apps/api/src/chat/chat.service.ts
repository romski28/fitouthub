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
   * Get or create a private chat thread for logged-in user
   */
  async getOrCreatePrivateThread(userId: string): Promise<PrivateChatThreadDto> {
    let thread = await this.prisma.privateChatThread.findUnique({
      where: { userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!thread) {
      thread = await this.prisma.privateChatThread.create({
        data: { userId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
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
      include: { messages: { orderBy: { createdAt: 'asc' } } },
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
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!thread) {
      thread = await this.prisma.projectChatThread.create({
        data: { projectId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
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
      include: { messages: { orderBy: { createdAt: 'asc' } } },
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
}
