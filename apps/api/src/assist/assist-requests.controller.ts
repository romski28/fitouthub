import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AssistRequestsService } from './assist-requests.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

@Controller('assist-requests')
export class AssistRequestsController {
  constructor(private service: AssistRequestsService) {}

  @Post()
  async create(
    @Body()
    body: {
      projectId: string;
      notes?: string;
      userId?: string;
      professionalId?: string;
      raisedBy?: 'client' | 'professional' | 'foh';
      category?: 'payment' | 'delay' | 'quality' | 'safety' | 'dispute' | 'general';
      clientName?: string;
      projectName?: string;
      contactMethod?: 'chat' | 'call' | 'whatsapp';
      requestedCallAt?: string;
      requestedCallTimezone?: string;
      bookingChannel?: 'app' | 'ai_guest_quick' | 'ai_logged_in' | 'manual_admin';
      leadLifecycleAtBooking?: 'active' | 'prospective' | 'suspended' | 'blocked';
      consultationDurationMin?: number;
      contactEmailSnapshot?: string;
      contactMobileSnapshot?: string;
    },
  ) {
    try {
      return await this.service.createRequest({
        projectId: body.projectId,
        userId: body.userId,
        professionalId: body.professionalId,
        raisedBy: body.raisedBy,
        category: body.category,
        notes: body.notes,
        clientName: body.clientName,
        projectName: body.projectName,
        contactMethod: body.contactMethod,
        requestedCallAt: body.requestedCallAt,
        requestedCallTimezone: body.requestedCallTimezone,
        bookingChannel: body.bookingChannel,
        leadLifecycleAtBooking: body.leadLifecycleAtBooking,
        consultationDurationMin: body.consultationDurationMin,
        contactEmailSnapshot: body.contactEmailSnapshot,
        contactMobileSnapshot: body.contactMobileSnapshot,
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create assist request',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('ai-consultation')
  async createAiConsultation(
    @Body()
    body: {
      lead: { name: string; email?: string; mobile?: string };
      project: {
        projectName?: string;
        region?: string;
        notes?: string;
        tradesRequired?: string[];
        userPrompt?: string;
        aiIntakeId?: string;
        projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
        isEmergency?: boolean;
      };
      assist: {
        notes?: string;
        contactMethod?: 'chat' | 'call' | 'whatsapp';
        requestedCallAt?: string;
        requestedCallTimezone?: string;
      };
    },
    @Request() req: any,
  ) {
    try {
      const forwardedFor = req?.headers?.['x-forwarded-for'];
      const ip = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : typeof forwardedFor === 'string'
          ? forwardedFor.split(',')[0]?.trim()
          : req?.ip;
      const userAgent = req?.headers?.['user-agent'];

      return await this.service.createAiConsultationBooking({
        ...body,
        context: {
          source: 'ai_guest_quick',
          ip,
          userAgent: typeof userAgent === 'string' ? userAgent : undefined,
        },
      } as any);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create AI consultation booking',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('ai-consultation/precheck')
  async precheckAiConsultationGuestLead(
    @Body()
    body: {
      email?: string;
      mobile?: string;
    },
  ) {
    try {
      return await this.service.precheckAiConsultationGuestLead({
        email: body?.email,
        mobile: body?.mobile,
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to validate guest contact details',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('ai-consultation/report')
  @UseGuards(CombinedAuthGuard)
  async getAiConsultationReport(
    @Query('days') days?: string,
    @Request() req?: any,
  ) {
    if (req?.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    const parsedDays = days ? parseInt(days, 10) : 30;
    return this.service.getAiConsultationReport(parsedDays);
  }

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.list({
      status: status as any,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id/messages')
  async getMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('fromLatest') fromLatest?: string,
  ) {
    return this.service.getMessages(
      id,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
      fromLatest === '1',
    );
  }

  @Post(':id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body()
    body: { sender?: 'client' | 'foh'; content: string; senderUserId?: string },
  ) {
    try {
      const sender = body.sender ?? 'client';
      if (sender !== 'client' && sender !== 'foh') {
        throw new Error('Invalid sender');
      }

      return await this.service.addMessage(
        id,
        sender,
        body.content,
        body.senderUserId,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to add message',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: 'open' | 'in_progress' | 'closed' | 'closure_pending';
      actorId?: string;
      resolutionReason?: string;
      resolutionMode?: 'user_confirmed' | 'sla_timeout';
    },
  ) {
    try {
      return await this.service.updateStatus(id, body.status, {
        actorId: body.actorId,
        resolutionReason: body.resolutionReason,
        resolutionMode: body.resolutionMode,
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update status',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('by-project/:projectId')
  async getByProject(@Param('projectId') projectId: string) {
    try {
      const assist = await this.service.getLatestByProject(projectId);
      return { assist };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch assist request',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('by-project/:projectId/all')
  async listByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const assists = await this.service.listByProject(
        projectId,
        limit ? parseInt(limit, 10) : undefined,
      );
      return { assists };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch project assistance threads',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
