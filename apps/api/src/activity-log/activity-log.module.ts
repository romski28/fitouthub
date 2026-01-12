import { Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { PrismaService } from '../prisma.service';

console.log('Loading ActivityLogModule');

@Module({
  controllers: [ActivityLogController],
  providers: [ActivityLogService, PrismaService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {
  constructor() {
    console.log('ActivityLogModule initialized');
  }
}
