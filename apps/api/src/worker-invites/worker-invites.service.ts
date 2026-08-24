import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkerInvitesService {
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
    professionalId: string,
    input: { email: string; name?: string; phone?: string; trades?: string[]; notes?: string },
  ) {
    const cleanEmail = (input.email || '').trim().toLowerCase();
    if (!cleanEmail) throw new BadRequestException('Email is required');

    const trades = Array.isArray(input.trades)
      ? [...new Set(input.trades.map((t) => String(t).trim()).filter(Boolean))]
      : [];

    const invite = await this.prisma.workerInvite.create({
      data: {
        email: cleanEmail,
        employerProfessionalId: professionalId,
        status: 'pending',
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        name: input.name?.trim() || null,
        phone: input.phone?.trim() || null,
        trades,
        notes: input.notes?.trim() || null,
      },
    });

    return {
      invite,
      inviteUrl: `${this.webBaseUrl()}/join-worker?token=${invite.token}`,
    };
  }

  async listInvites(professionalId: string) {
    return this.prisma.workerInvite.findMany({
      where: { employerProfessionalId: professionalId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listWorkers(professionalId: string) {
    return this.prisma.professional.findMany({
      where: { employerProfessionalId: professionalId, professionType: 'worker' },
      select: {
        id: true,
        email: true,
        fullName: true,
        businessName: true,
        phone: true,
        tradesOffered: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(professionalId: string, id: string) {
    const invite = await this.prisma.workerInvite.findUnique({ where: { id } });
    if (!invite || invite.employerProfessionalId !== professionalId) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.status !== 'pending') throw new BadRequestException('Invite is not pending');
    return this.prisma.workerInvite.update({
      where: { id },
      data: { status: 'revoked' },
    });
  }

  async resolveInvite(token: string) {
    const invite = await this.prisma.workerInvite.findUnique({
      where: { token },
      include: {
        employerProfessional: {
          select: { id: true, businessName: true, fullName: true },
        },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') throw new BadRequestException(`Invite is ${invite.status}`);
    if (new Date() > invite.expiresAt) throw new BadRequestException('Invite has expired');
    return {
      email: invite.email,
      employerProfessionalId: invite.employerProfessionalId,
      employer: invite.employerProfessional,
    };
  }

  async acceptInvite(token: string, email: string) {
    const invite = await this.prisma.workerInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') throw new BadRequestException(`Invite is ${invite.status}`);

    const worker = await this.prisma.professional.findUnique({
      where: { email: (email || '').trim().toLowerCase() },
    });
    if (!worker || worker.professionType !== 'worker') {
      throw new BadRequestException('Worker record not found');
    }

    // Apply invite-time metadata (mobile/trade/notes) to the worker row.
    const updateData: Record<string, unknown> = {};
    if (invite.name && !worker.fullName) updateData.fullName = invite.name;
    if (invite.phone && !worker.phone) updateData.phone = invite.phone;
    if (Array.isArray(invite.trades) && invite.trades.length > 0) {
      updateData.tradesOffered = [...new Set([...(worker.tradesOffered || []), ...invite.trades])];
    }
    if (invite.notes) updateData.notes = invite.notes;
    if (Object.keys(updateData).length > 0) {
      await this.prisma.professional.update({ where: { id: worker.id }, data: updateData });
    }

    return this.prisma.workerInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted', acceptedAt: new Date(), workerId: worker.id },
    });
  }
}
