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

      const projectIdAccumulator: string[] = [];
      for (const log of logs as any[]) {
        const metadata = log?.metadata && typeof log.metadata === 'object'
          ? (log.metadata as Record<string, unknown>)
          : null;

        if (log.resource === 'Project' && typeof log.resourceId === 'string' && log.resourceId) {
          projectIdAccumulator.push(log.resourceId);
          continue;
        }

        if (typeof metadata?.projectId === 'string' && metadata.projectId) {
          projectIdAccumulator.push(metadata.projectId);
        }
      }

      const projectIds: string[] = Array.from(new Set(projectIdAccumulator));

      const projects = projectIds.length
        ? await this.prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, projectName: true, lastActivityAt: true },
          })
        : [];

      const projectsById = new Map(projects.map((project) => [project.id, project]));

      const enrichedLogs = logs.map((log: any) => {
        const metadata = log?.metadata && typeof log.metadata === 'object'
          ? (log.metadata as Record<string, unknown>)
          : null;
        const projectId = log.resource === 'Project' && typeof log.resourceId === 'string' && log.resourceId
          ? log.resourceId
          : typeof metadata?.projectId === 'string' && metadata.projectId
            ? metadata.projectId
            : null;
        const project = projectId ? projectsById.get(projectId) : null;
        const fallbackTitle = typeof metadata?.projectTitle === 'string'
          ? metadata.projectTitle
          : typeof metadata?.projectName === 'string'
            ? metadata.projectName
            : null;

        return {
          ...log,
          projectId,
          projectTitle: project?.projectName || fallbackTitle,
          projectLastActivityAt: project?.lastActivityAt || null,
        };
      });

      const total = await (this.prisma as any).activityLog.count();

      return {
        logs: enrichedLogs,
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
