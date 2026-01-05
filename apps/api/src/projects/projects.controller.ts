import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ChatService } from '../chat/chat.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly chatService: ChatService,
  ) {}

  @Get()
  async findAll() {
    return this.projectsService.findAll();
  }

  @Get('canonical')
  async findCanonical(@Query('clientId') clientId?: string) {
    return this.projectsService.findCanonical(clientId);
  }

  @Get('respond')
  async respond(
    @Query('token') token: string,
    @Query('action') action: 'accept' | 'decline',
  ) {
    const webBaseUrl =
      process.env.WEB_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.APP_WEB_URL ||
      'https://fitouthub-web.vercel.app';

    if (!token || !action) {
      return this.renderResponsePage({
        title: 'Link invalid',
        message: 'Token and action are required.',
        action,
        webBaseUrl,
      });
    }

    try {
      const result = await this.projectsService.respondToInvitation(
        token,
        action,
      );
      return this.renderResponsePage({
        title: action === 'accept' ? '✅ Project Accepted!' : '❌ Project Declined',
        message: result.message,
        action,
        webBaseUrl,
        projectId: result.projectId,
        professionalId: result.professionalId,
      });
    } catch (error) {
      // Gracefully show a user-facing page instead of a raw 400
      const msg = error?.message || 'Failed to process response';
      return this.renderResponsePage({
        title: 'Link expired or invalid',
        message: msg,
        action,
        webBaseUrl,
      });
    }
  }

  private renderResponsePage(params: {
    title: string;
    message: string;
    action: 'accept' | 'decline';
    webBaseUrl: string;
    projectId?: string;
    professionalId?: string;
  }) {
    const { title, message, action, webBaseUrl, projectId, professionalId } = params;
    const buttonHtml =
      action === 'accept' && projectId && professionalId
        ? `<a href="${webBaseUrl}/professional-projects/${projectId}?pro=${professionalId}">View Project & Submit Quote</a>`
        : `<p style="color: #6b7280; margin-top: 20px; font-weight: 500;">You may now close this window or return to your dashboard.</p><a href="${webBaseUrl}/" style="margin-top: 10px;">Return to Dashboard</a>`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f3f4f6; }
            .card { background: white; border-radius: 12px; padding: 40px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h1 { color: ${action === 'accept' ? '#10b981' : '#6b7280'}; margin: 0 0 15px 0; }
            p { color: #6b7280; line-height: 1.6; }
            a { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
            a:hover { background: #4338ca; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${title}</h1>
            <p>${message}</p>
            ${buttonHtml}
          </div>
        </body>
      </html>
    `;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/tokens')
  async getEmailTokens(@Param('id') projectId: string) {
    return this.projectsService.getEmailTokens(projectId);
  }

  @Get(':id/professionals')
  async getProjectProfessionals(@Param('id') projectId: string) {
    return this.projectsService.getProjectProfessionals(projectId);
  }

  @Post()
  async create(@Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(createProjectDto);
  }

  @Post(':id/invite')
  async invite(
    @Param('id') projectId: string,
    @Body() body: { professionalIds: string[] },
  ) {
    return this.projectsService.inviteProfessionals(
      projectId,
      body.professionalIds,
    );
  }

  // Persist professional selections without inviting them yet
  @Post(':id/select')
  async select(
    @Param('id') projectId: string,
    @Body() body: { professionalIds: string[] },
  ) {
    return this.projectsService.selectProfessionals(
      projectId,
      body.professionalIds,
    );
  }

  @Post(':id/quote')
  async submitQuote(
    @Param('id') projectId: string,
    @Body()
    quoteDto: {
      professionalId: string;
      quoteAmount: number;
      quoteNotes?: string;
    },
  ) {
    return this.projectsService.submitQuote(
      projectId,
      quoteDto.professionalId,
      quoteDto.quoteAmount,
      quoteDto.quoteNotes,
    );
  }

  @Post(':id/award/:professionalId')
  async awardQuote(
    @Param('id') projectId: string,
    @Param('professionalId') professionalId: string,
  ) {
    return this.projectsService.awardQuote(projectId, professionalId);
  }

  @Post(':id/share-contact/:professionalId')
  async shareContact(
    @Param('id') projectId: string,
    @Param('professionalId') professionalId: string,
    @Body() body?: { clientId?: string },
  ) {
    return this.projectsService.shareContact(
      projectId,
      professionalId,
      body?.clientId,
    );
  }

  @Post(':id/counter-request/:professionalId')
  async counterRequest(
    @Param('id') projectId: string,
    @Param('professionalId') professionalId: string,
  ) {
    return this.projectsService.counterRequest(projectId, professionalId);
  }

  @Post(':id/update-quote')
  async updateQuote(
    @Param('id') projectId: string,
    @Body()
    body: { professionalId: string; quoteAmount: number; quoteNotes?: string },
  ) {
    return this.projectsService.updateQuote(
      projectId,
      body.professionalId,
      body.quoteAmount,
      body.quoteNotes,
    );
  }

  @Post(':id/schedule')
  async updateSchedule(
    @Param('id') projectId: string,
    @Body() body: { startDate?: string; endDate?: string },
  ) {
    return this.projectsService.updateProjectSchedule(
      projectId,
      body.startDate,
      body.endDate,
    );
  }

  @Post(':id/contractor-contact')
  async updateContractorContact(
    @Param('id') projectId: string,
    @Body() body: { name?: string; phone?: string; email?: string },
  ) {
    return this.projectsService.updateContractorContact(
      projectId,
      body.name,
      body.phone,
      body.email,
    );
  }

  @Post(':id/withdraw')
  @UseGuards(AuthGuard('jwt'))
  async withdraw(
    @Param('id') projectId: string,
    @Request() req: any,
  ) {
    return this.projectsService.withdrawProject(projectId, req.user.id);
  }

  @Post(':id/pay-invoice')
  @UseGuards(AuthGuard('jwt'))
  async payInvoice(
    @Param('id') projectId: string,
    @Request() req: any,
  ) {
    return this.projectsService.payInvoice(projectId, req.user.id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, updateProjectDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }

  // ===== PROJECT PHOTO ENDPOINTS =====

  /**
   * DELETE /projects/:projectId/photos/:photoId - Delete a photo and remove from storage
   */
  @Delete(':projectId/photos/:photoId')
  async deletePhoto(
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.projectsService.deletePhoto(projectId, photoId);
  }

  /**
   * PUT /projects/:projectId/photos/:photoId - Update a photo's note
   */
  @Put(':projectId/photos/:photoId')
  async updatePhoto(
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
    @Body() body: { note?: string },
  ) {
    return this.projectsService.updatePhoto(projectId, photoId, body.note);
  }

  // ===== PROJECT CHAT ENDPOINTS =====

  /**
   * GET /projects/:projectId/chat - Get or create project chat thread
   * Requires authentication (client or professional token)
   */
  @Get(':projectId/chat')
  @UseGuards(CombinedAuthGuard)
  async getProjectChat(@Param('projectId') projectId: string) {
    return this.chatService.getOrCreateProjectThread(projectId);
  }

  /**
   * POST /projects/:projectId/chat - Create project chat (same as GET, but for POST requests)
   * Requires authentication (client or professional token)
   */
  @Post(':projectId/chat')
  @UseGuards(CombinedAuthGuard)
  async createProjectChat(@Param('projectId') projectId: string) {
    return this.chatService.getOrCreateProjectThread(projectId);
  }

  /**
   * POST /projects/:projectId/chat/messages - Send a message to project chat
   * Requires authentication (client or professional token)
   */
  @Post(':projectId/chat/messages')
  @UseGuards(CombinedAuthGuard)
  async addProjectMessage(
    @Param('projectId') projectId: string,
    @Body() body: { content: string },
    @Request() req: any,
  ) {
    if (!body.content || !body.content.trim()) {
      throw new BadRequestException('Message content cannot be empty');
    }

    // Get the thread first
    const thread = await this.chatService.getOrCreateProjectThread(projectId);

    // Determine sender type
    const senderType = req.user.isProfessional ? 'professional' : 'client';
    const message = await this.chatService.addProjectMessage(
      thread.id,
      senderType,
      req.user.isProfessional ? null : req.user.id,
      req.user.isProfessional ? req.user.id : null,
      body.content,
    );

    return { message };
  }

  /**
   * POST /projects/:projectId/chat/read - Mark project chat as read
   * Requires authentication (client or professional token)
   */
  @Post(':projectId/chat/read')
  @UseGuards(CombinedAuthGuard)
  async markProjectChatAsRead(@Param('projectId') projectId: string) {
    // Get the thread
    const thread = await this.chatService.getOrCreateProjectThread(projectId);

    // In a full implementation, we'd track read status per user
    // For now, just return success
    return { success: true };
  }
}
