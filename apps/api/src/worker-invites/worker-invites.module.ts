import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkerInvitesController } from './worker-invites.controller';
import { WorkerInvitesService } from './worker-invites.service';
import { ProjectWorkerAccessController } from './project-worker-access.controller';
import { ProjectWorkerAccessService } from './project-worker-access.service';

@Module({
  controllers: [WorkerInvitesController, ProjectWorkerAccessController],
  providers: [WorkerInvitesService, ProjectWorkerAccessService, PrismaService],
})
export class WorkerInvitesModule {}
