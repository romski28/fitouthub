import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret-key',
    });
  }

  async validate(payload: any) {
    // Unified auth: validate any valid JWT (client + professional)
    // Check Identity for session token validity
    const identity = await (this.prisma as any).identity.findFirst({
      where: { id: payload.sub },
      select: { id: true, sessionToken: true },
    });

    // Fallback: if payload.sub isn't an identity ID, try user lookup
    if (!identity) {
      const user = await (this.prisma as any).user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, identityId: true },
      });
      if (user) {
        // Check session via Identity
        if (user.identityId) {
          const idCheck = await (this.prisma as any).identity.findUnique({
            where: { id: user.identityId },
            select: { sessionToken: true },
          });
          if (idCheck?.sessionToken && payload.sessionToken !== idCheck.sessionToken) {
            return null;
          }
        }
        return { id: user.id, email: user.email, role: user.role };
      }

      // Try professional lookup
      const pro = await (this.prisma as any).professional.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, identityId: true },
      });
      if (pro) {
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

      return null;
    }

    // Session check via Identity
    if (identity.sessionToken && payload.sessionToken !== identity.sessionToken) {
      return null;
    }

    // Resolve the correct profile ID from Identity
    let resolvedId = identity.id;
    if (payload.role === 'professional') {
      const persona = await (this.prisma as any).persona.findFirst({
        where: { identityId: identity.id, type: 'PROFESSIONAL' },
        select: { professionalId: true },
      });
      if (persona?.professionalId) resolvedId = persona.professionalId;
    } else {
      // Client: resolve User.id from Persona
      const persona = await (this.prisma as any).persona.findFirst({
        where: { identityId: identity.id, type: 'CLIENT' },
        select: { userId: true },
      });
      if (persona?.userId) resolvedId = persona.userId;
    }

    return { id: resolvedId, role: payload.role || 'client' };
}
