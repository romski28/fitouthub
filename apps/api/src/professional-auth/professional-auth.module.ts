import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ProfessionalAuthService } from './professional-auth.service';
import { ProfessionalAuthController } from './professional-auth.controller';
import { JwtProfessionalStrategy } from './jwt-professional.strategy';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret-key',
      signOptions: {
        expiresIn: parseInt(process.env.JWT_EXPIRY || '900', 10), // 15m default in seconds
      },
    }),
  ],
  providers: [ProfessionalAuthService, JwtProfessionalStrategy, PrismaService],
  controllers: [ProfessionalAuthController],
  exports: [ProfessionalAuthService],
})
export class ProfessionalAuthModule {}
