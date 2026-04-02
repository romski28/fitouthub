import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PrismaService } from '../prisma.service';
import { EmailModule } from '../email/email.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationModule } from '../notifications/notification.module';
import { StripePaymentsService } from './stripe-payments.service';

@Module({
  imports: [EmailModule, ChatModule, NotificationModule],
  controllers: [FinancialController],
  providers: [FinancialService, PrismaService, StripePaymentsService],
  exports: [FinancialService],
})
export class FinancialModule {}
