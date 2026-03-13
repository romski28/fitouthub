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
          // Pooler mode: enforce minimal connection pool for serverless
          if (!parsed.searchParams.has('pgbouncer')) {
            parsed.searchParams.set('pgbouncer', 'true');
          }
          
          // CRITICAL: Serverless environments (Render) need SMALL pools
          // Each instance gets its own pool; multiple instances = pool multiplication
          // Supabase free tier pooler has limited connections (~15 total)
          if (!parsed.searchParams.has('connection_limit')) {
            parsed.searchParams.set('connection_limit', '2');
          }
          
          // Set reasonable timeouts for pooler mode
          if (!parsed.searchParams.has('pool_timeout')) {
            parsed.searchParams.set('pool_timeout', '20'); // 20 seconds
          }
          if (!parsed.searchParams.has('connect_timeout')) {
            parsed.searchParams.set('connect_timeout', '10'); // 10 seconds
          }
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
      errorFormat: 'pretty',
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
          this.logger.warn(
            'Continuing startup without an initial DB connection. Prisma will retry on first query.',
          );
          return;
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
