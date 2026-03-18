import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TradesModule } from '../trades/trades.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [TradesModule, ProfessionalsModule],
  controllers: [AiController],
  providers: [AiService, PrismaService],
  exports: [AiService],
})
export class AiModule {}
