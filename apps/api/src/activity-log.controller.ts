import { Controller, Get, Query, Inject, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('activity-log')
export class ActivityLogController {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    try {
      const [logs, total] = await Promise.all([
        (this.prisma as any).activityLog.findMany({
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
        }),
        (this.prisma as any).activityLog.count(),
      ]);

      let responseLogs = logs;

      try {
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

        responseLogs = logs.map((log: any) => {
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
      } catch (error) {
        console.error('Activity log enrichment error:', error);
      }

      return {
        logs: responseLogs,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      console.error('Activity log error:', error);
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}
