import {
  Controller,
  Get,
  Post,
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
import { Decimal } from '@prisma/client/runtime/library';

@Controller('client')
export class ClientController {
  constructor(private prisma: PrismaService) {}

  @Get('projects/:projectProfessionalId/messages')
  @UseGuards(AuthGuard('jwt'))
  async getMessages(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const userId = req.user.id || req.user.sub;
    const pp = await (this.prisma as any).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        OR: [{ project: { userId } }, { project: { clientId: userId } }],
      },
    });
    if (!pp) throw new BadRequestException('Project not found');
    const messages = await (this.prisma as any).message.findMany({
      where: { projectProfessionalId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return { messages };
  }

  @Post('projects/:projectProfessionalId/messages')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: { content: string },
  ) {
    const userId = req.user.id || req.user.sub;
    if (!body?.content || body.content.trim().length === 0) {
      throw new BadRequestException('Message content is required');
    }
    const pp = await (this.prisma as any).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        OR: [{ project: { userId } }, { project: { clientId: userId } }],
      },
    });
    if (!pp) throw new BadRequestException('Project not found');
    const message = await (this.prisma as any).message.create({
      data: {
        projectProfessionalId,
        senderType: 'client',
        senderClientId: userId,
        content: body.content.trim(),
      },
    });
    return { success: true, message };
  }

  @Post('projects/:projectProfessionalId/messages/mark-read')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async markMessagesRead(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const userId = req.user.id || req.user.sub;
    const pp = await (this.prisma as any).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        OR: [{ project: { userId } }, { project: { clientId: userId } }],
      },
    });
    if (!pp) throw new BadRequestException('Project not found');
    await (this.prisma as any).message.updateMany({
      where: {
        projectProfessionalId,
        senderType: 'professional',
        readByClientAt: null,
      },
      data: { readByClientAt: new Date() },
    });
    return { success: true };
  }

  @Get('messages/unread-count')
  @UseGuards(AuthGuard('jwt'))
  async getUnreadCount(@Request() req: any) {
    const userId = req.user.id || req.user.sub;

    // Get all project professionals for user's projects
    const projectProfessionals = await (
      this.prisma as any
    ).projectProfessional.findMany({
      where: {
        project: {
          OR: [{ userId }, { clientId: userId }],
        },
      },
      select: { id: true },
    });

    const projectProfessionalIds = projectProfessionals.map((pp: any) => pp.id);

    if (projectProfessionalIds.length === 0) {
      return { unreadCount: 0 };
    }

    // Count unread messages from professionals
    const count = await (this.prisma as any).message.count({
      where: {
        projectProfessionalId: { in: projectProfessionalIds },
        senderType: 'professional',
        readByClientAt: null,
      },
    });

    return { unreadCount: count };
  }

  // Per-project unread counts for authenticated client
  @Get('projects/unread-counts')
  @UseGuards(AuthGuard('jwt'))
  async getUnreadCountsByProject(@Request() req: any) {
    const userId = req.user.id || req.user.sub;

    // Fetch unread messages from professionals across user's projects
    const unreadMessages = await (this.prisma as any).message.findMany({
      where: {
        senderType: 'professional',
        readByClientAt: null,
        projectProfessional: {
          project: {
            OR: [{ userId }, { clientId: userId }],
          },
        },
      },
      select: {
        projectProfessional: { select: { projectId: true } },
      },
    });

    const counts: Record<string, number> = {};
    for (const m of unreadMessages) {
      const pid = m.projectProfessional.projectId as string;
      counts[pid] = (counts[pid] || 0) + 1;
    }

    return { counts };
  }

  // Client decides on a submitted quotation: accept
  @Post('projects/:projectProfessionalId/quote/accept')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async acceptQuote(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const userId = req.user.id || req.user.sub;
    const pp = await (this.prisma as any).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        project: { OR: [{ userId }, { clientId: userId }] },
      },
      include: { professional: true, project: true },
    });
    if (!pp) throw new BadRequestException('Project not found');
    const updated = await (this.prisma as any).projectProfessional.update({
      where: { id: projectProfessionalId },
      data: { status: 'awarded' },
    });
    await (this.prisma as any).message.create({
      data: {
        projectProfessionalId,
        senderType: 'client',
        senderClientId: userId,
        content: 'We have accepted your quotation.',
      },
    });

    // Create financial transactions for accepted quotation
    const quoteAmount = pp.quoteAmount ? new Decimal(pp.quoteAmount.toString()) : new Decimal(0);
    if (quoteAmount.greaterThan(0)) {
      // 1) Informational line: quotation accepted
      await (this.prisma as any).financialTransaction.create({
        data: {
          projectId: pp.projectId,
          projectProfessionalId,
          type: 'quotation_accepted',
          description: `Quotation accepted from ${pp.professional?.businessName || pp.professional?.fullName || 'Professional'}`,
          amount: quoteAmount,
          status: 'info',
          requestedBy: userId,
          requestedByRole: 'client',
        },
      });

      // 2) Action line: request client deposit into escrow (from FOH/platform)
      await (this.prisma as any).financialTransaction.create({
        data: {
          projectId: pp.projectId,
          projectProfessionalId,
          type: 'escrow_deposit_request',
          description: 'Request to deposit project fees to escrow',
          amount: quoteAmount,
          status: 'pending',
          requestedBy: 'foh',
          requestedByRole: 'platform',
          notes: `Quote amount for project ${pp.project?.projectName || 'Project'}`,
        },
      });
    }

    return { success: true, projectProfessional: updated };
  }

  // Client decides on a submitted quotation: reject
  @Post('projects/:projectProfessionalId/quote/reject')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async rejectQuote(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const userId = req.user.id || req.user.sub;
    const pp = await (this.prisma as any).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        project: { OR: [{ userId }, { clientId: userId }] },
      },
    });
    if (!pp) throw new BadRequestException('Project not found');
    const updated = await (this.prisma as any).projectProfessional.update({
      where: { id: projectProfessionalId },
      data: { status: 'declined' },
    });
    await (this.prisma as any).message.create({
      data: {
        projectProfessionalId,
        senderType: 'client',
        senderClientId: userId,
        content: 'We have declined your quotation.',
      },
    });
    return { success: true, projectProfessional: updated };
  }

  // Client requests a better offer
  @Post('projects/:projectProfessionalId/quote/request-better')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async requestBetterOffer(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const userId = req.user.id || req.user.sub;
    const pp = await (this.prisma as any).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        project: { OR: [{ userId }, { clientId: userId }] },
      },
    });
    if (!pp) throw new BadRequestException('Project not found');
    const updated = await (this.prisma as any).projectProfessional.update({
      where: { id: projectProfessionalId },
      data: { status: 'counter_requested' },
    });
    await (this.prisma as any).message.create({
      data: {
        projectProfessionalId,
        senderType: 'client',
        senderClientId: userId,
        content: 'We would appreciate a better offer if possible.',
      },
    });
    return { success: true, projectProfessional: updated };
  }
}
