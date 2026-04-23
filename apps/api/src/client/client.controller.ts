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
import { ProjectStage } from '@prisma/client';

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
    const updated = await (this.prisma as any).$transaction(async (tx: any) => {
      const updatedPP = await tx.projectProfessional.update({
        where: { id: projectProfessionalId },
        data: { status: 'awarded' },
      });

      const otherAssignments = await tx.projectProfessional.findMany({
        where: {
          projectId: pp.projectId,
          id: { not: projectProfessionalId },
          status: { notIn: ['declined', 'rejected'] },
        },
        include: {
          professional: true,
        },
      });

      await tx.projectProfessional.updateMany({
        where: {
          projectId: pp.projectId,
          id: { not: projectProfessionalId },
          status: { notIn: ['declined', 'rejected'] },
        },
        data: { status: 'declined' },
      });

      await tx.siteAccessRequest.updateMany({
        where: {
          projectProfessionalId: { in: otherAssignments.map((assignment: any) => assignment.id) },
          status: 'pending',
        },
        data: {
          status: 'cancelled',
          respondedAt: new Date(),
        },
      });

      await tx.project.update({
        where: { id: pp.projectId },
        data: {
          status: 'awarded',
          currentStage: ProjectStage.CONTRACT_PHASE,
          awardedProjectProfessionalId: projectProfessionalId,
        },
      });

      await tx.message.create({
        data: {
          projectProfessionalId,
          senderType: 'client',
          senderClientId: userId,
          content: 'We have accepted your quotation.',
        },
      });

      for (const losingAssignment of otherAssignments) {
        const hadQuoted = Boolean(losingAssignment.quotedAt || losingAssignment.quoteAmount);
        await tx.message.create({
          data: {
            projectProfessionalId: losingAssignment.id,
            senderType: 'client',
            senderClientId: userId,
            content: hadQuoted
              ? `Thank you for your quote on "${pp.project.projectName}". Another professional was selected for this project. We appreciate your time and hope to work with you in the future.`
              : `Bidding has concluded for "${pp.project.projectName}". Thank you for your interest in this opportunity. We look forward to working with you in the future.`,
          },
        });
      }

      // Create financial transactions for accepted quotation
      const quoteAmount = pp.quoteAmount
        ? new Decimal(pp.quoteAmount.toString())
        : new Decimal(0);
      if (quoteAmount.greaterThan(0)) {
        // 1) Informational line: quotation accepted (mark complete)
        const quoteTx = await tx.financialTransaction.create({
          data: {
            projectId: pp.projectId,
            projectProfessionalId,
            type: 'quotation_accepted',
            description: `Quotation accepted from ${pp.professional?.businessName || pp.professional?.fullName || 'Professional'}`,
            amount: quoteAmount,
            status: 'info',
            requestedBy: userId,
            requestedByRole: 'client',
            actionBy: userId,
            actionByRole: 'client',
            actionComplete: true,
          },
        });

        // Persist approved budget + award pointers on project
        await tx.project.update({
          where: { id: pp.projectId },
          data: {
            approvedBudget: quoteAmount,
            approvedBudgetTxId: quoteTx.id,
            awardedProjectProfessionalId: projectProfessionalId,
            escrowRequired: quoteAmount,
          },
        });

        // Escrow deposit request is intentionally created later,
        // after both parties have signed the standard contract.
      }

      return updatedPP;
    });

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
