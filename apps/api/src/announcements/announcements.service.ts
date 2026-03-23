import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive() {
    return this.prisma.announcementTicker.findFirst({
      where: { isActive: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listAll() {
    return this.prisma.announcementTicker.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async create(dto: CreateAnnouncementDto, adminUserId: string) {
    const content = (dto.content || '').trim();
    if (!content) {
      throw new BadRequestException('Announcement content is required');
    }

    if (dto.isActive) {
      await this.prisma.announcementTicker.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    return this.prisma.announcementTicker.create({
      data: {
        title: dto.title?.trim() || null,
        content,
        isActive: Boolean(dto.isActive),
        createdBy: adminUserId,
      },
    });
  }

  async activate(id: string) {
    const exists = await this.prisma.announcementTicker.findUnique({
      where: { id },
    });
    if (!exists) {
      throw new NotFoundException('Announcement not found');
    }

    await this.prisma.announcementTicker.updateMany({
      where: { isActive: true, id: { not: id } },
      data: { isActive: false },
    });

    return this.prisma.announcementTicker.update({
      where: { id },
      data: { isActive: true },
    });
  }
}
