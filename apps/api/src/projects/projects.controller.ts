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
  Patch,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { RequestSiteAccessDto } from './dto/request-site-access.dto';
import { RespondSiteAccessRequestDto } from './dto/respond-site-access-request.dto';
import { SiteAccessDataDto } from './dto/site-access-data.dto';
import { RequestSiteVisitDto } from './dto/request-site-visit.dto';
import { RespondSiteVisitDto } from './dto/respond-site-visit.dto';
import { ConfirmSiteVisitDto } from './dto/confirm-site-visit.dto';
import { ProjectLocationDetailsDto } from './dto/project-location-details.dto';
import { ChatService } from '../chat/chat.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';
import { PrismaService } from '../prisma.service';
import { NextStepService } from './next-step.service';
import { AdminActionService } from './admin-action.service';
import { ProjectStageService } from './project-stage.service';
import { ContractService } from './contract.service';
import { RecordNextStepActionDto, TransitionProjectStageDto, PauseProjectDto, ResumeProjectDto, DisputeProjectDto } from './dto/next-step.dto';
import { CreateAdminActionDto, UpdateAdminActionDto, AssignAdminActionDto, CompleteAdminActionDto } from './dto/admin-action.dto';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly nextStepService: NextStepService,
    private readonly adminActionService: AdminActionService,
    private readonly projectStageService: ProjectStageService,
    private readonly contractService: ContractService,
  ) {}

  @Get()
  @UseGuards(CombinedAuthGuard)
  async findAll(@Request() req: any) {
    try {
      const userId = req.user?.id || req.user?.sub;
      const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;
      const isProfessionalFlag = req.user?.isProfessional;

      let role: 'client' | 'professional' | 'admin' = 'client';
      if (tokenRole === 'admin') {
        role = 'admin';
      } else if (tokenRole === 'professional' || isProfessionalFlag) {
        role = 'professional';
      } else {
        role = 'client';
      }

      if (!userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      if (role === 'admin') {
        return this.projectsService.findAll();
      }

      if (role === 'client') {
        return await this.projectsService.findAllForClient(userId);
      }

      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    } catch (error) {
      console.error('[ProjectsController.findAll] Error:', error?.message);
      throw error;
    }
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
        projectProfessionalId: result.projectProfessionalId,
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
    projectProfessionalId?: string;
  }) {
    const { title, message, action, webBaseUrl, projectId, professionalId, projectProfessionalId } = params;
    const buttonHtml =
      action === 'accept' && projectProfessionalId
        ? `<a href="${webBaseUrl}/professional-projects/${projectProfessionalId}">View Project & Submit Quote</a>`
        : action === 'accept' && projectId && professionalId
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
  @UseGuards(CombinedAuthGuard)
  async findOne(@Param('id') id: string, @Request() req: any) {
    try {
      const userId = req.user?.id || req.user?.sub;
      const tokenRole = req.user?.role as 'admin' | 'client' | 'professional' | undefined;
      const isProfessionalFlag = req.user?.isProfessional;

      console.log('[ProjectsController.findOne] Request for project:', id, 'userId:', userId, 'role:', tokenRole);

      let role: 'client' | 'professional' | 'admin' = 'client';
      if (tokenRole === 'admin') {
        role = 'admin';
      } else if (tokenRole === 'professional' || isProfessionalFlag) {
        role = 'professional';
      } else {
        role = 'client';
      }

      if (!userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      if (role === 'admin') {
        const project = await this.projectsService.findOne(id);
        console.log('[ProjectsController.findOne] Found project for admin:', !!project);
        return project;
      }

      if (role === 'client') {
        const project = await this.projectsService.findOneForClient(id, userId);
        console.log('[ProjectsController.findOne] Found project for client:', !!project);
        return project;
      }

      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    } catch (error) {
      console.error('[ProjectsController.findOne] Error fetching project:', id, error?.message, error?.stack);
      throw error;
    }
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
  @UseGuards(CombinedAuthGuard)
  async create(@Body() createProjectDto: CreateProjectDto, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    if (userId) {
      createProjectDto.userId = userId;
    }
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

  @Post(':id/site-access/request')
  @UseGuards(CombinedAuthGuard)
  async requestSiteAccess(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() body: RequestSiteAccessDto,
  ) {
    if (!req.user?.isProfessional) {
      throw new HttpException('Only professionals can request site access', HttpStatus.FORBIDDEN);
    }

    const professionalId = body.professionalId || req.user?.id || req.user?.sub;
    if (!professionalId) {
      throw new HttpException('Professional not found', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.requestSiteAccess(projectId, professionalId);
  }

  @Post(':id/site-access-data')
  @UseGuards(CombinedAuthGuard)
  async submitSiteAccessData(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() body: SiteAccessDataDto,
  ) {
    if (req.user?.isProfessional) {
      throw new HttpException('Only clients can submit site access data', HttpStatus.FORBIDDEN);
    }

    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.submitSiteAccessData(projectId, userId, body);
  }

  @Put('site-access-requests/:requestId/respond')
  @UseGuards(CombinedAuthGuard)
  async respondToSiteAccessRequest(
    @Param('requestId') requestId: string,
    @Request() req: any,
    @Body() body: RespondSiteAccessRequestDto,
  ) {
    if (req.user?.isProfessional) {
      throw new HttpException('Only clients can respond to site access requests', HttpStatus.FORBIDDEN);
    }

    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.respondToSiteAccessRequest(requestId, userId, body);
  }

  @Put('site-access-requests/:requestId/confirm-visit')
  @UseGuards(CombinedAuthGuard)
  async confirmSiteVisit(
    @Param('requestId') requestId: string,
    @Request() req: any,
    @Body() body: ConfirmSiteVisitDto,
  ) {
    if (!req.user?.isProfessional) {
      throw new HttpException('Only professionals can confirm site visits', HttpStatus.FORBIDDEN);
    }

    const professionalId = req.user?.id || req.user?.sub;
    if (!professionalId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.confirmSiteVisit(requestId, professionalId, body);
  }

  @Post(':id/site-visits')
  @UseGuards(CombinedAuthGuard)
  async requestSiteVisit(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() body: RequestSiteVisitDto,
  ) {
    if (!req.user?.isProfessional) {
      throw new HttpException('Only professionals can request site visits', HttpStatus.FORBIDDEN);
    }

    const professionalId = req.user?.id || req.user?.sub;
    if (!professionalId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.requestSiteVisit(projectId, professionalId, body);
  }

  @Put('site-visits/:visitId/respond')
  @UseGuards(CombinedAuthGuard)
  async respondToSiteVisit(
    @Param('visitId') visitId: string,
    @Request() req: any,
    @Body() body: RespondSiteVisitDto,
  ) {
    const isProfessional = !!req.user?.isProfessional;
    const actorId = req.user?.id || req.user?.sub;
    if (!actorId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.respondToSiteVisit(visitId, actorId, isProfessional, body);
  }

  @Put('site-visits/:visitId/complete')
  @UseGuards(CombinedAuthGuard)
  async completeSiteVisit(
    @Param('visitId') visitId: string,
    @Request() req: any,
    @Body() body: ConfirmSiteVisitDto,
  ) {
    if (!req.user?.isProfessional) {
      throw new HttpException('Only professionals can complete site visits', HttpStatus.FORBIDDEN);
    }

    const professionalId = req.user?.id || req.user?.sub;
    if (!professionalId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.completeSiteVisit(visitId, professionalId, body);
  }

  @Get(':id/site-access/status')
  @UseGuards(CombinedAuthGuard)
  async getSiteAccessStatus(
    @Param('id') projectId: string,
    @Request() req: any,
  ) {
    if (!req.user?.isProfessional) {
      throw new HttpException('Only professionals can view site access status', HttpStatus.FORBIDDEN);
    }

    const professionalId = req.user?.id || req.user?.sub;
    if (!professionalId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.getSiteAccessStatus(projectId, professionalId);
  }

  @Get(':id/site-visits')
  @UseGuards(CombinedAuthGuard)
  async getSiteVisits(
    @Param('id') projectId: string,
    @Request() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    if (!actorId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.getSiteVisits(projectId, actorId, !!req.user?.isProfessional);
  }

  @Get(':id/site-access/requests')
  @UseGuards(CombinedAuthGuard)
  async getSiteAccessRequests(
    @Param('id') projectId: string,
    @Request() req: any,
  ) {
    if (req.user?.isProfessional) {
      throw new HttpException('Only clients can view site access requests', HttpStatus.FORBIDDEN);
    }

    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.getSiteAccessRequests(projectId, userId);
  }

  @Post(':id/location-details')
  @UseGuards(CombinedAuthGuard)
  async submitLocationDetails(
    @Param('id') projectId: string,
    @Request() req: any,
    @Body() body: ProjectLocationDetailsDto,
  ) {
    if (req.user?.isProfessional) {
      throw new HttpException('Only clients can submit location details', HttpStatus.FORBIDDEN);
    }

    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.projectsService.submitLocationDetails(projectId, userId, body);
  }

  @Post(':id/transactions/:transactionId/confirm-deposit')
  @UseGuards(AuthGuard('jwt'))
  async confirmDepositPaid(
    @Param('id') projectId: string,
    @Param('transactionId') transactionId: string,
    @Request() req: any,
  ) {
    return this.projectsService.confirmDepositPaid(transactionId, projectId);
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

  // Removed pay-invoice endpoint; payments are handled via escrow and payment requests

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

  // ===== PROJECT FINANCIAL ENDPOINTS =====

  /**
   * POST /projects/:projectId/financials - Create a financial transaction for the project
   */
  @Post(':projectId/financials')
  @UseGuards(AuthGuard('jwt-professional'))
  async createFinancialTransaction(
    @Param('projectId') projectId: string,
    @Body() body: {
      type: string;
      description: string;
      amount: string;
      status: string;
      requestedByRole: string;
      projectProfessionalId?: string;
    },
    @Request() req: any,
  ) {
    return this.projectsService.createFinancialTransaction(projectId, {
      type: body.type,
      description: body.description,
      amount: body.amount,
      status: body.status,
      requestedBy: req.user.id || req.user.sub,
      requestedByRole: body.requestedByRole,
      projectProfessionalId: body.projectProfessionalId,
    });
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
    @Body() body: { content: string; attachments?: any[] },
    @Request() req: any,
  ) {
    if (!body.content?.trim() && (!body.attachments || body.attachments.length === 0)) {
      throw new BadRequestException('Message must have content or attachments');
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
      body.content || '',
      body.attachments,
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

  // ============================================================================
  // NEXT STEP ENDPOINTS
  // ============================================================================

  /**
   * GET /projects/:projectId/next-steps
   * Get available next step actions for the requesting user
   */
  @Get(':projectId/next-steps')
  @UseGuards(CombinedAuthGuard)
  async getNextSteps(@Param('projectId') projectId: string, @Request() req: any) {
    try {
      const userId = req.user?.id || req.user?.sub;
      const isProfessional = req.user?.isProfessional;
      const role = req.user?.role === 'admin' ? 'ADMIN' : isProfessional ? 'PROFESSIONAL' : 'CLIENT';

      const nextSteps = await this.nextStepService.getNextSteps(projectId, userId, role);
      return nextSteps;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /projects/:projectId/next-steps/:actionKey
   * Record user action on a next step (complete, skip, defer)
   */
  @Post(':projectId/next-steps/:actionKey')
  @UseGuards(CombinedAuthGuard)
  async recordNextStepAction(
    @Param('projectId') projectId: string,
    @Param('actionKey') actionKey: string,
    @Body() body: { userAction: string; metadata?: any },
    @Request() req: any,
  ) {
    try {
      const userId = req.user?.id || req.user?.sub;
      const validActions = ['COMPLETED', 'SKIPPED', 'DEFERRED', 'ALTERNATIVE'];

      if (!validActions.includes(body.userAction)) {
        throw new BadRequestException('Invalid user action');
      }

      const action = await this.nextStepService.recordNextStepAction(
        projectId,
        userId,
        actionKey,
        body.userAction as any,
        body.metadata,
      );

      return { success: true, action };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * GET /projects/:projectId/next-steps/history
   * Get action history for a project
   */
  @Get(':projectId/next-steps/history')
  @UseGuards(CombinedAuthGuard)
  async getNextStepHistory(@Param('projectId') projectId: string, @Request() req: any) {
    try {
      const userId = req.user?.id || req.user?.sub;
      const history = await this.nextStepService.getUserActionHistory(projectId, userId);
      return { history };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // ============================================================================
  // PROJECT STAGE ENDPOINTS
  // ============================================================================

  /**
   * POST /projects/:projectId/stage/transition
   * Transition project to a new stage (admin or authorized user only)
   */
  @Post(':projectId/stage/transition')
  @UseGuards(AuthGuard('jwt'))
  async transitionStage(
    @Param('projectId') projectId: string,
    @Body() dto: TransitionProjectStageDto,
    @Request() req: any,
  ) {
    try {
      // Only allow admins or designated users
      if (req.user?.role !== 'admin') {
        throw new ForbiddenException('Only administrators can transition stages');
      }

      const result = await this.projectStageService.transitionStage(projectId, dto.newStage as any);
      return result;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * GET /projects/:projectId/stage/history
   * Get stage transition history
   */
  @Get(':projectId/stage/history')
  @UseGuards(CombinedAuthGuard)
  async getStageHistory(@Param('projectId') projectId: string) {
    try {
      const history = await this.projectStageService.getProjectStageHistory(projectId);
      return history;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * POST /projects/:projectId/pause
   * Pause a project
   */
  @Post(':projectId/pause')
  @UseGuards(CombinedAuthGuard)
  async pauseProject(
    @Param('projectId') projectId: string,
    @Body() dto: PauseProjectDto,
    @Request() req: any,
  ) {
    try {
      // Verify user is owner
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });

      if (project?.userId !== req.user?.id && req.user?.role !== 'admin') {
        throw new ForbiddenException('Only project owner or admin can pause');
      }

      const result = await this.projectStageService.pauseProject(projectId, dto.reason);
      return { success: true, result };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /projects/:projectId/resume
   * Resume a paused project
   */
  @Post(':projectId/resume')
  @UseGuards(CombinedAuthGuard)
  async resumeProject(
    @Param('projectId') projectId: string,
    @Body() dto: ResumeProjectDto,
    @Request() req: any,
  ) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true, currentStage: true },
      });

      if (project?.userId !== req.user?.id && req.user?.role !== 'admin') {
        throw new ForbiddenException('Only project owner or admin can resume');
      }

      const result = await this.projectStageService.resumeProject(projectId, dto.resumeToStage as any);
      return { success: true, result };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /projects/:projectId/dispute
   * Flag a project as disputed
   */
  @Post(':projectId/dispute')
  @UseGuards(CombinedAuthGuard)
  async disputeProject(
    @Param('projectId') projectId: string,
    @Body() dto: DisputeProjectDto,
  ) {
    try {
      const result = await this.projectStageService.disputeProject(projectId, dto.reason);
      return { success: true, result };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // ============================================================================
  // ADMIN ACTION ENDPOINTS
  // ============================================================================

  /**
   * GET /admin/actions
   * Get pending admin actions (admin only)
   */
  @Get('admin/actions')
  @UseGuards(AuthGuard('jwt'))
  async getAdminActions(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assignedToMe') assignedToMe?: string,
  ) {
    try {
      if (req.user?.role !== 'admin') {
        throw new ForbiddenException('Only admins can view admin actions');
      }

      const assignedTo = assignedToMe === 'true' ? req.user?.id : undefined;
      const actions = await this.adminActionService.getPendingActions(status, priority, assignedTo);

      return { actions, count: actions.length };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * GET /projects/:projectId/admin-actions
   * Get all admin actions for a specific project
   */
  @Get(':projectId/admin-actions')
  @UseGuards(AuthGuard('jwt'))
  async getProjectAdminActions(@Param('projectId') projectId: string, @Request() req: any) {
    try {
      if (req.user?.role !== 'admin') {
        throw new ForbiddenException('Only admins can view admin actions');
      }

      const actions = await this.adminActionService.getProjectAdminActions(projectId);
      return { actions };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * PATCH /admin/actions/:actionId/assign
   * Assign admin action to user
   */
  @Patch('admin/actions/:actionId/assign')
  @UseGuards(AuthGuard('jwt'))
  async assignAdminAction(
    @Param('actionId') actionId: string,
    @Body() dto: AssignAdminActionDto,
    @Request() req: any,
  ) {
    try {
      if (req.user?.role !== 'admin') {
        throw new ForbiddenException('Only admins can assign actions');
      }

      const action = await this.adminActionService.assignAction(actionId, dto.adminUserId);
      return { success: true, action };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * PATCH /admin/actions/:actionId/complete
   * Complete/resolve an admin action
   */
  @Patch('admin/actions/:actionId/complete')
  @UseGuards(AuthGuard('jwt'))
  async completeAdminAction(
    @Param('actionId') actionId: string,
    @Body() dto: CompleteAdminActionDto,
    @Request() req: any,
  ) {
    try {
      if (req.user?.role !== 'admin') {
        throw new ForbiddenException('Only admins can complete actions');
      }

      const action = await this.adminActionService.completeAction(
        actionId,
        req.user?.id,
        dto,
      );
      return { success: true, action };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * GET /admin/stats
   * Get admin action statistics
   */
  @Get('admin/stats')
  @UseGuards(AuthGuard('jwt'))
  async getAdminStats(@Request() req: any) {
    try {
      if (req.user?.role !== 'admin') {
        throw new ForbiddenException('Only admins can view admin stats');
      }

      const stats = await this.adminActionService.getAdminStats();
      return stats;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * GET /projects/:id/contract
   * Get contract for a project (generates if not exists)
   */
  @Get(':id/contract')
  @UseGuards(CombinedAuthGuard)
  async getContract(@Param('id') projectId: string, @Request() req: any) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const contract = await this.contractService.getContract(projectId, userId);
      return contract;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /projects/:id/contract/sign
   * Sign the contract as client or professional
   */
  @Post(':id/contract/sign')
  @UseGuards(CombinedAuthGuard)
  async signContract(@Param('id') projectId: string, @Request() req: any) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.contractService.signContract(projectId, userId);
      return result;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
