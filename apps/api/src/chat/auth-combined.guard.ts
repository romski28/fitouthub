import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Combined auth guard that accepts both client (jwt) and professional (jwt-professional) tokens
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      // Try to verify as client JWT
      try {
        const decoded = await this.jwtService.verifyAsync(token, {
          secret: process.env.JWT_SECRET || 'secret-key',
        });

        // If type is not specified or is 'client', treat as client
        if (!decoded.type || decoded.type === 'client') {
          request.user = {
            id: decoded.sub,
            isProfessional: false,
          };
          return true;
        }
      } catch (e1) {
        // Client JWT failed, try professional
      }

      // Try to verify as professional JWT
      try {
        const decoded = await this.jwtService.verifyAsync(token, {
          secret: process.env.JWT_SECRET || 'secret-key',
        });

        // Check if it's a professional token
        if (decoded.type === 'professional') {
          request.user = {
            id: decoded.sub,
            isProfessional: true,
          };
          return true;
        }
      } catch (e2) {
        // Professional JWT also failed
      }

      throw new UnauthorizedException(
        'Invalid token: not a valid client or professional JWT',
      );
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
