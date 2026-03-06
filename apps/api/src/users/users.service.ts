import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    try {
      return await this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          surname: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          // Exclude password
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (error) {
      console.error('[UsersService.findAll] Database error:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
      });
      return [];
    }
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        notificationPreference: {
          select: {
            id: true,
            allowPartnerOffers: true,
            allowPlatformUpdates: true,
          },
        },
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Filter out undefined values to prevent Prisma errors
    const data = Object.fromEntries(
      Object.entries(updateUserDto).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(data).length === 0) {
      throw new Error('No fields to update');
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async updatePassword(id: string, password: string) {
    // MVP stores plaintext in passwordHash; replace with bcrypt in production
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash: password },
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        role: true,
        updatedAt: true,
      },
    });
  }

  async updateNotificationPreferences(
    id: string,
    preferences: { allowPartnerOffers?: boolean; allowPlatformUpdates?: boolean },
  ) {
    // First, ensure the notification preference record exists
    let notificationPreference = await this.prisma.notificationPreference.findUnique({
      where: { userId: id },
    });

    if (!notificationPreference) {
      notificationPreference = await this.prisma.notificationPreference.create({
        data: {
          userId: id,
          allowPartnerOffers: preferences.allowPartnerOffers ?? false,
          allowPlatformUpdates: preferences.allowPlatformUpdates ?? true,
        },
      });
    } else {
      notificationPreference = await this.prisma.notificationPreference.update({
        where: { userId: id },
        data: {
          ...(preferences.allowPartnerOffers !== undefined && {
            allowPartnerOffers: preferences.allowPartnerOffers,
          }),
          ...(preferences.allowPlatformUpdates !== undefined && {
            allowPlatformUpdates: preferences.allowPlatformUpdates,
          }),
        },
      });
    }

    return {
      id: notificationPreference.id,
      allowPartnerOffers: notificationPreference.allowPartnerOffers,
      allowPlatformUpdates: notificationPreference.allowPlatformUpdates,
    };
  }
}
