import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection successful');
    } catch (error) {
      this.logger.warn('Could not connect to database: ' + (error as Error).message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
