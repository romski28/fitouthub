import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PrismaService } from '../prisma.service';
import { EmailModule } from '../email/email.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [EmailModule, ChatModule],
  controllers: [FinancialController],
  providers: [FinancialService, PrismaService],
  exports: [FinancialService],
})
export class FinancialModule {}
