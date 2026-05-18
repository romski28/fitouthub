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
import { UpdatesService } from '../updates/updates.service';
import { EmailService } from '../email/email.service';
import { Decimal } from '@prisma/client/runtime/library';
import { ProjectStage } from '@prisma/client';
import { getQuoteBreakdownDisplayLines, getStoredQuoteBreakdownClientItems } from '../projects/quote-breakdown';

@Controller('client')
export class ClientController {
  constructor(
    private prisma: PrismaService,
    private updatesService: UpdatesService,
    private emailService: EmailService,
  ) {}

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
    return this.updatesService.markMessageGroupAsRead(userId, 'client', {
      chatType: 'project-professional',
      threadId: projectProfessionalId,
    });
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

      // Structured event card for the winning professional
      const winnerAmount = pp.quoteAmount
        ? `HK$${Number(pp.quoteAmount).toLocaleString()}`
        : null;
      const quoteAcceptedPayload = {
        type: 'quote-accepted',
        icon: '🏆',
        title: 'Quote Awarded',
        fields: [
          { label: 'Project', value: pp.project.projectName },
          ...(winnerAmount ? [{ label: 'Amount', value: winnerAmount }] : []),
          ...getStoredQuoteBreakdownClientItems((pp as any).quoteBreakdown).map((item) => ({
            label: item.label,
            value: `HK$${item.amount.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
          })),
        ],
      };
      await tx.message.create({
        data: {
          projectProfessionalId,
          senderType: 'client',
          senderClientId: userId,
          content: `[[event]]\n${JSON.stringify(quoteAcceptedPayload)}`,
        },
      });

      for (const losingAssignment of otherAssignments) {
        const hadQuoted = Boolean(losingAssignment.quotedAt || losingAssignment.quoteAmount);
        const notSelectedPayload = {
          type: 'quote-not-selected',
          icon: '📋',
          title: hadQuoted ? 'Quote Not Selected' : 'Bidding Concluded',
          summary: hadQuoted
            ? `Thank you for your quote on "${pp.project.projectName}". Another professional was selected this time. We appreciate your time and hope to work with you in the future.`
            : `Bidding has now concluded for "${pp.project.projectName}". Thank you for your interest. We look forward to working with you in the future.`,
          fields: [{ label: 'Project', value: pp.project.projectName }],
        };
        await tx.message.create({
          data: {
            projectProfessionalId: losingAssignment.id,
            senderType: 'client',
            senderClientId: userId,
            content: `[[event]]\n${JSON.stringify(notSelectedPayload)}`,
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

    // Email fallbacks (best-effort, after transaction commits)
    const winnerName = pp.professional?.fullName || pp.professional?.businessName || 'Professional';
    try {
      await this.emailService.sendWinnerNotification({
        to: pp.professional.email,
        professionalName: winnerName,
        projectName: pp.project.projectName,
        quoteAmount: pp.quoteAmount?.toString() || '0',
        quoteBreakdownLines: getQuoteBreakdownDisplayLines((pp as any).quoteBreakdown),
        nextStepsMessage:
          'The client will be in contact soon to discuss next steps. Please sign the project contract, available in your project panel, to move forward.',
      });
    } catch (err) {
      console.warn('[ClientController.acceptQuote] Winner email failed:', (err as Error)?.message);
    }

    // Loser emails — otherAssignments captured inside tx but we need a fresh read since tx is done
    const losingPPs = await (this.prisma as any).projectProfessional.findMany({
      where: {
        projectId: pp.projectId,
        id: { not: projectProfessionalId },
        status: 'declined',
      },
      include: { professional: true },
    });
    for (const losingPP of losingPPs) {
      const hadQuoted = Boolean(losingPP.quotedAt || losingPP.quoteAmount);
      try {
        await this.emailService.sendLoserNotification({
          to: losingPP.professional.email,
          professionalName: losingPP.professional?.fullName || losingPP.professional?.businessName || 'Professional',
          projectName: pp.project.projectName,
          thankYouMessage: hadQuoted
            ? 'Thank you for your time and effort on this project. We hope to work with you on future opportunities.'
            : 'Bidding has now concluded for this project. Thank you for your interest, and we look forward to working with you in the future.',
        });
      } catch (err) {
        console.warn('[ClientController.acceptQuote] Loser email failed:', losingPP.professional?.email, (err as Error)?.message);
      }
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
