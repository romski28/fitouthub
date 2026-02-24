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
    const extraParams = isPooler
      ? 'pgbouncer=true&connection_limit=1&pool_timeout=30'
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
    try {
      await this.$connect();
      this.logger.log('Database connection successful');
    } catch (error) {
      this.logger.warn(
        'Could not connect to database: ' + (error as Error).message,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
