import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AcProjectsController } from './ac-projects.controller';
import { AcProjectsService } from './ac-projects.service';

@Module({
  controllers: [AcProjectsController],
  providers: [AcProjectsService, PrismaService],
  exports: [AcProjectsService],
})
export class AcProjectsModule {}
