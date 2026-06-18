import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaService } from '../prisma.service';
import { CombinedAuthGuard } from './auth-combined.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [RealtimeModule, NotificationModule],
  controllers: [ChatController],
  providers: [ChatService, PrismaService, CombinedAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
