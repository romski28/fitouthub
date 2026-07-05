import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtProfessionalStrategy } from './jwt-professional.strategy';
import { IdentityService } from './identity.service';
import { PrismaService } from '../prisma.service';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    PassportModule,
    EmailModule,
    NotificationModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret-key',
      signOptions: {
        expiresIn: parseInt(process.env.JWT_EXPIRY || '900', 10), // 15m default in seconds
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, JwtProfessionalStrategy, IdentityService, PrismaService],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy, JwtProfessionalStrategy],
})
export class AuthModule {}
