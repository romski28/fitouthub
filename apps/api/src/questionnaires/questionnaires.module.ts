import { Module } from '@nestjs/common';
import { QuestionnairesController } from './questionnaires.controller';
import { QuestionnairesService } from './questionnaires.service';
import { PrismaService } from '../prisma.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [QuestionnairesController],
  providers: [QuestionnairesService, PrismaService],
  exports: [QuestionnairesService],
})
export class QuestionnairesModule {}
