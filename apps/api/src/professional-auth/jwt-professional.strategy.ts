import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ProfessionalAuthService } from './professional-auth.service';

@Injectable()
export class JwtProfessionalStrategy extends PassportStrategy(
  Strategy,
  'jwt-professional',
) {
  constructor(private professionalAuthService: ProfessionalAuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret-key',
    });
  }

  async validate(payload: any) {
    // Legacy professional token: type === 'professional', sub === professionalId.
    if (payload.type === 'professional') {
      return this.professionalAuthService.validateProfessional(payload.sub, payload.sessionToken);
    }

    // Unified-auth token: role === 'professional', sub === identity.id.
    if (payload.role === 'professional') {
      return this.professionalAuthService.validateProfessionalByIdentity(payload.sub, payload.sessionToken);
    }

    return null;
  }
}
