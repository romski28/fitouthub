import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import { ProfessionalLoginDto, ProfessionalRegisterDto } from './dto';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationChannel } from '@prisma/client';

@Injectable()
export class ProfessionalAuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationService: NotificationService,
  ) {}

  async register(dto: ProfessionalRegisterDto) {
    // Validate inputs
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    // Check if professional already exists with this email
    const existingProfessional = await (
      this.prisma as any
    ).professional.findUnique({
      where: { email: dto.email },
    });

    if (existingProfessional) {
      throw new ConflictException(
        'Professional account already exists with this email',
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Generate OTP if verification is required
    let otpCode: string | null = null;
    let otpExpiresAt: Date | null = null;
    
    if (dto.requireOtpVerification) {
      otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }

    // Create professional account
    const professional = await (this.prisma as any).professional.create({
      data: {
        email: dto.email,
        phone: dto.phone || '',
        professionType: dto.professionType || 'general',
        fullName: dto.fullName,
        businessName: dto.businessName,
        passwordHash: hashedPassword,
        status: 'pending',
        agreedToTermsAt: new Date(),
        agreedToTermsVersion: '1.0',
        agreedToSecurityStatementAt: new Date(),
        agreedToSecurityStatementVersion: '1.0',
        otpCode,
        otpExpiresAt,
      },
    });

    // Create notification preference for the professional
    const preferredChannel = (dto.preferredContactMethod as NotificationChannel) || NotificationChannel.EMAIL;
    
    await (this.prisma as any).notificationPreference.create({
      data: {
        professionalId: professional.id,
        primaryChannel: preferredChannel,
        fallbackChannel:
          preferredChannel === NotificationChannel.EMAIL
            ? NotificationChannel.WHATSAPP
            : NotificationChannel.EMAIL,
        enableEmail: true,
        enableWhatsApp: !!professional.phone,
        enableSMS: !!professional.phone,
        enableWeChat: false,
        allowPartnerOffers: dto.allowPartnerOffers ?? false,
        allowPlatformUpdates: dto.allowPlatformUpdates ?? true,
      },
    });

    // Send OTP if verification is required
    if (otpCode && dto.requireOtpVerification) {
      await this.sendProfessionalOtp(
        professional.id,
        professional.email,
        professional.phone,
        preferredChannel,
        otpCode,
      );
    }

    // Generate tokens
    const tokens = this.generateTokens(professional.id);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      professional: {
        id: professional.id,
        email: professional.email,
        fullName: professional.fullName,
        businessName: professional.businessName,
        professionType: professional.professionType,
      },
      otpRequired: dto.requireOtpVerification || false,
    };
  }

  async verifyRegistrationOtp(email: string, code: string) {
    if (!email || !code) {
      throw new BadRequestException('Email and code are required');
    }

    const professional = await (this.prisma as any).professional.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!professional) {
      throw new BadRequestException('Professional not found');
    }

    return this.verifyOtp(professional.id, code);
  }

  async resendRegistrationOtp(email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const professional = await (this.prisma as any).professional.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!professional) {
      throw new BadRequestException('Professional not found');
    }

    return this.resendOtp(professional.id);
  }

  async login(dto: ProfessionalLoginDto) {
    // Find professional by email
    const professional = await (this.prisma as any).professional.findUnique({
      where: { email: dto.email },
    });

    if (!professional) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if password hash exists (professional must have set password)
    if (!professional.passwordHash) {
      throw new UnauthorizedException(
        'Professional account not fully set up. Please set a password first.',
      );
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      professional.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate tokens
    const tokens = this.generateTokens(professional.id);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      professional: {
        id: professional.id,
        email: professional.email,
        fullName: professional.fullName,
        businessName: professional.businessName,
        professionType: professional.professionType,
        status: professional.status,
      },
    };
  }

  async setPassword(professionalId: string, password: string) {
    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const professional = await (this.prisma as any).professional.update({
      where: { id: professionalId },
      data: { passwordHash: hashedPassword },
    });

    return {
      success: true,
      professional: {
        id: professional.id,
        email: professional.email,
        fullName: professional.fullName,
      },
    };
  }

  async verifyOtp(professionalId: string, otpCode: string) {
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id: professionalId },
    });

    if (!professional) {
      throw new UnauthorizedException('Professional not found');
    }

    if (!professional.otpCode) {
      throw new BadRequestException('No OTP request found for this account');
    }

    if (professional.otpCode !== otpCode) {
      throw new BadRequestException('Invalid OTP code');
    }

    if (professional.otpExpiresAt && professional.otpExpiresAt < new Date()) {
      throw new BadRequestException('OTP has expired');
    }

    // Mark OTP as verified and clear OTP fields
    await (this.prisma as any).professional.update({
      where: { id: professionalId },
      data: {
        otpVerifiedAt: new Date(),
        otpCode: null,
        otpExpiresAt: null,
      },
    });

    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }

  async resendOtp(professionalId: string) {
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id: professionalId },
    });

    if (!professional) {
      throw new UnauthorizedException('Professional not found');
    }

    // Generate new OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Update OTP in database
    await (this.prisma as any).professional.update({
      where: { id: professionalId },
      data: {
        otpCode,
        otpExpiresAt,
      },
    });

    // Send OTP via preferred channel
    const preference = await (this.prisma as any).notificationPreference.findUnique({
      where: { professionalId },
    });
    const preferredChannel =
      preference?.primaryChannel || NotificationChannel.EMAIL;

    await this.sendProfessionalOtp(
      professional.id,
      professional.email,
      professional.phone,
      preferredChannel,
      otpCode,
    );

    return {
      success: true,
      message: 'OTP resent successfully',
    };
  }

  async validateProfessional(id: string) {
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id },
    });

    if (!professional) {
      throw new UnauthorizedException('Professional not found');
    }

    return professional;
  }

  private generateTokens(professionalId: string) {
    const payload = { sub: professionalId, type: 'professional' };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET || 'secret-key',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_SECRET || 'secret-key',
    });

    return { accessToken, refreshToken };
  }

  async refreshToken(token: string) {
    try {
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'secret-key',
      });

      // Validate professional still exists
      await this.validateProfessional(decoded.sub);

      // Generate new tokens
      const tokens = this.generateTokens(decoded.sub);

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async sendProfessionalOtp(
    professionalId: string,
    email: string,
    phone: string,
    preferredChannel: NotificationChannel,
    otpCode: string,
  ) {
    const message = `Your Fitout Hub verification code is ${otpCode}. It expires in 15 minutes.`;

    // Try SMS
    if (preferredChannel === NotificationChannel.SMS && phone) {
      try {
        await this.notificationService.send({
          professionalId,
          phoneNumber: phone,
          channel: NotificationChannel.SMS,
          eventType: 'registration_otp',
          message,
        });
        return;
      } catch (error) {
        console.error('Failed to send SMS OTP, falling back to email:', error.message);
      }
    }

    // Try WhatsApp
    if (preferredChannel === NotificationChannel.WHATSAPP && phone) {
      try {
        await this.notificationService.send({
          professionalId,
          phoneNumber: phone,
          channel: NotificationChannel.WHATSAPP,
          eventType: 'registration_otp',
          message,
        });
        return;
      } catch (error) {
        console.error('Failed to send WhatsApp OTP, falling back to email:', error.message);
      }
    }

    // Fallback to email
    await this.emailService.sendOtpCode({
      to: email,
      code: otpCode,
      firstName: undefined,
      minutesValid: 15,
    });
  }
}
