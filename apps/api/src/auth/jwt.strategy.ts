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
    // Only allow regular user tokens (not professionals)
    if (payload.type === 'professional') {
      return null;
    }

    // Validate user exists
    const user = await (this.prisma as any).user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      return null;
    }

    return { id: user.id, email: user.email, sub: user.id };
  }
}
