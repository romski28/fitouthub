import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';

/**
 * Unified identity service — reads/writes the Identity table.
 *
 * During the transition period (Step 4), existing auth code continues to read
 * from User/Professional columns directly. This service provides a parallel
 * path that reads from Identity — callers can dual-read for validation.
 *
 * Once Step 8 cleanup drops the old auth columns, this becomes the single
 * source of truth for all authentication data.
 */
@Injectable()
export class IdentityService {
  constructor(private prisma: PrismaService) {}

  /** Find an identity by email (for login flows). */
  async findByEmail(email: string) {
    return (this.prisma as any).identity.findUnique({
      where: { email },
    });
  }

  /** Find an identity by id. */
  async findById(id: string) {
    return (this.prisma as any).identity.findUnique({
      where: { id },
    });
  }

  /**
   * Create an identity row for a new user registration.
   * Called alongside the existing User.create() during the transition.
   */
  async create(data: {
    email: string;
    passwordHash?: string | null;
    emailVerified?: boolean;
    agreedToTermsVersion?: string;
    agreedToSecurityStatementVersion?: string;
  }) {
    return (this.prisma as any).identity.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash
          ? await bcrypt.hash(data.passwordHash, 10)
          : null,
        emailVerified: data.emailVerified ?? false,
        agreedToTermsAt: new Date(),
        agreedToTermsVersion: data.agreedToTermsVersion ?? '1.0',
        agreedToSecurityStatementAt: new Date(),
        agreedToSecurityStatementVersion:
          data.agreedToSecurityStatementVersion ?? '1.0',
      },
    });
  }

  /**
   * Update session token on the Identity row.
   * Called after successful login to issue/rotate session tokens.
   */
  async setSessionToken(id: string, sessionToken: string) {
    return (this.prisma as any).identity.update({
      where: { id },
      data: { sessionToken },
    });
  }

  /**
   * Update password hash on Identity row.
   */
  async setPasswordHash(id: string, passwordHash: string) {
    const hashed = await bcrypt.hash(passwordHash, 10);
    return (this.prisma as any).identity.update({
      where: { id },
      data: { passwordHash: hashed },
    });
  }

  /**
   * Update OTP fields on Identity row.
   */
  async setOtp(id: string, otpCode: string, otpExpiresAt: Date) {
    return (this.prisma as any).identity.update({
      where: { id },
      data: { otpCode, otpExpiresAt },
    });
  }

  /**
   * Clear OTP and mark as verified.
   */
  async verifyOtp(id: string) {
    return (this.prisma as any).identity.update({
      where: { id },
      data: {
        otpCode: null,
        otpExpiresAt: null,
        otpVerifiedAt: new Date(),
        emailVerified: true,
      },
    });
  }

  /** Clear session (logout). */
  async clearSession(id: string) {
    return (this.prisma as any).identity.update({
      where: { id },
      data: { sessionToken: null },
    });
  }

  /** Validate password against Identity row. Returns true if match. */
  async validatePassword(id: string, password: string): Promise<boolean> {
    const identity = await this.findById(id);
    if (!identity || !identity.passwordHash) return false;

    // bcrypt first (post-migration)
    if (identity.passwordHash.startsWith('$2')) {
      return bcrypt.compare(password, identity.passwordHash);
    }
    // Plaintext fallback (pre-migration — remove after all passwords hashed)
    return identity.passwordHash === password;
  }
}
