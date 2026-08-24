import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';

export interface ContactInput {
  name?: string;
  trades?: string[];
  phone?: string;
  email?: string;
  notes?: string;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private webBaseUrl(): string {
    return (
      process.env.WEB_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.APP_WEB_URL ||
      'http://localhost:3000'
    );
  }

  private normalizeTrades(trades?: string[]): string[] {
    if (!Array.isArray(trades)) return [];
    return [...new Set(trades.map((t) => String(t).trim()).filter(Boolean))];
  }

  private normalizeEmail(email?: string | null): string | null {
    const clean = (email || '').trim().toLowerCase();
    return clean || null;
  }

  list(professionalId: string) {
    return this.prisma.professionalContact.findMany({
      where: { ownerProfessionalId: professionalId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(professionalId: string, input: ContactInput) {
    const name = (input.name || '').trim();
    if (!name) throw new BadRequestException('Name is required');
    return this.prisma.professionalContact.create({
      data: {
        ownerProfessionalId: professionalId,
        name,
        trades: this.normalizeTrades(input.trades),
        phone: input.phone?.trim() || null,
        email: this.normalizeEmail(input.email),
        notes: input.notes?.trim() || null,
      },
    });
  }

  private async assertOwned(professionalId: string, id: string) {
    const contact = await this.prisma.professionalContact.findUnique({ where: { id } });
    if (!contact || contact.ownerProfessionalId !== professionalId) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  async update(professionalId: string, id: string, input: ContactInput) {
    await this.assertOwned(professionalId, id);
    const name = (input.name || '').trim();
    if (!name) throw new BadRequestException('Name is required');
    return this.prisma.professionalContact.update({
      where: { id },
      data: {
        name,
        trades: this.normalizeTrades(input.trades),
        phone: input.phone?.trim() || null,
        email: this.normalizeEmail(input.email),
        notes: input.notes?.trim() || null,
      },
    });
  }

  async remove(professionalId: string, id: string) {
    await this.assertOwned(professionalId, id);
    return this.prisma.professionalContact.delete({ where: { id } });
  }

  async invite(professionalId: string, id: string) {
    const contact = await this.assertOwned(professionalId, id);
    if (contact.linkedProfessionalId) {
      return { alreadyJoined: true, contact };
    }
    const updated = await this.prisma.professionalContact.update({
      where: { id },
      data: {
        inviteStatus: 'invited',
        inviteToken: randomUUID(),
        inviteSentAt: new Date(),
      },
    });
    return {
      alreadyJoined: false,
      contact: updated,
      inviteUrl: `${this.webBaseUrl()}/join?token=${updated.inviteToken}`,
    };
  }
}
