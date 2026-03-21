import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CreateProfessionalDto,
  UpdateProfessionalDto,
} from './dto/create-professional.dto';

@Injectable()
export class ProfessionalsService {
  constructor(private prisma: PrismaService) {}

  private async getMasterTradeMap() {
    const masterTrades = await (this.prisma as any).tradesman.findMany({
      select: { title: true },
    });

    const map = new Map<string, string>();
    for (const trade of masterTrades as Array<{ title?: string | null }>) {
      if (!trade?.title) continue;
      const canonical = trade.title.trim();
      if (!canonical) continue;
      map.set(canonical.toLowerCase(), canonical);
    }
    return map;
  }

  private normalizeTradeInput(rawValue: string | undefined | null) {
    if (typeof rawValue !== 'string') return null;
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeTradeList(rawValues: unknown): string[] {
    if (!Array.isArray(rawValues)) return [];
    const deduped = new Set<string>();
    for (const value of rawValues) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      deduped.add(trimmed);
    }
    return Array.from(deduped);
  }

  private resolveCanonicalTrades(rawTrades: string[], masterTradeMap: Map<string, string>) {
    const unknown: string[] = [];
    const canonical: string[] = [];

    for (const trade of rawTrades) {
      const matched = masterTradeMap.get(trade.toLowerCase());
      if (!matched) {
        unknown.push(trade);
        continue;
      }
      if (!canonical.includes(matched)) {
        canonical.push(matched);
      }
    }

    return { canonical, unknown };
  }

  async create(createProfessionalDto: CreateProfessionalDto) {
    try {
      // Use any type assertion to bypass Prisma type checking issues
      const result = await (this.prisma as any).professional.create({
        data: {
          professionType: createProfessionalDto.profession_type || 'contractor',
          email: createProfessionalDto.email,
          phone: createProfessionalDto.phone,
          fullName: createProfessionalDto.full_name,
          businessName: createProfessionalDto.business_name,
          serviceArea: createProfessionalDto.service_area,
          // Canonical location fields
          locationPrimary: createProfessionalDto.location_primary || null,
          locationSecondary: createProfessionalDto.location_secondary || null,
          locationTertiary: createProfessionalDto.location_tertiary || null,
          // Multi-location arrays for contractors/companies
          servicePrimaries: createProfessionalDto.location_primaries ?? [],
          serviceSecondaries: createProfessionalDto.location_secondaries ?? [],
          additionalData: createProfessionalDto.additional_data || {},
          profileImages: createProfessionalDto.profile_images ?? [],
        },
      });

      console.log('Professional created successfully:', result);
      return result;
    } catch (error) {
      console.error('Error creating professional:', error);
      throw error;
    }
  }

