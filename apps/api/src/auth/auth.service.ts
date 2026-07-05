import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { RegisterDto, LoginDto } from './dto';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationChannel } from '@prisma/client';
import { verifyGoogleIdToken } from '../common/google-id-token';
import { IdentityService } from './identity.service';

type ClientGoogleOnboardingPayload = {
  type: 'google_onboarding_client';
  email: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationService: NotificationService,
    private identityService: IdentityService,
  ) {}

  private buildAuthUserPayload(
    user: {
      id: string;
      nickname: string;
      email: string;
      firstName: string;
      surname: string;
      role: string;
      locationPrimary?: string | null;
      locationSecondary?: string | null;
      locationTertiary?: string | null;
    },
    preferredLanguage: string,
  ) {
    return {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      firstName: user.firstName,
      surname: user.surname,
      role: user.role,
      preferredLanguage,
      locationPrimary: user.locationPrimary ?? null,
      locationSecondary: user.locationSecondary ?? null,
      locationTertiary: user.locationTertiary ?? null,
    };
  }

  private async markProspectiveConversion(userId: string, source: string) {
    try {
      await this.prisma.$executeRaw`
        UPDATE "User"
        SET
          "lifecycleStatus" = 'active',
          "prospectiveConvertedAt" = COALESCE("prospectiveConvertedAt", NOW()),
          "prospectiveLastActivityAt" = NOW()
        WHERE "id" = ${userId}
      `;

      await this.prisma.$executeRaw`
        INSERT INTO "ProspectiveLeadEvent"
          ("userId", "eventType", "source", "metadata", "createdAt")
        VALUES
          (${userId}, 'prospective_converted', ${source}, ${JSON.stringify({ source })}::jsonb, NOW())
      `;
    } catch (error) {
      console.warn('[AuthService] Failed to persist prospective conversion:', (error as Error)?.message);
    }
  }

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

    // Create parallel Identity row for unified auth (Step 4)
    const identity = await this.identityService.create({
      email: dto.email,
      passwordHash: dto.password,
    });
    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { identityId: identity.id },
    });

    await this.prisma.notificationPreference.create({
      data: {
        userId: user.id,
        primaryChannel: preferredContactMethod,
        fallbackChannel:
          preferredContactMethod === NotificationChannel.EMAIL
            ? NotificationChannel.WHATSAPP
            : NotificationChannel.EMAIL,
        preferredLanguage: dto.preferredLanguage ?? 'en',
        enableEmail: true,
        enableWhatsApp: !!dto.mobile,
        enableSMS: !!dto.mobile,
        enableWeChat: false,
        allowPartnerOffers: dto.allowPartnerOffers ?? false,
        allowPlatformUpdates: dto.allowPlatformUpdates ?? true,
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

    // Issue session token (last-writer-wins: new login invalidates older sessions)
    const sessionToken = randomUUID();
    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { sessionToken },
    });

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.role, sessionToken);

    await this.markProspectiveConversion(user.id, 'register');

    // Include persona from the Identity we just created (Step 7)
    const personaRow = await (this.prisma as any).persona.findFirst({
      where: { identityId: identity.id },
      select: { id: true, type: true },
    });

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      persona: personaRow ?? null,
      user: this.buildAuthUserPayload(user, dto.preferredLanguage ?? 'en'),
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

    const existingUser = await (this.prisma as any).user.findUnique({
      where: { email: profile.email },
      include: {
        notificationPreference: {
          select: {
            preferredLanguage: true,
          },
        },
      },
    });

    if (existingUser) {
      const sessionToken = randomUUID();
      await (this.prisma as any).user.update({
        where: { id: existingUser.id },
        data: {
          sessionToken,
          emailVerified: true,
        },
      });

      const tokens = this.generateTokens(existingUser.id, existingUser.role, sessionToken);

      await this.markProspectiveConversion(existingUser.id, 'google_start_existing');

      return {
        success: true,
        existingUser: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.buildAuthUserPayload(
          existingUser,
          existingUser.notificationPreference?.preferredLanguage ?? 'en',
        ),
      };
    }

    const onboardingToken = this.jwtService.sign(
      {
        type: 'google_onboarding_client',
        email: profile.email,
        givenName: profile.givenName,
        familyName: profile.familyName,
        picture: profile.picture,
      } satisfies ClientGoogleOnboardingPayload,
      { expiresIn: '20m' },
    );

    return {
      success: true,
      onboardingRequired: true,
      onboardingToken,
      profile: {
        email: profile.email,
        firstName: profile.givenName || '',
        surname: profile.familyName || '',
        picture: profile.picture,
      },
    };
  }

  async googleComplete(dto: {
    onboardingToken: string;
    nickname: string;
    preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    preferredLanguage?: string;
    mobile?: string;
    allowPartnerOffers?: boolean;
    allowPlatformUpdates?: boolean;
    firstName?: string;
    surname?: string;
  }) {
    if (!dto.onboardingToken || !dto.nickname) {
      throw new BadRequestException('Onboarding token and nickname are required');
    }

    let payload: ClientGoogleOnboardingPayload;
    try {
      payload = this.jwtService.verify<ClientGoogleOnboardingPayload>(
        dto.onboardingToken,
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired onboarding token');
    }

    if (payload.type !== 'google_onboarding_client' || !payload.email) {
      throw new UnauthorizedException('Invalid onboarding token payload');
    }

    const existingUser = await (this.prisma as any).user.findUnique({
      where: { email: payload.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered. Continue with Google sign-in.');
    }

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

    const user = await (this.prisma as any).user.create({
      data: {
        email: payload.email,
        nickname: dto.nickname,
        passwordHash: `google-oauth-${randomUUID()}`,
        firstName: dto.firstName || payload.givenName || 'Member',
        surname: dto.surname || payload.familyName || 'User',
        mobile: dto.mobile,
        role: 'client',
        emailVerified: true,
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
        preferredLanguage: dto.preferredLanguage ?? 'en',
        enableEmail: true,
        enableWhatsApp: !!dto.mobile,
        enableSMS: !!dto.mobile,
        enableWeChat: false,
        allowPartnerOffers: dto.allowPartnerOffers ?? false,
        allowPlatformUpdates: dto.allowPlatformUpdates ?? true,
      },
    });

    const sessionToken = randomUUID();
    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { sessionToken },
    });

    const tokens = this.generateTokens(user.id, user.role, sessionToken);

    await this.markProspectiveConversion(user.id, 'google_complete');

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.buildAuthUserPayload(user, dto.preferredLanguage ?? 'en'),
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
    if (!user.identityId) {
      throw new BadRequestException('Account not fully set up. Please contact support.');
    }

    // Read OTP from Identity table
    const identity = await this.identityService.findById(user.identityId);
    if (!identity || !identity.verificationToken || !identity.passwordResetExpiry) {
      throw new BadRequestException('No OTP found. Please request a new code.');
    }

    if (new Date(identity.passwordResetExpiry).getTime() < Date.now()) {
      throw new BadRequestException('OTP has expired. Please request a new code.');
    }

    if (identity.verificationToken !== code) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Clear OTP and mark email verified on Identity
    await (this.prisma as any).identity.update({
      where: { id: user.identityId },
      data: {
        emailVerified: true,
        verificationToken: null,
        passwordResetExpiry: null,
      },
    });

    const sessionToken = randomUUID();
    await this.identityService.setSessionToken(user.identityId, sessionToken);

    const tokens = this.generateTokens(user.id, user.role, sessionToken);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.buildAuthUserPayload(
        user,
        user.notificationPreference?.preferredLanguage ?? 'en',
      ),
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
    // 1. Authenticate against Identity (unified credential store)
    const identity = await this.identityService.findByEmail(dto.email);
    if (!identity) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (identity.passwordHash !== dto.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Find all personas for this identity
    const allPersonas = await (this.prisma as any).persona.findMany({
      where: { identityId: identity.id },
      select: { id: true, type: true },
    });

    if (allPersonas.length === 0) {
      throw new UnauthorizedException('No account type found. Please contact support.');
    }

    // 3. Determine which persona to use
    let selectedPersona: { id: string; type: string };
    if (dto.personaId) {
      selectedPersona = allPersonas.find((p: any) => p.id === dto.personaId);
      if (!selectedPersona) {
        throw new UnauthorizedException('Invalid persona selection.');
      }
    } else if (allPersonas.length === 1) {
      selectedPersona = allPersonas[0];
    } else {
      // Multiple personas — return list for frontend picker
      return {
        success: true,
        requiresPersonaSelection: true,
        personas: allPersonas,
      };
    }

    // 4. Load profile based on persona type
    let profile: any;
    let profileId: string;
    let role: string;
    let preferredLanguage = 'en';

    if (selectedPersona.type === 'CLIENT') {
      const user = await (this.prisma as any).user.findUnique({
        where: { personaId: selectedPersona.id },
        include: { notificationPreference: { select: { preferredLanguage: true } } },
      });
      if (!user) throw new UnauthorizedException('Client profile not found.');
      profile = this.buildAuthUserPayload(user, user.notificationPreference?.preferredLanguage ?? 'en');
      profileId = user.id;
      role = user.role || 'client';
      preferredLanguage = user.notificationPreference?.preferredLanguage ?? 'en';
    } else if (selectedPersona.type === 'PROFESSIONAL') {
      const pro = await (this.prisma as any).professional.findUnique({
        where: { personaId: selectedPersona.id },
      });
      if (!pro) throw new UnauthorizedException('Professional profile not found.');
      profile = {
        id: pro.id,
        email: pro.email,
        fullName: pro.fullName,
        businessName: pro.businessName,
        professionType: pro.professionType,
        status: pro.status,
        preferredLanguage: 'en',
      };
      profileId = pro.id;
      role = 'professional';
    } else {
      throw new UnauthorizedException(`Unknown persona type: ${selectedPersona.type}`);
    }

    // 5. Issue session token
    const sessionToken = randomUUID();
    await this.identityService.setSessionToken(identity.id, sessionToken);

    // 6. Generate tokens
    const tokens = this.generateTokens(profileId, role, sessionToken);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      persona: selectedPersona,
      personas: allPersonas,
      user: selectedPersona.type === 'CLIENT' ? profile : undefined,
      professional: selectedPersona.type === 'PROFESSIONAL' ? profile : undefined,
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
        select: { id: true, role: true, sessionToken: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Keep existing session token during refresh to avoid invalidating
      // in-flight requests on initial page load. Only initialize if missing.
      let sessionToken = user.sessionToken;
      if (!sessionToken) {
        sessionToken = randomUUID();
        await (this.prisma as any).user.update({
          where: { id: userId },
          data: { sessionToken },
        });
      }

      // Generate new tokens
      const tokens = this.generateTokens(user.id, user.role, sessionToken);

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token', error as any);
    }
  }

  async logoutAll(userId: string) {
    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { sessionToken: null },
    });
    return { success: true };
  }

  private generateTokens(userId: string, role?: string, sessionToken?: string) {
    const jwtSecret = process.env.JWT_SECRET || 'secret-key';
    const jwtRefreshSecret =
      process.env.JWT_REFRESH_SECRET || 'refresh-secret-key';
    const jwtExpiry = process.env.JWT_EXPIRY || '15m';
    const jwtRefreshExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';

    const payload: any = { sub: userId };
    if (role) {
      payload.role = role;
    }
    if (sessionToken) {
      payload.sessionToken = sessionToken;
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

    // Find identityId for this user
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { identityId: true },
    });
    if (user?.identityId) {
      await (this.prisma as any).identity.update({
        where: { id: user.identityId },
        data: {
          verificationToken: code,
          passwordResetExpiry: expiresAt,
        },
      });
    }

    const message = `Your Mimo verification code is ${code}. It expires in 10 minutes.`;

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
