import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const rawUrl = process.env.DATABASE_URL || '';
    const isPooler = rawUrl.includes('.pooler.supabase.com');
    let configuredUrl = rawUrl;
    let parseWarning: string | null = null;

    // Normalize pooler URL with minimal required parameters only
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);

        if (isPooler) {
          // Pooler mode: use minimal, stable parameters
          if (!parsed.searchParams.has('pgbouncer')) {
            parsed.searchParams.set('pgbouncer', 'true');
          }
          // Remove aggressive pool tuning that may conflict with Supabase pooler
          parsed.searchParams.delete('connection_limit');
          parsed.searchParams.delete('pool_timeout');
          parsed.searchParams.delete('connect_timeout');
        }

        if (!parsed.searchParams.has('sslmode')) {
          parsed.searchParams.set('sslmode', 'require');
        }

        configuredUrl = parsed.toString();
      } catch (error) {
        parseWarning = `Failed to parse DATABASE_URL: ${(error as Error).message}`;
      }
    }

    super({
      datasources: { db: { url: configuredUrl } },
      log: ['warn', 'error'],
    });

    if (parseWarning) {
      this.logger.warn(parseWarning);
    }

    // Log the configured connection URL for diagnostics (sanitized for security)
    const sanitized = configuredUrl.replace(/:[^@]+@/, ':*****@');
    this.logger.log(`Prisma configured with URL: ${sanitized}`);
  }

  async onModuleInit(): Promise<void> {
    // Retry logic with exponential backoff for Render cold starts
    const maxRetries = 5;
    const baseDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log(`Database connection successful (attempt ${attempt}/${maxRetries})`);
        return;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 10000); // Max 10s
        
        if (isLastAttempt) {
          this.logger.error(
            `Database connection failed after ${maxRetries} attempts: ${(error as Error).message}. ` +
            `Check that Render DATABASE_URL env var contains valid Supabase credentials and is properly URL-encoded.`,
          );
          throw error;
        } else {
          this.logger.warn(
            `Database connection attempt ${attempt}/${maxRetries} failed: ${(error as Error).message}. Retrying in ${delay}ms...`,
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
