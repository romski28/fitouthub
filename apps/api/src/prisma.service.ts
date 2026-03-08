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
    const rawDatabaseUrl = process.env.DATABASE_URL || '';
    const rawDirectUrl = process.env.DIRECT_URL || '';
    const useDirectOverride = process.env.PRISMA_USE_DIRECT_URL === 'true';
    const databaseUrlIsPooler = rawDatabaseUrl.includes('.pooler.supabase.com');
    const preferDirectInProduction =
      process.env.NODE_ENV === 'production' &&
      databaseUrlIsPooler &&
      Boolean(rawDirectUrl);

    const sourceUrl =
      useDirectOverride || preferDirectInProduction
        ? rawDirectUrl || rawDatabaseUrl
        : rawDatabaseUrl;
    const isPooler = sourceUrl.includes('.pooler.supabase.com');
    let configuredUrl = sourceUrl;
    const usingDirect = sourceUrl === rawDirectUrl && Boolean(rawDirectUrl);
    let parseWarning: string | null = null;

    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl);

        if (isPooler) {
          if (!parsed.searchParams.has('pgbouncer')) {
            parsed.searchParams.set('pgbouncer', 'true');
          }
          if (!parsed.searchParams.has('connection_limit')) {
            parsed.searchParams.set('connection_limit', '20');
          }
          if (!parsed.searchParams.has('pool_timeout')) {
            parsed.searchParams.set('pool_timeout', '90');
          }
          if (!parsed.searchParams.has('connect_timeout')) {
            parsed.searchParams.set('connect_timeout', '5');
          }
        }

        if (!parsed.searchParams.has('sslmode')) {
          parsed.searchParams.set('sslmode', 'require');
        }

        configuredUrl = parsed.toString();
      } catch (error) {
        parseWarning = `Failed to parse configured DB URL for parameter normalization: ${(error as Error).message}`;
      }
    }

    super({
      datasources: { db: { url: configuredUrl } },
      log: ['warn', 'error'],
    });

    if (parseWarning) {
      this.logger.warn(parseWarning);
    }

    if (usingDirect) {
      this.logger.warn(
        'Prisma is using DIRECT_URL instead of DATABASE_URL pooler endpoint. Set PRISMA_USE_DIRECT_URL=false to force pooler mode.',
      );
    }
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
