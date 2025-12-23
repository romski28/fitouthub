import { Module } from '@nestjs/common';
import { ProfessionalController } from './professional.controller';
import { PrismaService } from '../prisma.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [ProfessionalController],
  providers: [PrismaService],
})
export class ProfessionalModule {}
