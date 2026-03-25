import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { SupportRequestsController } from './support-requests.controller';
import { SupportRequestsService } from './support-requests.service';
import { PrismaService } from '../prisma.service';
import { TwilioProvider } from '../notifications/twilio.provider';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [ConfigModule, PassportModule, RealtimeModule],
  controllers: [SupportRequestsController],
  providers: [SupportRequestsService, PrismaService, TwilioProvider],
  exports: [SupportRequestsService],
})
export class SupportRequestsModule {}
