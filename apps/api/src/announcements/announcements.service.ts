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
  updatedAt: Date;
};

type HomeRailCardAdminRow = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  displayOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHomeRailCardsAdmin() {
    try {
      const rows = await this.prisma.$queryRaw<HomeRailCardAdminRow[]>`
        SELECT
          id,
          title,
          description,
          image_url AS "imageUrl",
          cta_label AS "ctaLabel",
          cta_href AS "ctaHref",
          display_order AS "displayOrder",
          is_active AS "isActive",
          starts_at AS "startsAt",
          ends_at AS "endsAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM home_card_rail
        ORDER BY display_order ASC, created_at DESC
      `;

      return rows.map((row) => ({
        ...row,
        startsAt: row.startsAt ? row.startsAt.toISOString() : null,
        endsAt: row.endsAt ? row.endsAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));
    } catch (error: any) {
      if (error?.code === '42P01') {
        throw new BadRequestException(
          'home_card_rail table not found. Run manual SQL script first.',
        );
      }
      throw error;
    }
  }

  async upsertHomeRailCard(dto: any, _adminUserId: string) {
    const id = String(dto?.id || '').trim();
    const title = String(dto?.title || '').trim();
    const description = String(dto?.description || '').trim();
    const imageUrl = String(dto?.imageUrl || '').trim();
    const ctaLabel = String(dto?.ctaLabel || '').trim();
    const ctaHref = String(dto?.ctaHref || '').trim();
    const displayOrder = Number.isFinite(Number(dto?.displayOrder))
      ? Number(dto.displayOrder)
      : 100;
    const isActive = dto?.isActive !== false;
    const startsAt = dto?.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto?.endsAt ? new Date(dto.endsAt) : null;

    if (!id || !title || !description || !imageUrl || !ctaLabel || !ctaHref) {
      throw new BadRequestException(
        'id, title, description, imageUrl, ctaLabel, and ctaHref are required',
      );
    }

    if (startsAt && Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid startsAt date');
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid endsAt date');
    }

    try {
      await this.prisma.$executeRaw`
        INSERT INTO home_card_rail (
          id,
          title,
          description,
          image_url,
          cta_label,
          cta_href,
          display_order,
          is_active,
          starts_at,
          ends_at,
          updated_at
        ) VALUES (
          ${id},
          ${title},
          ${description},
          ${imageUrl},
          ${ctaLabel},
          ${ctaHref},
          ${displayOrder},
          ${isActive},
          ${startsAt},
          ${endsAt},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          image_url = EXCLUDED.image_url,
          cta_label = EXCLUDED.cta_label,
          cta_href = EXCLUDED.cta_href,
          display_order = EXCLUDED.display_order,
          is_active = EXCLUDED.is_active,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          updated_at = NOW()
      `;

      const rows = await this.prisma.$queryRaw<HomeRailCardAdminRow[]>`
        SELECT
          id,
          title,
          description,
          image_url AS "imageUrl",
          cta_label AS "ctaLabel",
          cta_href AS "ctaHref",
          display_order AS "displayOrder",
          is_active AS "isActive",
          starts_at AS "startsAt",
          ends_at AS "endsAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM home_card_rail
        WHERE id = ${id}
        LIMIT 1
      `;

      const row = rows[0];
      return {
        ...row,
        startsAt: row?.startsAt ? row.startsAt.toISOString() : null,
        endsAt: row?.endsAt ? row.endsAt.toISOString() : null,
        createdAt: row?.createdAt?.toISOString?.() || null,
        updatedAt: row?.updatedAt?.toISOString?.() || null,
      };
    } catch (error: any) {
      if (error?.code === '42P01') {
        throw new BadRequestException(
          'home_card_rail table not found. Run manual SQL script first.',
        );
      }
      throw error;
    }
  }

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
          display_order AS "displayOrder",
          updated_at AS "updatedAt"
        FROM home_card_rail
        WHERE is_active = true
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at IS NULL OR ends_at >= NOW())
        ORDER BY display_order ASC, created_at ASC
      `;

      const versionSource = rows
        .map((row) =>
          [row.id, row.displayOrder, row.updatedAt.toISOString()].join(':'),
        )
        .join('|');

      const version = `home-rail-v1:${versionSource}`;

      return {
        version,
        cards: rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          imageUrl: row.imageUrl,
          ctaLabel: row.ctaLabel,
          ctaHref: row.ctaHref,
          displayOrder: row.displayOrder,
          updatedAt: row.updatedAt.toISOString(),
        })),
      };
    } catch (error: any) {
      // If the manual SQL table has not been created yet, return an empty list.
      if (error?.code === '42P01') {
        return { version: 'home-rail-v1:empty', cards: [] };
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
