import {
  Controller,
  Get,
  Post,
  Put,
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

@Controller('professional')
export class ProfessionalController {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProfile(@Request() req: any) {
    const professionalId = req.user.id || req.user.sub;
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id: professionalId },
      include: { referenceProjects: { orderBy: { createdAt: 'desc' } } },
    });
    if (!professional) throw new BadRequestException('Professional not found');
    return professional;
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
    },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const data: any = {
      fullName: body.fullName,
      businessName: body.businessName,
      phone: body.phone,
      professionType: body.professionType,
      serviceArea: body.serviceArea,
      locationPrimary: body.locationPrimary,
      locationSecondary: body.locationSecondary,
      locationTertiary: body.locationTertiary,
      suppliesOffered: body.suppliesOffered,
      tradesOffered: body.tradesOffered,
      primaryTrade: body.primaryTrade,
      profileImages: body.profileImages,
    };
    // Remove undefined to avoid overwriting
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    const updated = await (this.prisma as any).professional.update({
      where: { id: professionalId },
      data,
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
        where: { professionalId },
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
          const unreadCount = await (this.prisma as any).message.count({
            where: {
              projectProfessionalId: pp.id,
              senderType: 'client',
              readByProfessionalAt: null,
            },
          });
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
    return (this.prisma as any).professionalReferenceProject.findMany({
      where: { professionalId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('reference-projects')
  @UseGuards(AuthGuard('jwt-professional'))
  async createReferenceProject(
    @Request() req: any,
    @Body() body: { title: string; description?: string; imageUrls?: string[] },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;
      console.log('[createReferenceProject] req.user:', req.user);
      console.log('[createReferenceProject] professionalId:', professionalId);
      if (!professionalId) {
        throw new BadRequestException('Professional ID not found in auth token');
      }
      if (!body.title || !body.title.trim()) {
        throw new BadRequestException('Title is required');
      }
      return (this.prisma as any).professionalReferenceProject.create({
        data: {
          professionalId,
          title: body.title.trim(),
          description: body.description?.trim() || null,
          imageUrls: body.imageUrls?.length ? body.imageUrls : [],
        },
      });
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
      if (!professionalId) {
        throw new BadRequestException('Professional ID not found in auth token');
      }
      const existing = await (this.prisma as any).professionalReferenceProject.findFirst({
        where: { id, professionalId },
      });
      if (!existing) throw new BadRequestException('Reference project not found');
      return (this.prisma as any).professionalReferenceProject.update({
        where: { id },
        data: {
          title: body.title?.trim() || existing.title,
          description:
            body.description === undefined
              ? existing.description
              : body.description?.trim() || null,
          imageUrls: body.imageUrls ?? existing.imageUrls,
        },
      });
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
        projectProfessional: { professionalId },
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
        },
        include: {
          project: true,
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
    @Body() body: { quoteAmount: number | string; quoteNotes?: string },
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

      const quoteAmount = parseFloat(String(body.quoteAmount));
      if (isNaN(quoteAmount) || quoteAmount < 0) {
        throw new BadRequestException('Invalid quote amount');
      }

      const updated = await (this.prisma as any).projectProfessional.update({
        where: { id: projectProfessionalId },
        data: {
          quoteAmount: quoteAmount,
          quoteNotes: body.quoteNotes || '',
          quotedAt: new Date(),
          status: 'quoted',
        },
        include: {
          project: { include: { user: true, client: true } },
          professional: true,
        },
      });

      // Create a message to notify the client in-app
      await (this.prisma as any).message.create({
        data: {
          projectProfessionalId,
          senderType: 'professional',
          senderProfessionalId: professionalId,
          content: `We have submitted a quotation${isNaN(quoteAmount) ? '' : ` for HK$${quoteAmount.toLocaleString?.() ?? quoteAmount}`}.`,
        },
      });

      // Send email notification to client (best-effort; ignore if email not configured)
      try {
        const baseUrl =
          process.env.WEB_BASE_URL ||
          process.env.FRONTEND_BASE_URL ||
          process.env.APP_WEB_URL ||
          'https://fitouthub-web.vercel.app';

        const clientEmail =
          updated.project?.user?.email || updated.project?.client?.email;
        if (clientEmail) {
          await this.email.sendQuoteSubmitted({
            to: clientEmail,
            clientName:
              updated.project?.user?.firstName ||
              updated.project?.client?.name ||
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
      requestType: 'fixed' | 'percentage'; 
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
              client: true,
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

      // Allow multiple payment requests; no invoice dependency

      // Validate request
      if (body.requestType === 'fixed') {
        if (!body.amount || body.amount <= 0) {
          throw new BadRequestException('Invalid amount');
        }
        if (body.amount > Number(projectProfessional.invoice.amount)) {
          throw new BadRequestException(
            'Amount cannot exceed invoice total',
          );
        }
      } else if (body.requestType === 'percentage') {
        if (!body.percentage || body.percentage <= 0 || body.percentage > 100) {
          throw new BadRequestException('Percentage must be between 1 and 100');
        }
      } else {
        throw new BadRequestException('Invalid request type');
      }

      // Calculate request amount
      const quoteAmount = Number(projectProfessional.quoteAmount || 0);
      const requestAmount = body.requestType === 'fixed'
        ? body.amount!
        : (quoteAmount * body.percentage!) / 100;

      // Create payment request in PaymentRequest table
      const paymentRequest = await (
        this.prisma as any
      ).paymentRequest.create({
        data: {
          projectProfessionalId,
          requestType: body.requestType,
          requestAmount,
          requestPercentage: body.requestType === 'percentage' ? body.percentage : null,
          status: 'pending',
          notes: body.notes || null,
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
          description: `Payment request${body.requestType === 'percentage' ? ` (${body.percentage}%)` : ''}`,
          amount: decimalAmount,
          status: 'pending',
          requestedBy: professionalId,
          requestedByRole: 'professional',
          actionBy: clientId,
          actionByRole: 'client',
          actionComplete: false,  // Pending client approval
          notes: body.notes || `Payment request for upfront costs`,
        },
      });

      // Send notification to client
      const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';
      const professionalName = projectProfessional.professional.fullName ||
        projectProfessional.professional.businessName ||
        'Professional';
      const clientEmail = projectProfessional.project.client?.email;

      if (clientEmail) {
        await this.email.sendAdvancePaymentRequestNotification({
          to: clientEmail,
          clientName: projectProfessional.project.clientName,
          professionalName,
          projectName: projectProfessional.project.projectName,
          requestType: body.requestType,
          requestAmount: `$${requestAmount.toFixed(2)}`,
          requestPercentage: body.percentage,
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
          content: `💰 Payment requested: ${body.requestType === 'percentage' ? `${body.percentage}% (` : ''}$${requestAmount.toFixed(2)}${body.requestType === 'percentage' ? ')' : ''} for upfront costs. Fitout Hub will review and contact the client.`,
        },
      });

      return { success: true, paymentRequest };
    } catch (err) {
      console.error('[ProfessionalController.requestAdvancePayment] Error:', err);
      throw err;
    }
  }
}
