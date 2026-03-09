import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly moduleRef: ModuleRef) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    return {
      status: 'ok',
      message: 'API is working',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage(),
    };
  }

  async getReadiness() {
    const startedAt = Date.now();
    // Lazy-load PrismaService only when readiness check is called
    const prisma = this.moduleRef.get(PrismaService, { strict: false });
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      db: 'ok',
      dbLatencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
