import { Module } from '@nestjs/common';
import { PoliciesService } from './policies.service';
import { PoliciesController } from './policies.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PoliciesController],
  providers: [PoliciesService, PrismaService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
