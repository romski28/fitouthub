import { Module } from '@nestjs/common';
import { ProgressReportsController } from './progress-reports.controller';
import { ProgressReportsService } from './progress-reports.service';
import { PrismaService } from '../prisma.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [ProgressReportsController],
  providers: [ProgressReportsService, PrismaService],
  exports: [ProgressReportsService],
})
export class ProgressReportsModule {}
