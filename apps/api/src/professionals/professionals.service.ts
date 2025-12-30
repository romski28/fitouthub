import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CreateProfessionalDto,
  UpdateProfessionalDto,
} from './dto/create-professional.dto';

@Injectable()
export class ProfessionalsService {
  constructor(private prisma: PrismaService) {}

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
      include: { referenceProjects: { orderBy: { createdAt: 'desc' } } },
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

    if (updateProfessionalDto.primary_trade !== undefined) {
      data.primaryTrade = updateProfessionalDto.primary_trade;
    }

    if (updateProfessionalDto.trades_offered !== undefined) {
      data.tradesOffered = updateProfessionalDto.trades_offered;
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
}
