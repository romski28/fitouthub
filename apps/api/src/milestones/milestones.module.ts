import { Module } from '@nestjs/common';
import { MilestonesService } from './milestones.service';
import { MilestonesController } from './milestones.controller';
import { PrismaService } from '../prisma.service';
import { ProfessionalAuthModule } from '../professional-auth/professional-auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [ProfessionalAuthModule, EmailModule],
  providers: [MilestonesService, PrismaService],
  controllers: [MilestonesController],
  exports: [MilestonesService],
})
export class MilestonesModule {}
