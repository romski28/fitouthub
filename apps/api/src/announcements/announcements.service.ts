import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

type HomeRailCardRow = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  displayOrder: number;
};

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHomeRailCards() {
    try {
      const rows = await this.prisma.$queryRaw<HomeRailCardRow[]>`
        SELECT
          id,
          title,
          description,
          image_url AS "imageUrl",
          cta_label AS "ctaLabel",
          cta_href AS "ctaHref",
          display_order AS "displayOrder"
        FROM home_card_rail
        WHERE is_active = true
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at IS NULL OR ends_at >= NOW())
        ORDER BY display_order ASC, created_at ASC
      `;

      return rows;
    } catch (error: any) {
      // If the manual SQL table has not been created yet, return an empty list.
      if (error?.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

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
