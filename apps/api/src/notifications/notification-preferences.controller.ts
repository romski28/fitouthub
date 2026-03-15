import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';

interface UpdatePreferencesDto {
  primaryChannel?: 'WHATSAPP' | 'SMS' | 'WECHAT' | 'EMAIL';
  fallbackChannel?: 'WHATSAPP' | 'SMS' | 'WECHAT' | 'EMAIL';
  preferredLanguage?: string;
  enableSMS?: boolean;
  enableWhatsApp?: boolean;
  enableWeChat?: boolean;
  enableEmail?: boolean;
  weChatOpenId?: string;
}

interface NotificationPreferenceDto {
  id: string;
  primaryChannel: string;
  fallbackChannel: string;
  preferredLanguage: string;
  enableSMS: boolean;
  enableWhatsApp: boolean;
  enableWeChat: boolean;
  enableEmail: boolean;
  weChatOpenId: string | null;
}

@Controller('notifications/preferences')
@UseGuards(AuthGuard('jwt'))
export class NotificationPreferencesController {
  private readonly logger = new Logger(NotificationPreferencesController.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get notification preferences for the authenticated professional
   */
  @Get('me')
  async getMyPreferences(
    @Request() req: any,
  ): Promise<NotificationPreferenceDto> {
    const userId = req.user.id || req.user.sub;
    
    // User must have an associated Professional record
    const professional = await this.prisma.professional.findFirst({
      where: { userId},
      include: { notificationPreferences: true },
    });

    if (!professional) {
      throw new ForbiddenException('User is not associated with a professional account');
    }

    if (!professional.notificationPreferences) {
      // Create default preferences
      const preferences = await this.prisma.notificationPreference.create({
        data: {
          professionalId: professional.id,
          primaryChannel: 'WHATSAPP',
          fallbackChannel: 'SMS',
          preferredLanguage: 'en',
          enableSMS: true,
          enableWhatsApp: true,
          enableWeChat: false,
          enableEmail: true,
        } as any,
      });
      return this.mapToDto(preferences);
    }

    return this.mapToDto(professional.notificationPreferences);
  }

  /**
   * Update notification preferences for the authenticated professional
   */
  @Put('me')
  @HttpCode(HttpStatus.OK)
  async updateMyPreferences(
    @Request() req: any,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<NotificationPreferenceDto> {
    const userId = req.user.id || req.user.sub;
    
    // Get the professional
    const professional = await this.prisma.professional.findFirst({
      where: { userId },
    });

    if (!professional) {
      throw new ForbiddenException('User is not associated with a professional account');
    }

    // Get or create preferences
    let preferences = await this.prisma.notificationPreference.findUnique({
      where: { professionalId: professional.id },
    });

    if (!preferences) {
      preferences = await this.prisma.notificationPreference.create({
        data: {
          professionalId: professional.id,
          ...dto,
        },
      });
    } else {
      preferences = await this.prisma.notificationPreference.update({
        where: { id: preferences.id },
        data: dto,
      });
    }

    this.logger.log(
      `Updated notification preferences for professional ${professional.id}`,
    );

    return this.mapToDto(preferences);
  }

  /**
   * Get notification preferences for a specific professional (admin only)
   */
  @Get(':professionalId')
  async getPreferences(
    @Param('professionalId') professionalId: string,
    @Request() req: any,
  ): Promise<NotificationPreferenceDto> {
    const userId = req.user.id || req.user.sub;
    const userRole = req.user.role || 'user';
    
    // Check if user is admin or owns this professional account
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      include: { notificationPreferences: true },
    });

    if (!professional) {
      throw new ForbiddenException('Professional not found');
    }

    // Only allow if user is the owner or is admin
    if (professional.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Not authorized to view these preferences');
    }

    if (!professional.notificationPreferences) {
      // Create default preferences
      const preferences = await this.prisma.notificationPreference.create({
        data: {
          professionalId: professional.id,
          primaryChannel: 'WHATSAPP',
          fallbackChannel: 'SMS',
          preferredLanguage: 'en',
          enableSMS: true,
          enableWhatsApp: true,
          enableWeChat: false,
          enableEmail: true,
        } as any,
      });
      return this.mapToDto(preferences);
    }

    return this.mapToDto(professional.notificationPreferences);
  }

  /**
   * Update notification preferences for a specific professional
   */
  @Put(':professionalId')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @Param('professionalId') professionalId: string,
    @Request() req: any,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<NotificationPreferenceDto> {
    const userId = req.user.id || req.user.sub;
    const userRole = req.user.role || 'user';
    
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
    });

    if (!professional) {
      throw new ForbiddenException('Professional not found');
    }

    // Only allow if user is the owner or is admin
    if (professional.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Not authorized to update these preferences');
    }

    let preferences = await this.prisma.notificationPreference.findUnique({
      where: { professionalId: professional.id },
    });

    if (!preferences) {
      preferences = await this.prisma.notificationPreference.create({
        data: {
          professionalId: professional.id,
          ...dto,
        },
      });
    } else {
      preferences = await this.prisma.notificationPreference.update({
        where: { id: preferences.id },
        data: dto,
      });
    }

    this.logger.log(
      `Updated notification preferences for professional ${professionalId}`,
    );

    return this.mapToDto(preferences);
  }

  private mapToDto(preferences: any): NotificationPreferenceDto {
    return {
      id: preferences.id,
      primaryChannel: preferences.primaryChannel,
      fallbackChannel: preferences.fallbackChannel,
      preferredLanguage: preferences.preferredLanguage || 'en',
      enableSMS: preferences.enableSMS,
      enableWhatsApp: preferences.enableWhatsApp,
      enableWeChat: preferences.enableWeChat,
      enableEmail: preferences.enableEmail,
      weChatOpenId: preferences.weChatOpenId,
    };
  }
}
