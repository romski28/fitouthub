import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional auth guard: if a client/pro token is present and valid, attaches req.user;
 * otherwise allows anonymous access.
 */
@Injectable()
export class OptionalCombinedAuthGuard implements CanActivate {
  private jwtGuard: any;
  private jwtProGuard: any;

  constructor() {
    this.jwtGuard = new (AuthGuard('jwt'))();
    this.jwtProGuard = new (AuthGuard('jwt-professional'))();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const ok = await this.jwtGuard.canActivate(context);
      if (ok) {
        const request = context.switchToHttp().getRequest();
        if (request.user && !request.user.isProfessional) {
          request.user.isProfessional = false;
        }
        return true;
      }
    } catch {
      // ignore and try next strategy
    }

    try {
      const ok = await this.jwtProGuard.canActivate(context);
      if (ok) {
        const request = context.switchToHttp().getRequest();
        if (request.user) {
          request.user.isProfessional = true;
        }
        return true;
      }
    } catch {
      // ignore and allow anonymous
    }

    return true;
  }
}
