import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

type ActivityStatus = 'success' | 'info' | 'warning' | 'danger';

type ActivityDbClient = Prisma.TransactionClient | PrismaService;

export interface RecordActivityInput {
  actorName?: string | null;
  actorType: string;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  details?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: ActivityStatus;
  userId?: string | null;
  professionalId?: string | null;
  projectId?: string | null;
  projectTitle?: string | null;
  tx?: ActivityDbClient;
  bumpProjectActivity?: boolean;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordActivityInput) {
    const db = input.tx ?? this.prisma;
    const projectId = this.resolveProjectId(input);
    let projectTitle = input.projectTitle ?? this.resolveProjectTitle(input.metadata);

    if (projectId && input.bumpProjectActivity !== false) {
      if (!projectTitle) {
        projectTitle = await this.lookupProjectTitle(db, projectId);
      }

      await this.touchProjectActivity(db, projectId, input.actorType).catch((error) => {
        this.logger.warn(
          `Failed to update project activity for ${projectId}: ${(error as Error)?.message}`,
        );
      });
    }

    const metadata = {
      ...(input.metadata ?? {}),
      ...(projectId ? { projectId } : {}),
      ...(projectTitle ? { projectTitle } : {}),
    };

    const resource = input.resource ?? (projectId ? 'Project' : null);
    const resourceId = input.resourceId ?? (resource === 'Project' ? projectId : null);

    return (db as any).activityLog.create({
      data: {
        userId: input.userId ?? null,
        professionalId: input.professionalId ?? null,
        actorName: input.actorName || this.defaultActorName(input.actorType),
        actorType: input.actorType,
        action: input.action,
        resource,
        resourceId,
        details: input.details ?? null,
        metadata,
        status: input.status ?? 'success',
      },
    });
  }

  private async touchProjectActivity(db: ActivityDbClient, projectId: string, actorType: string) {
    const now = new Date();
    const normalizedActorType = String(actorType || '').toLowerCase();
    const data: Record<string, Date> = {
      lastActivityAt: now,
    };

    if (normalizedActorType === 'professional') {
      data.lastProfessionalActivityAt = now;
    } else if (normalizedActorType === 'admin') {
      data.lastAdminActivityAt = now;
    } else if (normalizedActorType === 'client' || normalizedActorType === 'user') {
      data.lastClientActivityAt = now;
    } else {
      data.lastSystemActivityAt = now;
    }

    await db.project.update({
      where: { id: projectId },
      data,
    });
  }

  private resolveProjectId(input: RecordActivityInput): string | null {
    if (input.projectId) return input.projectId;
    if (input.resource === 'Project' && input.resourceId) return input.resourceId;

    const metadataProjectId = input.metadata?.projectId;
    return typeof metadataProjectId === 'string' && metadataProjectId.trim().length > 0
      ? metadataProjectId
      : null;
  }

  private resolveProjectTitle(metadata?: Record<string, unknown> | null): string | null {
    const metadataProjectTitle = metadata?.projectTitle;
    return typeof metadataProjectTitle === 'string' && metadataProjectTitle.trim().length > 0
      ? metadataProjectTitle
      : null;
  }

  private async lookupProjectTitle(db: ActivityDbClient, projectId: string): Promise<string | null> {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { projectName: true },
    });
    return project?.projectName ?? null;
  }

  private defaultActorName(actorType: string): string {
    const normalizedActorType = String(actorType || '').trim();
    if (!normalizedActorType) return 'System';
    return normalizedActorType.charAt(0).toUpperCase() + normalizedActorType.slice(1);
  }
}