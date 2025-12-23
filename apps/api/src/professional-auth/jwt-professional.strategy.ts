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
    // Only allow professional tokens (tokens with type: 'professional')
    if (payload.type !== 'professional') {
      return null;
    }

    return this.professionalAuthService.validateProfessional(payload.sub);
  }
}
