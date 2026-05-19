import { Global, Module } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}