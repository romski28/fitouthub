import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ProfessionalLoginDto, ProfessionalRegisterDto } from './dto';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationChannel } from '@prisma/client';
import { verifyGoogleIdToken } from '../common/google-id-token';
import { IdentityService } from '../auth/identity.service';

type ProfessionalGoogleOnboardingPayload = {
  type: 'google_onboarding_professional';
  email: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
};

@Injectable()
export class ProfessionalAuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationService: NotificationService,
    private identityService: IdentityService,
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

    // Create professional account (auth fields live on Identity)
    const professional = await (this.prisma as any).professional.create({
      data: {
        email: dto.email,
        phone: dto.phone || '',
        professionType: dto.professionType || 'general',
        fullName: dto.fullName,
        businessName: dto.businessName,
        additionalData: dto.nickname ? { nickname: dto.nickname } : undefined,
        status: 'pending',
        emergencyCalloutAvailable: dto.emergencyCalloutAvailable ?? false,
      },
    });

    // Create parallel Identity + Persona for unified auth
    const identity = await this.identityService.create({
      email: dto.email,
      passwordHash: dto.password,
    });
    await (this.prisma as any).professional.update({
      where: { id: professional.id },
      data: { identityId: identity.id },
    });
    const persona = await (this.prisma as any).persona.create({
      data: {
        identityId: identity.id,
        type: 'PROFESSIONAL',
        professionalId: professional.id,
      },
    });
    await (this.prisma as any).professional.update({
      where: { id: professional.id },
      data: { personaId: persona.id },
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
        preferredLanguage: dto.preferredLanguage ?? 'en',
        enableEmail: true,
        enableWhatsApp: !!professional.phone,
        enableSMS: !!professional.phone,
        enableWeChat: false,
        allowPartnerOffers: dto.allowPartnerOffers ?? false,
        allowPlatformUpdates: dto.allowPlatformUpdates ?? true,
      },
    });

    // Store OTP on Identity if verification is required
    if (otpCode && dto.requireOtpVerification) {
      await (this.prisma as any).identity.update({
        where: { id: identity.id },
        data: { otpCode, otpExpiresAt },
      });
      await this.sendProfessionalOtp(
        professional.id,
        professional.email,
        professional.phone,
        preferredChannel,
        otpCode,
      );
    }

    // Generate tokens — session token stored on Identity
    const sessionToken = randomUUID();
    await (this.prisma as any).identity.update({
      where: { id: identity.id },
      data: { sessionToken },
    });
    const tokens = this.generateTokens(professional.id, sessionToken);

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
        preferredLanguage: dto.preferredLanguage ?? 'en',
      },
      otpRequired: dto.requireOtpVerification || false,
    };
  }

  async googleStart(idToken: string) {
    const profile = await verifyGoogleIdToken(
      idToken,
      process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
    );

    if (!profile.emailVerified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const existingProfessional = await (this.prisma as any).professional.findUnique({
      where: { email: profile.email },
      include: {
        notificationPreferences: {
          select: {
            preferredLanguage: true,
          },
        },
      },
    });

    if (existingProfessional) {
      const sessionToken = randomUUID();
      await (this.prisma as any).professional.update({
        where: { id: existingProfessional.id },
        data: { sessionToken },
      });

      const tokens = this.generateTokens(existingProfessional.id, sessionToken);

      return {
        success: true,
        existingUser: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        professional: {
          id: existingProfessional.id,
          email: existingProfessional.email,
          fullName: existingProfessional.fullName,
          businessName: existingProfessional.businessName,
          professionType: existingProfessional.professionType,
          status: existingProfessional.status,
          preferredLanguage:
            existingProfessional.notificationPreferences?.preferredLanguage ?? 'en',
        },
      };
    }

    const onboardingToken = this.jwtService.sign(
      {
        type: 'google_onboarding_professional',
        email: profile.email,
        givenName: profile.givenName,
        familyName: profile.familyName,
        picture: profile.picture,
      } satisfies ProfessionalGoogleOnboardingPayload,
      { expiresIn: '20m' },
    );

    return {
      success: true,
      onboardingRequired: true,
      onboardingToken,
      profile: {
        email: profile.email,
        fullName:
          `${profile.givenName || ''} ${profile.familyName || ''}`.trim() || '',
        picture: profile.picture,
      },
    };
  }

  async googleComplete(dto: {
    onboardingToken: string;
    professionType?: string;
    fullName?: string;
    businessName?: string;
    phone?: string;
    nickname?: string;
    preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT' | 'APP_NOTIFICATIONS';
    preferredLanguage?: string;
    allowPartnerOffers?: boolean;
    allowPlatformUpdates?: boolean;
    emergencyCalloutAvailable?: boolean;
  }) {
    if (!dto.onboardingToken) {
      throw new BadRequestException('Onboarding token is required');
    }

    let payload: ProfessionalGoogleOnboardingPayload;
    try {
      payload = this.jwtService.verify<ProfessionalGoogleOnboardingPayload>(
        dto.onboardingToken,
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired onboarding token');
    }

    if (payload.type !== 'google_onboarding_professional' || !payload.email) {
      throw new UnauthorizedException('Invalid onboarding token payload');
    }

    const existingProfessional = await (this.prisma as any).professional.findUnique({
      where: { email: payload.email },
    });

    if (existingProfessional) {
      throw new ConflictException('Professional account already exists with this email');
    }

    const professional = await (this.prisma as any).professional.create({
      data: {
        email: payload.email,
        phone: dto.phone || '',
        professionType: dto.professionType || 'general',
        fullName:
          dto.fullName ||
          `${payload.givenName || ''} ${payload.familyName || ''}`.trim() ||
          'Professional',
        businessName: dto.businessName,
        additionalData: dto.nickname ? { nickname: dto.nickname } : undefined,
        status: 'pending',
        emergencyCalloutAvailable: dto.emergencyCalloutAvailable ?? false,
      },
    });

    // Create parallel Identity + Persona for unified auth (Google OAuth)
    const identity = await this.identityService.create({
      email: payload.email,
      passwordHash: null, // Google OAuth — no password
    });
    await (this.prisma as any).professional.update({
      where: { id: professional.id },
      data: { identityId: identity.id },
    });
    const persona = await (this.prisma as any).persona.create({
      data: {
        identityId: identity.id,
        type: 'PROFESSIONAL',
        professionalId: professional.id,
      },
    });
    await (this.prisma as any).professional.update({
      where: { id: professional.id },
      data: { personaId: persona.id },
    });

    const preferredChannel =
      (dto.preferredContactMethod as NotificationChannel) || NotificationChannel.EMAIL;

    await (this.prisma as any).notificationPreference.create({
      data: {
        professionalId: professional.id,
        primaryChannel: preferredChannel,
        fallbackChannel:
          preferredChannel === NotificationChannel.EMAIL
            ? NotificationChannel.WHATSAPP
            : NotificationChannel.EMAIL,
        preferredLanguage: dto.preferredLanguage ?? 'en',
        enableEmail: true,
        enableWhatsApp: !!professional.phone,
        enableSMS: !!professional.phone,
        enableWeChat: false,
        allowPartnerOffers: dto.allowPartnerOffers ?? false,
        allowPlatformUpdates: dto.allowPlatformUpdates ?? true,
      },
    });

    const sessionToken = randomUUID();
    await (this.prisma as any).identity.update({
      where: { id: identity.id },
      data: { sessionToken },
    });

    const tokens = this.generateTokens(professional.id, sessionToken);

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
        preferredLanguage: dto.preferredLanguage ?? 'en',
      },
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
      include: {
        notificationPreferences: {
          select: {
            preferredLanguage: true,
          },
        },
      },
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

    let isPasswordValid = false;

    try {
      isPasswordValid = await bcrypt.compare(dto.password, professional.passwordHash);
    } catch {
      isPasswordValid = false;
    }

    const isLegacyPlaintextMatch = professional.passwordHash === dto.password;

    if (!isPasswordValid && isLegacyPlaintextMatch) {
      const rehashedPassword = await bcrypt.hash(dto.password, 10);
      await (this.prisma as any).professional.update({
        where: { id: professional.id },
        data: { passwordHash: rehashedPassword },
      });
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Issue session token — invalidates any existing session on another device
    const sessionToken = randomUUID();
    await (this.prisma as any).professional.update({
      where: { id: professional.id },
      data: { sessionToken },
    });

    // Generate tokens
    const tokens = this.generateTokens(professional.id, sessionToken);

    try {
      await (this.prisma as any).activityLog.create({
        data: {
          professionalId: professional.id,
          actorName:
            professional.fullName ||
            professional.businessName ||
            professional.email ||
            'Professional',
          actorType: 'professional',
          action: 'login',
          resource: 'Professional',
          resourceId: professional.id,
          details: 'Professional logged in',
          status: 'success',
        },
      });
    } catch (error) {
      console.error('[ProfessionalAuthService.login] Failed to write activity log:', (error as any)?.message);
    }

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
        preferredLanguage:
          professional.notificationPreferences?.preferredLanguage ?? 'en',
      },
    };
  }

  async setPassword(professionalId: string, password: string) {
    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Find the professional to get their identityId
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id: professionalId },
      select: { identityId: true, email: true, fullName: true },
    });

    if (!professional?.identityId) {
      throw new BadRequestException('Professional has no linked identity record');
    }

    // Update password on the Identity table
    await (this.prisma as any).identity.update({
      where: { id: professional.identityId },
      data: { passwordHash: hashedPassword },
    });

    return {
      success: true,
      professional: {
        id: professionalId,
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

  async validateProfessional(id: string, sessionToken?: string) {
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id },
    });

    if (!professional) {
      throw new UnauthorizedException('Professional not found');
    }

    // Enforce single active session
    if (sessionToken !== undefined && professional.sessionToken && sessionToken !== professional.sessionToken) {
      throw new UnauthorizedException('Session expired — please log in again');
    }

    return professional;
  }

  private generateTokens(professionalId: string, sessionToken?: string) {
    const payload: Record<string, any> = { sub: professionalId, type: 'professional' };
    if (sessionToken) {
      payload.sessionToken = sessionToken;
    }

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
      const professional = await (this.prisma as any).professional.findUnique({
        where: { id: decoded.sub },
        select: { id: true, sessionToken: true },
      });

      if (!professional) {
        throw new UnauthorizedException('Professional not found');
      }

      // Keep existing session token during refresh; initialize only if missing.
      let sessionToken = professional.sessionToken;
      if (!sessionToken) {
        sessionToken = randomUUID();
        await (this.prisma as any).professional.update({
          where: { id: decoded.sub },
          data: { sessionToken },
        });
      }

      // Generate new tokens
      const tokens = this.generateTokens(decoded.sub, sessionToken);

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logoutAll(professionalId: string) {
    await (this.prisma as any).professional.update({
      where: { id: professionalId },
      data: { sessionToken: null },
    });
    return { success: true };
  }

  private async sendProfessionalOtp(
    professionalId: string,
    email: string,
    phone: string,
    preferredChannel: NotificationChannel,
    otpCode: string,
  ) {
    const message = `Your Mimo verification code is ${otpCode}. It expires in 15 minutes.`;

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
