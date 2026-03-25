import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaService } from '../prisma.service';
import { CombinedAuthGuard } from './auth-combined.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService, PrismaService, CombinedAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
