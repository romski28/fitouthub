import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Combined auth guard that accepts both client (jwt) and professional (jwt-professional) tokens
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private jwtGuard = new (AuthGuard('jwt'))();
  private jwtProfessionalGuard = new (AuthGuard('jwt-professional'))();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Try client JWT first
      return await this.jwtGuard.canActivate(context);
    } catch (e1) {
      try {
        // If client JWT fails, try professional JWT
        return await this.jwtProfessionalGuard.canActivate(context);
      } catch (e2) {
        // Both failed
        throw new UnauthorizedException(
          'Invalid or missing authentication token',
        );
      }
    }
  }
}
