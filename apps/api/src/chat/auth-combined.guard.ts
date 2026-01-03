import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

/**
 * Combined auth guard that accepts both client (jwt) and professional (jwt-professional) tokens
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private jwtGuard: AuthGuard;
  private jwtProGuard: AuthGuard;

  constructor(private reflector: Reflector) {
    this.jwtGuard = new (AuthGuard('jwt'))();
    this.jwtProGuard = new (AuthGuard('jwt-professional'))();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Try JWT (client) first
    try {
      const result = await this.jwtGuard.canActivate(context);
      if (result) {
        console.log('[CombinedAuthGuard] Client JWT authenticated');
        const request = context.switchToHttp().getRequest();
        // Ensure isProfessional is set
        if (request.user && !request.user.isProfessional) {
          request.user.isProfessional = false;
        }
        return true;
      }
    } catch (e) {
      console.log('[CombinedAuthGuard] Client JWT failed:', e.message);
    }

    // Try JWT Professional
    try {
      const result = await this.jwtProGuard.canActivate(context);
      if (result) {
        console.log('[CombinedAuthGuard] Professional JWT authenticated');
        const request = context.switchToHttp().getRequest();
        // Set isProfessional flag
        if (request.user) {
          request.user.isProfessional = true;
        }
        return true;
      }
    } catch (e) {
      console.log('[CombinedAuthGuard] Professional JWT failed:', e.message);
    }

    throw new UnauthorizedException('Invalid or missing authentication token');
  }
}
