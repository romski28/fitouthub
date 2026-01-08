import { Module } from '@nestjs/common';
import { UpdatesController } from './updates.controller';
import { UpdatesService } from './updates.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [UpdatesController],
  providers: [UpdatesService, PrismaService],
  exports: [UpdatesService],
})
export class UpdatesModule {}
