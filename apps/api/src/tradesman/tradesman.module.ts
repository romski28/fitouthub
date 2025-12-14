import { Module } from '@nestjs/common';
import { TradesmController } from './tradesman.controller';
import { TradesmService } from './tradesman.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [TradesmController],
  providers: [TradesmService, PrismaService],
})
export class TradesmModule {}
