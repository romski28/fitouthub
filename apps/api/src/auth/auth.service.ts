import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { RegisterDto, LoginDto } from './dto';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
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
      },
    });

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.role);

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
}
