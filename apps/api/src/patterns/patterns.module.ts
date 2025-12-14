import { Module } from '@nestjs/common';
import { PatternsController } from './patterns.controller';
import { PatternsService } from './patterns.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PatternsController],
  providers: [PatternsService, PrismaService],
})
export class PatternsModule {}
