import {
  Controller,
  MessageEvent,
  Query,
  Req,
  UnauthorizedException,
  Sse,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma.service';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Sse('stream')
  stream(
    @Query('token') token?: string,
    @Req() req?: any,
  ): Observable<MessageEvent> {
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    return new Observable<MessageEvent>((subscriber) => {
      let cleanup: (() => void) | null = null;
      let heartbeat: NodeJS.Timeout | null = null;

      const fail = (message: string) => {
        subscriber.next({ data: { type: 'error', message } });
        subscriber.complete();
      };

      const bootstrap = async () => {
        try {
          const payload = this.jwtService.verify<{
            sub: string;
            type?: string;
            sessionToken?: string;
          }>(token, {
            secret: process.env.JWT_SECRET || 'secret-key',
          });

          const channels: string[] = [];

          if (payload?.type === 'professional') {
            const professional = await (
              this.prisma as any
            ).professional.findUnique({
              where: { id: payload.sub },
              select: { id: true, sessionToken: true },
            });
            if (!professional) {
              throw new UnauthorizedException('Professional not found');
            }
            if (
              professional.sessionToken &&
              payload.sessionToken &&
              professional.sessionToken !== payload.sessionToken
            ) {
              throw new UnauthorizedException('Session expired');
            }
            channels.push(
              this.realtimeService.professionalChannel(professional.id),
            );
          } else {
            const user = await this.prisma.user.findUnique({
              where: { id: payload.sub },
              select: { id: true, role: true, sessionToken: true },
            });
            if (!user) {
              throw new UnauthorizedException('User not found');
            }
            if (
              user.sessionToken &&
              payload.sessionToken &&
              user.sessionToken !== payload.sessionToken
            ) {
              throw new UnauthorizedException('Session expired');
            }

            channels.push(this.realtimeService.userChannel(user.id));
            if (user.role === 'admin') {
              channels.push(this.realtimeService.adminChannel(user.id));
            }
          }

          cleanup = this.realtimeService.subscribe(channels, (event) => {
            subscriber.next({ data: event });
          });

          subscriber.next({
            data: { type: 'connected', at: new Date().toISOString() },
          });

          heartbeat = setInterval(() => {
            subscriber.next({
              data: { type: 'heartbeat', at: new Date().toISOString() },
            });
          }, 20000);
        } catch (error) {
          fail(error instanceof Error ? error.message : 'Unauthorized');
        }
      };

      void bootstrap();

      const closeHandler = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (cleanup) cleanup();
        subscriber.complete();
      };

      req?.on?.('close', closeHandler);

      return () => {
        if (heartbeat) clearInterval(heartbeat);
        if (cleanup) cleanup();
        req?.off?.('close', closeHandler);
      };
    });
  }
}
