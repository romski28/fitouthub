import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkerInvitesController } from './worker-invites.controller';
import { WorkerInvitesService } from './worker-invites.service';

@Module({
  controllers: [WorkerInvitesController],
  providers: [WorkerInvitesService, PrismaService],
})
export class WorkerInvitesModule {}
