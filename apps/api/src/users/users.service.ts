import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    try {
      return await this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          surname: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          // Exclude password
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (error) {
      console.error('[UsersService.findAll] Database error:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
      });
      return [];
    }
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Filter out undefined values to prevent Prisma errors
    const data = Object.fromEntries(
      Object.entries(updateUserDto).filter(([, v]) => v !== undefined)
    );

    if (Object.keys(data).length === 0) {
      throw new Error('No fields to update');
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
