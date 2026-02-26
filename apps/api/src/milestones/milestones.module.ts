import { Module } from '@nestjs/common';
import { MilestonesService } from './milestones.service';
import { MilestonesController } from './milestones.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [MilestonesService, PrismaService],
  controllers: [MilestonesController],
  exports: [MilestonesService],
})
export class MilestonesModule {}
