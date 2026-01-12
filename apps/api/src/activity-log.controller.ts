import { Controller, Get, Query, Inject } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('activity-log')
export class ActivityLogController {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    try {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 50;
      const skip = (pageNum - 1) * limitNum;

      const logs = await (this.prisma as any).activityLog.findMany({
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, surname: true, email: true },
          },
          professional: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      const total = await (this.prisma as any).activityLog.count();

      return {
        logs,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      console.error('Activity log error:', error);
      return {
        logs: [],
        pagination: { total: 0, page: 1, limit: 50, pages: 0 },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
