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
    const count = await (this.prisma as any).message.count({
      where: {
        senderType: 'professional',
        readByClientAt: null,
        projectProfessional: {
          OR: [{ project: { userId } }, { project: { clientId: userId } }],
        },
      },
    });
    return { unreadCount: count };
  }
}