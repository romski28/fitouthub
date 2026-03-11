import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { SupportRequestsController } from './support-requests.controller';
import { SupportRequestsService } from './support-requests.service';
import { PrismaService } from '../prisma.service';
import { TwilioProvider } from '../notifications/twilio.provider';

@Module({
  imports: [ConfigModule, PassportModule],
  controllers: [SupportRequestsController],
  providers: [SupportRequestsService, PrismaService, TwilioProvider],
  exports: [SupportRequestsService],
})
export class SupportRequestsModule {}