  async findAll() {
    try {
      console.log('findAll: Attempting to fetch professionals');

      const result = await (this.prisma as any).professional.findMany({
        include: { referenceProjects: { orderBy: { createdAt: 'desc' } } },
      });
      console.log(`findAll: Success, found ${result.length} professionals`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('findAll: Error fetching professionals:', errorMsg);
      throw new Error(`Failed to fetch professionals: ${errorMsg}`);
    }
  }

  async findOne(id: string) {
    return (this.prisma as any).professional.findUnique({
      where: { id },
      include: {
        referenceProjects: { orderBy: { createdAt: 'desc' } },
        notificationPreferences: {
          select: {
            id: true,
            allowPartnerOffers: true,
            allowPlatformUpdates: true,
            preferredLanguage: true,
          },
        },
      },
    });
  }

  async update(id: string, updateProfessionalDto: UpdateProfessionalDto) {
    // Filter undefined values to prevent "no fields to update" error
    const data: Record<string, any> = {};

    if (updateProfessionalDto.profession_type !== undefined) {
      data.professionType = updateProfessionalDto.profession_type;
    }

    if (updateProfessionalDto.full_name !== undefined) {
      data.fullName = updateProfessionalDto.full_name;
    }

    if (updateProfessionalDto.business_name !== undefined) {
      data.businessName = updateProfessionalDto.business_name;
    }

    if (updateProfessionalDto.service_area !== undefined) {
      data.serviceArea = updateProfessionalDto.service_area || null;
    }

    if (updateProfessionalDto.email !== undefined) {
      data.email = updateProfessionalDto.email;
    }

    if (updateProfessionalDto.phone !== undefined) {
      data.phone = updateProfessionalDto.phone;
    }

    if (updateProfessionalDto.status !== undefined) {
      data.status = updateProfessionalDto.status;
    }

    if (updateProfessionalDto.rating !== undefined) {
      data.rating = updateProfessionalDto.rating;
    }

    const requiresTradeValidation =
      updateProfessionalDto.primary_trade !== undefined ||
      updateProfessionalDto.trades_offered !== undefined;

    let masterTradeMap: Map<string, string> | null = null;
    if (requiresTradeValidation) {
      masterTradeMap = await this.getMasterTradeMap();
    }

    if (updateProfessionalDto.primary_trade !== undefined) {
      const normalizedPrimaryTrade = this.normalizeTradeInput(updateProfessionalDto.primary_trade);
      if (!normalizedPrimaryTrade) {
        data.primaryTrade = null;
      } else {
        const canonical = masterTradeMap?.get(normalizedPrimaryTrade.toLowerCase());
        if (!canonical) {
          throw new BadRequestException(
            `Unknown trade "${normalizedPrimaryTrade}". Please choose a trade from the master trade list.`,
          );
        }
        data.primaryTrade = canonical;
      }
    }

    if (updateProfessionalDto.trades_offered !== undefined) {
      const normalizedTrades = this.normalizeTradeList(updateProfessionalDto.trades_offered);
      const { canonical, unknown } = this.resolveCanonicalTrades(normalizedTrades, masterTradeMap || new Map());
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Unknown trades: ${unknown.join(', ')}. Please choose trades from the master trade list.`,
        );
      }
      data.tradesOffered = canonical;
    }

    if (updateProfessionalDto.supplies_offered !== undefined) {
      data.suppliesOffered = updateProfessionalDto.supplies_offered;
    }

    if (updateProfessionalDto.profile_images !== undefined) {
      data.profileImages = updateProfessionalDto.profile_images;
    }

    if (updateProfessionalDto.location_primary !== undefined) {
      data.locationPrimary = updateProfessionalDto.location_primary;
    }

    if (updateProfessionalDto.location_secondary !== undefined) {
      data.locationSecondary = updateProfessionalDto.location_secondary;
    }

    if (updateProfessionalDto.location_tertiary !== undefined) {
      data.locationTertiary = updateProfessionalDto.location_tertiary;
    }

    if (updateProfessionalDto.emergencyCalloutAvailable !== undefined) {
      data.emergencyCalloutAvailable = updateProfessionalDto.emergencyCalloutAvailable;
    }

    // Check if we have any fields to update
    if (Object.keys(data).length === 0) {
      return (this.prisma as any).professional.findUnique({
        where: { id },
      });
    }

    return (this.prisma as any).professional.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return (this.prisma as any).professional.delete({
      where: { id },
    });
  }

  getLocations() {
    // Return HK locations dataset for client consumption
    // In production, this would be synced from a shared schema
    const locations = [
      {
        primary: 'Hong Kong Island',
        secondary: 'Central and Western',
        tertiary: 'Central',
      },
      {
        primary: 'Hong Kong Island',
        secondary: 'Central and Western',
        tertiary: 'Sheung Wan',
      },
      {
        primary: 'Hong Kong Island',
        secondary: 'Wan Chai',
        tertiary: 'Causeway Bay',
      },
      {
        primary: 'Hong Kong Island',
        secondary: 'Wan Chai',
        tertiary: 'Wan Chai',
      },
      {
        primary: 'Kowloon',
        secondary: 'Yau Tsim Mong',
        tertiary: 'Tsim Sha Tsui',
      },
      { primary: 'Kowloon', secondary: 'Yau Tsim Mong', tertiary: 'Mong Kok' },
      {
        primary: 'Kowloon',
        secondary: 'Sham Shui Po',
        tertiary: 'Sham Shui Po',
      },
      {
        primary: 'New Territories',
        secondary: 'Sai Kung',
        tertiary: 'Tseung Kwan O',
      },
      { primary: 'New Territories', secondary: 'Sha Tin', tertiary: 'Sha Tin' },
      { primary: 'Islands District', secondary: 'Discovery Bay' },
    ];
    return {
      success: true,
      data: locations,
      count: locations.length,
      message: 'HK locations dataset (sample) for reference',
    };
  }

  async getTrades() {
    try {
      const trades = await (this.prisma as any).tradesman.findMany({
        select: {
          id: true,
          title: true,
          category: true,
          emoji: true,
          description: true,
        },
        orderBy: {
          title: 'asc',
        },
      });

      return {
        success: true,
        data: trades,
        count: trades.length,
        message: 'Available tradesman titles',
      };
    } catch (error) {
      console.error('Error fetching trades:', error);
      throw error;
    }
  }

  async bulkApprove(ids: string[]) {
    if (!ids || ids.length === 0) {
      return { updated: 0 };
    }

    const result = await (this.prisma as any).professional.updateMany({
      where: { id: { in: ids } },
      data: { status: 'approved', updatedAt: new Date() },
    });

    return { updated: result?.count ?? 0 };
  }

  async exportCsv() {
    const records = await (this.prisma as any).professional.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const header = [
      'id',
      'professionType',
      'email',
      'phone',
      'status',
      'rating',
      'fullName',
      'businessName',
      'serviceArea',
      'locationPrimary',
      'locationSecondary',
      'locationTertiary',
      'primaryTrade',
      'tradesOffered',
      'suppliesOffered',
      'createdAt',
    ];

    const escape = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const str = Array.isArray(value) ? value.join('; ') : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = records.map((r: any) =>
      [
        r.id,
        r.professionType,
        r.email,
        r.phone,
        r.status,
        r.rating,
        r.fullName,
        r.businessName,
        r.serviceArea,
        r.locationPrimary,
        r.locationSecondary,
        r.locationTertiary,
        r.primaryTrade,
        Array.isArray(r.tradesOffered) ? r.tradesOffered.join(';') : '',
        Array.isArray(r.suppliesOffered) ? r.suppliesOffered.join(';') : '',
        r.createdAt,
      ]
        .map(escape)
        .join(','),
    );

    return [header.join(','), ...rows].join('\n');
  }

  async countPublic(trade?: string, location?: string): Promise<{ count: number }> {
    try {
      const where: any = { status: 'approved' };

      const tradeFilters = trade
        ? [
            { primaryTrade: { contains: trade, mode: 'insensitive' } },
            { tradesOffered: { hasSome: [trade] } },
          ]
        : null;

      const locationFilters = location
        ? [
            { locationPrimary: { contains: location, mode: 'insensitive' } },
            { locationSecondary: { contains: location, mode: 'insensitive' } },
            { locationTertiary: { contains: location, mode: 'insensitive' } },
            { serviceArea: { contains: location, mode: 'insensitive' } },
          ]
        : null;

      if (tradeFilters && locationFilters) {
        where.AND = [{ OR: tradeFilters }, { OR: locationFilters }];
      } else if (tradeFilters) {
        where.OR = tradeFilters;
      } else if (locationFilters) {
        where.OR = locationFilters;
      }

      const count = await (this.prisma as any).professional.count({ where });
      return { count };
    } catch (error) {
      console.error('Error counting professionals:', error);
      return { count: 0 };
    }
  }

  async updateNotificationPreferences(
    id: string,
    preferences: {
      allowPartnerOffers?: boolean;
      allowPlatformUpdates?: boolean;
      preferredLanguage?: string;
    },
  ) {
    // First, ensure the notification preference record exists
    let notificationPreference = await this.prisma.notificationPreference.findUnique({
      where: { professionalId: id },
    });

    if (!notificationPreference) {
      notificationPreference = await this.prisma.notificationPreference.create({
        data: {
          professionalId: id,
          allowPartnerOffers: preferences.allowPartnerOffers ?? false,
          allowPlatformUpdates: preferences.allowPlatformUpdates ?? true,
          preferredLanguage: preferences.preferredLanguage ?? 'en',
        },
      });
    } else {
      notificationPreference = await this.prisma.notificationPreference.update({
        where: { professionalId: id },
        data: {
          ...(preferences.allowPartnerOffers !== undefined && {
            allowPartnerOffers: preferences.allowPartnerOffers,
          }),
          ...(preferences.allowPlatformUpdates !== undefined && {
            allowPlatformUpdates: preferences.allowPlatformUpdates,
          }),
          ...(preferences.preferredLanguage !== undefined && {
            preferredLanguage: preferences.preferredLanguage,
          }),
        },
      });
    }

    return {
      id: notificationPreference.id,
      allowPartnerOffers: notificationPreference.allowPartnerOffers,
      allowPlatformUpdates: notificationPreference.allowPlatformUpdates,
      preferredLanguage: notificationPreference.preferredLanguage,
    };
  }
}
