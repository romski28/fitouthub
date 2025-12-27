import { Module } from '@nestjs/common';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [TradesController],
  providers: [TradesService, PrismaService],
  exports: [TradesService],
})
export class TradesModule {}
