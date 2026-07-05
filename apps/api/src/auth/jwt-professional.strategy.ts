import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma.service';

/**
 * Professional JWT strategy — validates tokens issued by the unified
 * /auth/login endpoint. Shares the same secret and validation logic
 * as the client JwtStrategy.
 */
@Injectable()
export class JwtProfessionalStrategy extends PassportStrategy(Strategy, 'jwt-professional') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret-key',
    });
  }

  async validate(payload: any) {
    // Validate via Identity session token
    const identity = await (this.prisma as any).identity.findFirst({
      where: { id: payload.sub },
      select: { id: true, sessionToken: true },
    });

    if (identity) {
      if (identity.sessionToken && payload.sessionToken !== identity.sessionToken) {
        return null;
      }

      // Find the Professional profile linked to this Identity
      const persona = await (this.prisma as any).persona.findFirst({
        where: { identityId: identity.id, type: 'PROFESSIONAL' },
        select: { professionalId: true },
      });

      if (persona?.professionalId) {
        return { id: persona.professionalId, email: null, role: 'professional' };
      }
    }

    // Fallback: check Professional table directly
    const pro = await (this.prisma as any).professional.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, identityId: true },
    });
    if (!pro) return null;

    if (pro.identityId) {
      const idCheck = await (this.prisma as any).identity.findUnique({
        where: { id: pro.identityId },
        select: { sessionToken: true },
      });
      if (idCheck?.sessionToken && payload.sessionToken !== idCheck.sessionToken) {
        return null;
      }
    }
    return { id: pro.id, email: pro.email, role: 'professional' };
  }
}
