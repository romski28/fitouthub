import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PrismaService } from '@nestjs/prisma';

@Module({
  controllers: [FinancialController],
  providers: [FinancialService, PrismaService],
  exports: [FinancialService],
})
export class FinancialModule {}
