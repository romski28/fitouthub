import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TradesmService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    try {
      const trades = await this.prisma.tradesman.findMany({
        orderBy: { title: 'asc' },
      });
      console.log(`Fetched ${trades.length} tradesmen from database`);
      return trades;
    } catch (error) {
      console.error('Error fetching tradesmen:', error);
      throw error;
    }
  }
}
