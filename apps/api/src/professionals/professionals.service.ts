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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.prisma as any).professional.findMany();
      console.log(`findAll: Success, found ${(result as any).length} professionals`);
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
    });
  }

  async update(id: string, updateProfessionalDto: UpdateProfessionalDto) {
    const businessType =
      updateProfessionalDto.profession_type === 'company'
        ? 'company'
        : 'sole_trader';

    return (this.prisma as any).professional.update({
      where: { id },
      data: {
        type: updateProfessionalDto.profession_type,
        businessType: businessType,
        fullName: updateProfessionalDto.full_name,
        businessName: updateProfessionalDto.business_name,
        serviceArea: updateProfessionalDto.service_area
          ? [updateProfessionalDto.service_area]
          : undefined,
      },
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
      { primary: 'Hong Kong Island', secondary: 'Central and Western', tertiary: 'Central' },
      { primary: 'Hong Kong Island', secondary: 'Central and Western', tertiary: 'Sheung Wan' },
      { primary: 'Hong Kong Island', secondary: 'Wan Chai', tertiary: 'Causeway Bay' },
      { primary: 'Hong Kong Island', secondary: 'Wan Chai', tertiary: 'Wan Chai' },
      { primary: 'Kowloon', secondary: 'Yau Tsim Mong', tertiary: 'Tsim Sha Tsui' },
      { primary: 'Kowloon', secondary: 'Yau Tsim Mong', tertiary: 'Mong Kok' },
      { primary: 'Kowloon', secondary: 'Sham Shui Po', tertiary: 'Sham Shui Po' },
      { primary: 'New Territories', secondary: 'Sai Kung', tertiary: 'Tseung Kwan O' },
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
}
