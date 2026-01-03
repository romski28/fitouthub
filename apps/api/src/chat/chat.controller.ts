import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { CreatePrivateMessageDto } from './dto/create-private-message.dto';
import { CreateAnonymousMessageDto } from './dto/anonymous-chat.dto';
import { CreateProjectChatMessageDto } from './dto/project-chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ===== PRIVATE CHAT ENDPOINTS =====

  /**
   * GET /chat/private - Get or create user's private FOH support thread
   * Requires authentication
   */
  @Get('private')
  @UseGuards(AuthGuard('jwt'))
  async getOrCreatePrivateThread(@Request() req: any) {
    const userId = req.user.isProfessional ? undefined : req.user.id;
    const professionalId = req.user.isProfessional ? req.user.id : undefined;
    return this.chatService.getOrCreatePrivateThread(userId, professionalId);
  }

  /**
   * POST /chat/private - Create a new private thread (in case of edge case)
   * Requires authentication
   */
  @Post('private')
  @UseGuards(AuthGuard('jwt'))
  async createPrivateThread(@Request() req: any) {
    // Just return existing or create new one
    const userId = req.user.isProfessional ? undefined : req.user.id;
    const professionalId = req.user.isProfessional ? req.user.id : undefined;
    return this.chatService.getOrCreatePrivateThread(userId, professionalId);
  }

  /**
   * GET /chat/private/:threadId - Get a specific private thread
   * Requires authentication
   */
  @Get('private/:threadId')
  @UseGuards(AuthGuard('jwt'))
  async getPrivateThread(@Param('threadId') threadId: string) {
    return this.chatService.getPrivateThread(threadId);
  }

  /**
   * POST /chat/private/:threadId/messages - Send a message to private thread
   * Requires authentication
   */
  @Post('private/:threadId/messages')
  @UseGuards(AuthGuard('jwt'))
  async addPrivateMessage(
    @Param('threadId') threadId: string,
    @Body() dto: CreatePrivateMessageDto,
    @Request() req: any,
  ) {
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('Message content cannot be empty');
    }

    // Determine sender type (user or professional)
    const senderType = req.user.isProfessional ? 'professional' : 'user';
    const message = await this.chatService.addPrivateMessage(
      threadId,
      senderType,
      req.user.isProfessional ? null : req.user.id,
      req.user.isProfessional ? req.user.id : null,
      dto.content,
    );

    return { message };
  }

  /**
   * POST /chat/private/:threadId/read - Mark private thread as read by FOH
   * Requires authentication (FOH only, but we'll accept any request for now)
   */
  @Post('private/:threadId/read')
  @UseGuards(AuthGuard('jwt'))
  async markPrivateAsRead(@Param('threadId') threadId: string) {
    await this.chatService.markPrivateThreadAsRead(threadId);
    return { success: true };
  }

  // ===== ANONYMOUS CHAT ENDPOINTS =====

  /**
   * POST /chat/anonymous - Create a new anonymous thread
   */
  @Post('anonymous')
  async createAnonymousThread(@Headers('x-session-id') sessionId?: string) {
    const finalSessionId = sessionId || `anon-${Date.now()}-${Math.random()}`;
    return this.chatService.createAnonymousThread(finalSessionId);
  }

  /**
   * GET /chat/anonymous/:threadId - Get an anonymous thread
   */
  @Get('anonymous/:threadId')
  async getAnonymousThread(@Param('threadId') threadId: string) {
    return this.chatService.getAnonymousThread(threadId);
  }

  /**
   * POST /chat/anonymous/:threadId/messages - Send a message to anonymous thread
   */
  @Post('anonymous/:threadId/messages')
  async addAnonymousMessage(
    @Param('threadId') threadId: string,
    @Body() dto: CreateAnonymousMessageDto,
  ) {
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('Message content cannot be empty');
    }

    const message = await this.chatService.addAnonymousMessage(
      threadId,
      'anonymous',
      dto.content,
    );

    return { message };
  }

  // ===== ADMIN ENDPOINTS =====

  /**
   * GET /chat/admin/inbox - Get all threads for FOH admin inbox
   * TODO: Add proper admin authentication guard
   */
  @Get('admin/inbox')
  async getAdminInbox() {
    return this.chatService.getAllThreadsForAdmin();
  }

  // ===== PROJECT CHAT ENDPOINTS =====

  /**
   * GET /projects/:projectId/chat - Get or create project chat thread
   * Requires authentication
   */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getProjectThreadViaQuery(@Request() req: any) {
    // This is a workaround for routing - actual endpoint is /projects/:projectId/chat
    throw new BadRequestException('Use /projects/:projectId/chat instead');
  }

  /**
   * POST /projects/:projectId/chat - Create or get project chat thread
   * Requires authentication
   */
  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createProjectThread(@Request() req: any) {
    // This is a workaround for routing
    throw new BadRequestException('Use /projects/:projectId/chat instead');
  }

  /**
   * GET /projects/:projectId/chat/:messageId - Get project chat
   * Implemented in projects controller for proper routing
   */
}
