import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaService } from '../prisma.service';
import { CombinedAuthGuard } from './auth-combined.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret-key',
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, PrismaService, CombinedAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
