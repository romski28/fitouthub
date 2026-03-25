import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [RealtimeController],
  providers: [RealtimeService, PrismaService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
