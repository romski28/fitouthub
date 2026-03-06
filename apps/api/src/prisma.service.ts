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
    const urlHasQuery = rawUrl.includes('?');
    
    // Only add pgbouncer params if using Supabase pooler, not direct connection
    const isPooler = rawUrl.includes('.pooler.supabase.com');
    
    // Render-optimized connection limits: 
    // - Minimal connection_limit (3) prevents pool exhaustion on cold starts
    // - max_pool_size controls total pooler connections
    // - Aggressive timeouts force connection recycling
    // - idle_in_transaction forces cleanup of stale transactions
    const extraParams = isPooler
      ? 'pgbouncer=true&connection_limit=3&max_pool_size=10&pool_timeout=10&connect_timeout=5&idle_in_transaction_session_timeout=30000&statement_timeout=30000'
      : '';
    
    const configuredUrl = rawUrl && extraParams
      ? `${rawUrl}${urlHasQuery ? '&' : '?'}${extraParams}`
      : rawUrl;
    super({
      datasources: { db: { url: configuredUrl } },
      log: ['warn', 'error'],
    });
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
            `Database connection failed after ${maxRetries} attempts: ${(error as Error).message}`,
          );
          // Don't throw - allow app to start but log the failure
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
