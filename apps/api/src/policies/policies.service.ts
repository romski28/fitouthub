import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PolicyType } from '@prisma/client';

@Injectable()
export class PoliciesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all policies (admin only)
   */
  async findAll() {
    return this.prisma.policy.findMany({
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    });
  }

  /**
   * Get all versions of a specific policy type
   */
  async findByType(type: PolicyType) {
    return this.prisma.policy.findMany({
      where: { type },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Get the active version of a policy type (public endpoint)
   */
  async findActiveByType(type: PolicyType) {
    const policy = await this.prisma.policy.findFirst({
      where: { type, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!policy) {
      throw new NotFoundException(`No active policy found for type: ${type}`);
    }

    return policy;
  }

  /**
   * Get a specific policy by ID
   */
  async findOne(id: string) {
    const policy = await this.prisma.policy.findUnique({
      where: { id },
    });

    if (!policy) {
      throw new NotFoundException(`Policy with ID ${id} not found`);
    }

    return policy;
  }

  /**
   * Create a new policy version
   */
  async create(createPolicyDto: CreatePolicyDto) {
    // Check if this version already exists
    const existing = await this.prisma.policy.findUnique({
      where: {
        type_version: {
          type: createPolicyDto.type,
          version: createPolicyDto.version,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Policy version ${createPolicyDto.version} already exists for type ${createPolicyDto.type}`,
      );
    }

    // If this is marked as active, deactivate all other versions of this type
    if (createPolicyDto.isActive) {
      await this.prisma.policy.updateMany({
        where: { type: createPolicyDto.type },
        data: { isActive: false },
      });
    }

    return this.prisma.policy.create({
      data: createPolicyDto,
    });
  }

  /**
   * Update an existing policy
   */
  async update(id: string, updatePolicyDto: UpdatePolicyDto) {
    const policy = await this.findOne(id);

    // If marking as active, deactivate all other versions of this type
    if (updatePolicyDto.isActive) {
      await this.prisma.policy.updateMany({
        where: { type: policy.type, id: { not: id } },
        data: { isActive: false },
      });
    }

    return this.prisma.policy.update({
      where: { id },
      data: updatePolicyDto,
    });
  }

  /**
   * Activate a specific policy version (and deactivate others of same type)
   */
  async activate(id: string) {
    const policy = await this.findOne(id);

    // Deactivate all other versions of this type
    await this.prisma.policy.updateMany({
      where: { type: policy.type, id: { not: id } },
      data: { isActive: false },
    });

    // Activate this version
    return this.prisma.policy.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Delete a policy version (soft delete - only if not active)
   */
  async remove(id: string) {
    const policy = await this.findOne(id);

    if (policy.isActive) {
      throw new ConflictException(
        'Cannot delete an active policy. Please activate another version first.',
      );
    }

    return this.prisma.policy.delete({
      where: { id },
    });
  }

  /**
   * Get all active policies (for seeding frontend cache)
   */
  async findAllActive() {
    return this.prisma.policy.findMany({
      where: { isActive: true },
      orderBy: { type: 'asc' },
    });
  }
}
