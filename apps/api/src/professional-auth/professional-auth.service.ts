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

@Injectable()
export class ProfessionalAuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async register(dto: ProfessionalRegisterDto) {
    // Validate inputs
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    // Check if professional already exists with this email
    const existingProfessional = await (this.prisma as any).professional.findUnique({
      where: { email: dto.email },
    });

    if (existingProfessional) {
      throw new ConflictException('Professional account already exists with this email');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

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
      },
    });

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
    };
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
}
