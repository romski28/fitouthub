import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class DelegateInvitesService {
  constructor(private readonly prisma: PrismaService) {}

  private webBaseUrl(): string {
    return (
      process.env.WEB_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.APP_WEB_URL ||
      'http://localhost:3000'
    );
  }

  async createInvite(
    assistedClientId: string,
    input: { email: string; relationshipType?: string; name?: string; phone?: string; notes?: string },
  ) {
    const cleanEmail = (input.email || '').trim().toLowerCase();
    if (!cleanEmail) throw new BadRequestException('Email is required');

    // Self-invite guard: a client cannot invite themselves.
    const client = await this.prisma.user.findUnique({
      where: { id: assistedClientId },
      select: { email: true },
    });
    if (client?.email && client.email.trim().toLowerCase() === cleanEmail) {
      throw new BadRequestException('You cannot invite yourself');
    }

    // Role filter: only a project_delegate User, or an email not on the platform.
    const [existingUser, existingProfessional] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email: cleanEmail },
        select: { id: true, role: true },
      }),
      this.prisma.professional.findUnique({
        where: { email: cleanEmail },
        select: { id: true },
      }),
    ]);

    if (existingProfessional) {
      throw new BadRequestException(
        'This email belongs to a professional account and cannot be invited as a delegate',
      );
    }

    if (existingUser && existingUser.role !== 'project_delegate') {
      throw new BadRequestException(
        'This email is already registered on the platform with a different role',
      );
    }

    const invite = await this.prisma.delegateInvite.create({
      data: {
        email: cleanEmail,
        assistedClientId,
        relationshipType: input.relationshipType?.trim() || 'family',
        status: 'pending',
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        name: input.name?.trim() || null,
        phone: input.phone?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });

    return {
      invite,
      inviteUrl: `${this.webBaseUrl()}/join-delegate?token=${invite.token}`,
    };
  }

  async listInvites(assistedClientId: string) {
    return this.prisma.delegateInvite.findMany({
      where: { assistedClientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listDelegates(assistedClientId: string) {
    return this.prisma.projectDelegate.findMany({
      where: { assistedClientId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, surname: true, nickname: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(assistedClientId: string, id: string) {
    const invite = await this.prisma.delegateInvite.findUnique({ where: { id } });
    if (!invite || invite.assistedClientId !== assistedClientId) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.status !== 'pending') throw new BadRequestException('Invite is not pending');
    return this.prisma.delegateInvite.update({
      where: { id },
      data: { status: 'revoked' },
    });
  }

  async resolveInvite(token: string) {
    const invite = await this.prisma.delegateInvite.findUnique({
      where: { token },
      include: {
        assistedClient: {
          select: { id: true, firstName: true, surname: true, nickname: true, email: true },
        },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') throw new BadRequestException(`Invite is ${invite.status}`);
    if (new Date() > invite.expiresAt) throw new BadRequestException('Invite has expired');

    const delegateUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true, role: true },
    });

    return {
      email: invite.email,
      assistedClientId: invite.assistedClientId,
      client: invite.assistedClient,
      relationshipType: invite.relationshipType,
      isRegisteredDelegate: delegateUser?.role === 'project_delegate',
    };
  }

  async acceptInvite(token: string, email: string) {
    const invite = await this.prisma.delegateInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') throw new BadRequestException(`Invite is ${invite.status}`);
    if (new Date() > invite.expiresAt) throw new BadRequestException('Invite has expired');

    const cleanEmail = (email || '').trim().toLowerCase();
    const delegateUser = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (!delegateUser || delegateUser.role !== 'project_delegate') {
      throw new BadRequestException('Delegate account not found');
    }

    // Upsert the ProjectDelegate link (fixes the self-referential placeholder).
    const existing = await this.prisma.projectDelegate.findUnique({
      where: { userId: delegateUser.id },
    });
    if (existing) {
      await this.prisma.projectDelegate.update({
        where: { id: existing.id },
        data: {
          assistedClientId: invite.assistedClientId,
          relationshipType: invite.relationshipType,
        },
      });
    } else {
      await this.prisma.projectDelegate.create({
        data: {
          userId: delegateUser.id,
          assistedClientId: invite.assistedClientId,
          relationshipType: invite.relationshipType,
        },
      });
    }

    return this.prisma.delegateInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted', acceptedAt: new Date(), delegateUserId: delegateUser.id },
    });
  }
}
