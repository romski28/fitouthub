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
}
