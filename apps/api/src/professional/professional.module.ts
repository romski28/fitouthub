import { Module } from '@nestjs/common';
import { ProfessionalController } from './professional.controller';
import { PrismaService } from '../prisma.service';
import { EmailModule } from '../email/email.module';
import { PlatformFeeService } from '../common/platform-fee.service';
import { UpdatesModule } from '../updates/updates.module';

@Module({
  imports: [EmailModule, UpdatesModule],
  controllers: [ProfessionalController],
  providers: [PrismaService, PlatformFeeService],
})
export class ProfessionalModule {}
