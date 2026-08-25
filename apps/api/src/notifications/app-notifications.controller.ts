import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CombinedAuthGuard } from '../chat/auth-combined.guard';

/**
 * In-app notification feed for professionals (bell + badge).
 * Lives in NotificationModule which already provides PrismaService + CombinedAuthGuard.
 */
@Controller('professional/notifications')
export class AppNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  private resolveProfessionalId(req: any): string {
    const professionalId = req.user?.isProfessional ? req.user?.id : null;
    if (!professionalId) {
      throw new ForbiddenException('Professional authentication required');
    }
    return professionalId;
  }

  @Get()
  @UseGuards(CombinedAuthGuard)
  async list(@Request() req: any) {
    const professionalId = this.resolveProfessionalId(req);
    const notifications = await this.prisma.appNotification.findMany({
      where: { professionalId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = await this.prisma.appNotification.count({
      where: { professionalId, readAt: null },
    });
    return { notifications, unreadCount };
  }

  @Post('read-all')
  @UseGuards(CombinedAuthGuard)
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Request() req: any) {
    const professionalId = this.resolveProfessionalId(req);
    await this.prisma.appNotification.updateMany({
      where: { professionalId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  @Post(':id/read')
  @UseGuards(CombinedAuthGuard)
  @HttpCode(HttpStatus.OK)
  async markRead(@Param('id') id: string, @Request() req: any) {
    const professionalId = this.resolveProfessionalId(req);
    await this.prisma.appNotification.updateMany({
      where: { id, professionalId },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
