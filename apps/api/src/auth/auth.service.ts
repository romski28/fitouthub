import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { RegisterDto, LoginDto } from './dto';
import * as jwt from 'jsonwebtoken';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationChannel } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationService: NotificationService,
  ) {}

  async register(dto: RegisterDto) {
    // Validate inputs
    if (!dto.email || !dto.password || !dto.nickname) {
      throw new BadRequestException(
        'Email, password, and nickname are required',
      );
    }

    // Check if user already exists
    const existingUser = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    // Check if nickname is taken
    const existingNickname = await (this.prisma as any).user.findUnique({
      where: { nickname: dto.nickname },
    });

    if (existingNickname) {
      throw new BadRequestException('Nickname already taken');
    }

    const preferredContactMethod =
      dto.preferredContactMethod || NotificationChannel.EMAIL;

    if (
      (preferredContactMethod === NotificationChannel.WHATSAPP ||
        preferredContactMethod === NotificationChannel.SMS) &&
      !dto.mobile
    ) {
      throw new BadRequestException(
        'Mobile number is required for WhatsApp or SMS contact methods',
      );
    }

    // Create user with plaintext password (MVP only - upgrade to bcrypt in production)
    const user = await (this.prisma as any).user.create({
      data: {
        email: dto.email,
        nickname: dto.nickname,
        passwordHash: dto.password, // Plaintext for MVP
        firstName: dto.firstName,
        surname: dto.surname,
        chineseName: dto.chineseName,
        mobile: dto.mobile,
        role: dto.role || 'client',
        agreedToTermsAt: new Date(),
        agreedToTermsVersion: '1.0',
        agreedToSecurityStatementAt: new Date(),
        agreedToSecurityStatementVersion: '1.0',
      },
    });

    await this.prisma.notificationPreference.create({
      data: {
        userId: user.id,
        primaryChannel: preferredContactMethod,
        fallbackChannel:
          preferredContactMethod === NotificationChannel.EMAIL
            ? NotificationChannel.WHATSAPP
            : NotificationChannel.EMAIL,
        enableEmail: true,
        enableWhatsApp: !!dto.mobile,
        enableSMS: !!dto.mobile,
        enableWeChat: false,
      },
    });

    if (dto.requireOtpVerification) {
      await this.issueRegistrationOtp(user.id, user.email, user.mobile, preferredContactMethod);

      return {
        success: true,
        otpRequired: true,
        email: user.email,
        preferredContactMethod,
      };
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.role);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        firstName: user.firstName,
        surname: user.surname,
        role: user.role,
      },
    };
  }

  async verifyRegistrationOtp(email: string, code: string) {
    if (!email || !code) {
      throw new BadRequestException('Email and code are required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { notificationPreference: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.verificationToken || !user.passwordResetExpiry) {
      throw new BadRequestException('No OTP found. Please request a new code.');
    }

    if (user.passwordResetExpiry.getTime() < Date.now()) {
      throw new BadRequestException('OTP has expired. Please request a new code.');
    }

    if (user.verificationToken !== code) {
      throw new BadRequestException('Invalid OTP code');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        passwordResetExpiry: null,
      },
    });

    const tokens = this.generateTokens(updatedUser.id, updatedUser.role);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: updatedUser.id,
        nickname: updatedUser.nickname,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        surname: updatedUser.surname,
        role: updatedUser.role,
      },
    };
  }

  async resendRegistrationOtp(email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { notificationPreference: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const preferredContactMethod =
      user.notificationPreference?.primaryChannel || NotificationChannel.EMAIL;

    await this.issueRegistrationOtp(
      user.id,
      user.email,
      user.mobile,
      preferredContactMethod,
    );

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  async login(dto: LoginDto) {
    // Find user by email
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Compare passwords (plaintext comparison for MVP)
    if (user.passwordHash !== dto.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.role);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        firstName: user.firstName,
        surname: user.surname,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      // Verify refresh token
      const payload = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      ) as { sub: string };

      const userId = payload.sub;

      // Verify user still exists
      const user = await (this.prisma as any).user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new tokens
      const tokens = this.generateTokens(user.id, user.role);

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token', error as any);
    }
  }

  private generateTokens(userId: string, role?: string) {
    const jwtSecret = process.env.JWT_SECRET || 'secret-key';
    const jwtRefreshSecret =
      process.env.JWT_REFRESH_SECRET || 'refresh-secret-key';
    const jwtExpiry = process.env.JWT_EXPIRY || '15m';
    const jwtRefreshExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';

    const payload: any = { sub: userId };
    if (role) {
      payload.role = role;
    }

    const accessToken = jwt.sign(payload, jwtSecret, {
      expiresIn: jwtExpiry,
    });

    const refreshToken = jwt.sign(payload, jwtRefreshSecret, {
      expiresIn: jwtRefreshExpiry,
    });

    return { accessToken, refreshToken };
  }

  private async issueRegistrationOtp(
    userId: string,
    email: string,
    mobile: string | null,
    preferredContactMethod: NotificationChannel,
  ) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationToken: code,
        passwordResetExpiry: expiresAt,
      },
    });

    const message = `Your Fitout Hub verification code is ${code}. It expires in 10 minutes.`;

    if (preferredContactMethod === NotificationChannel.WHATSAPP && mobile) {
      await this.notificationService.send({
        userId,
        phoneNumber: mobile,
        channel: NotificationChannel.WHATSAPP,
        eventType: 'registration_otp',
        message,
      });
      return;
    }

    if (preferredContactMethod === NotificationChannel.SMS && mobile) {
      await this.notificationService.send({
        userId,
        phoneNumber: mobile,
        channel: NotificationChannel.SMS,
        eventType: 'registration_otp',
        message,
      });
      return;
    }

    await this.emailService.sendOtpCode({
      to: email,
      code,
      firstName: undefined,
      minutesValid: 10,
    });
  }
}
