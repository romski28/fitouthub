import { Module } from '@nestjs/common';
import { ProfessionalController } from './professional.controller';
import { PrismaService } from '../prisma.service';
import { EmailModule } from '../email/email.module';
import { PlatformFeeService } from '../common/platform-fee.service';
import { UpdatesModule } from '../updates/updates.module';
import { NotificationModule } from '../notifications/notification.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [EmailModule, UpdatesModule, NotificationModule, AuthModule],
  controllers: [ProfessionalController],
  providers: [PrismaService, PlatformFeeService],
})
export class ProfessionalModule {}
