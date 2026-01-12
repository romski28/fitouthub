import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateActivityLogDto {
  userId?: string;
  professionalId?: string;
  actorName: string;
  actorType: 'user' | 'professional' | 'admin' | 'system';
  action: string;
  resource?: string;
  resourceId?: string;
  details?: string;
  metadata?: any;
  status?: 'success' | 'info' | 'warning' | 'danger';
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ActivityLogService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateActivityLogDto) {
    return this.prisma.activityLog.create({
      data: {
        userId: data.userId,
        professionalId: data.professionalId,
        actorName: data.actorName,
        actorType: data.actorType,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        details: data.details,
        metadata: data.metadata,
        status: data.status || 'info',
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: any;
    orderBy?: any;
  }) {
    const { skip, take, where, orderBy } = params || {};
    return this.prisma.activityLog.findMany({
      skip,
      take,
      where,
      orderBy: orderBy || { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
        professional: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  async count(where?: any) {
    return this.prisma.activityLog.count({ where });
  }

  // Helper methods for common actions
  async logAccountCreated(
    userId: string,
    actorName: string,
    actorType: 'user' | 'professional',
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.create({
      userId: actorType === 'user' ? userId : undefined,
      professionalId: actorType === 'professional' ? userId : undefined,
      actorName,
      actorType,
      action: 'account_created',
      resource: actorType === 'professional' ? 'Professional' : 'User',
      resourceId: userId,
      details: `New ${actorType} account created`,
      status: 'success',
      ipAddress,
      userAgent,
    });
  }

  async logLogin(
    userId: string,
    actorName: string,
    actorType: 'user' | 'professional' | 'admin',
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.create({
      userId: actorType !== 'professional' ? userId : undefined,
      professionalId: actorType === 'professional' ? userId : undefined,
      actorName,
      actorType,
      action: 'login',
      details: `User logged in`,
      status: 'info',
      ipAddress,
      userAgent,
    });
  }

  async logLogout(
    userId: string,
    actorName: string,
    actorType: 'user' | 'professional' | 'admin',
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.create({
      userId: actorType !== 'professional' ? userId : undefined,
      professionalId: actorType === 'professional' ? userId : undefined,
      actorName,
      actorType,
      action: 'logout',
      details: `User logged out`,
      status: 'info',
      ipAddress,
      userAgent,
    });
  }

  async logLoginFailed(
    email: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.create({
      actorName: email,
      actorType: 'system',
      action: 'login_failed',
      details: `Failed login attempt for ${email}`,
      status: 'warning',
      ipAddress,
      userAgent,
    });
  }

  async logPasswordChanged(
    userId: string,
    actorName: string,
    actorType: 'user' | 'professional' | 'admin',
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.create({
      userId: actorType !== 'professional' ? userId : undefined,
      professionalId: actorType === 'professional' ? userId : undefined,
      actorName,
      actorType,
      action: 'password_changed',
      details: `Password updated`,
      status: 'success',
      ipAddress,
      userAgent,
    });
  }
}
