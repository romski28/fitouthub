import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

type RealtimeEvent = {
  type: string;
  payload?: Record<string, any>;
  at?: string;
};

@Injectable()
export class RealtimeService {
  private readonly listeners = new Map<
    string,
    Set<(event: RealtimeEvent) => void>
  >();

  constructor(private readonly prisma: PrismaService) {}

  private publish(channel: string, event: RealtimeEvent) {
    const bucket = this.listeners.get(channel);
    if (!bucket || bucket.size === 0) return;

    const envelope: RealtimeEvent = {
      ...event,
      at: event.at || new Date().toISOString(),
    };

    bucket.forEach((listener) => {
      try {
        listener(envelope);
      } catch {
        // keep stream alive for other listeners
      }
    });
  }

  subscribe(
    channels: string[],
    listener: (event: RealtimeEvent) => void,
  ): () => void {
    channels.forEach((channel) => {
      if (!this.listeners.has(channel)) {
        this.listeners.set(channel, new Set());
      }
      this.listeners.get(channel)!.add(listener);
    });

    return () => {
      channels.forEach((channel) => {
        const bucket = this.listeners.get(channel);
        if (!bucket) return;
        bucket.delete(listener);
        if (bucket.size === 0) {
          this.listeners.delete(channel);
        }
      });
    };
  }

  userChannel(userId: string) {
    return `user:${userId}`;
  }

  professionalChannel(professionalId: string) {
    return `professional:${professionalId}`;
  }

  adminChannel(adminId: string) {
    return `admin:${adminId}`;
  }

  emitToUser(userId: string, event: RealtimeEvent) {
    this.publish(this.userChannel(userId), event);
  }

  emitToProfessional(professionalId: string, event: RealtimeEvent) {
    this.publish(this.professionalChannel(professionalId), event);
  }

  emitToAdmin(adminId: string, event: RealtimeEvent) {
    this.publish(this.adminChannel(adminId), event);
  }

  async emitToAdmins(event: RealtimeEvent) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true },
      take: 200,
    });

    admins.forEach((admin) => this.emitToAdmin(admin.id, event));
  }
}
