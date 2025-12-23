import { Module } from '@nestjs/common';
import { ProfessionalController } from './professional.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ProfessionalController],
  providers: [PrismaService],
})
export class ProfessionalModule {}
