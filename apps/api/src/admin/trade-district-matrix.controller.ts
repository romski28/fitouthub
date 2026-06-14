import { Controller, Get, HttpException, HttpStatus, Logger, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('admin/trade-district-matrix')
export class TradeDistrictMatrixController {
  private readonly logger = new Logger(TradeDistrictMatrixController.name);

  constructor(private prisma: PrismaService) {}

  @Get()
  async getMatrix(@Query('featured') featured?: string) {
    try {
      const onlyFeatured = featured === '1' || featured === 'true';

      const [professionals, tradesmen] = await Promise.all([
        this.prisma.professional.findMany({
          where: {
            status: onlyFeatured ? 'approved' : undefined,
          },
          select: {
            servicePrimaries: true,
            tradesOffered: true,
            primaryTrade: true,
          },
        }),
        // Fetch ALL trades directly from DB, including disabled ones
        (this.prisma as any).tradesman.findMany({
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
          select: { title: true },
        }) as Promise<Array<{ title: string }>>,
      ]);

      // Build the canonical trade name list from the tradesman table ONLY
      const allTradeNames = new Set<string>();
      for (const trade of tradesmen) {
        if (trade?.title?.trim()) allTradeNames.add(trade.title.trim());
      }

      // Build matrix: region → trade → count
      const matrix: Record<string, Record<string, number>> = {};
      const allRegions = new Set<string>();

      for (const pro of professionals) {
        const regions = new Set<string>();
        // Only use servicePrimaries — the canonical source from ProfessionalRegionCoverage → RegionZone
        if (Array.isArray(pro.servicePrimaries)) {
          for (const z of pro.servicePrimaries) {
            if (z?.trim()) regions.add(z.trim());
          }
        }
        if (regions.size === 0) regions.add('No coverage');

        const rawTrades: string[] = [
          ...(Array.isArray(pro.tradesOffered) ? pro.tradesOffered : []),
          ...(pro.primaryTrade?.trim() ? [pro.primaryTrade.trim()] : []),
        ];
        // Only count trades that exist in the canonical Tradesman table
        const trades = rawTrades.filter((t) => allTradeNames.has(t));

        for (const region of regions) {
          allRegions.add(region);
          if (!matrix[region]) matrix[region] = {};

          for (const trade of trades) {
            const t = trade.trim();
            if (!t) continue;
            matrix[region][t] = (matrix[region][t] || 0) + 1;
          }
        }
      }

      const sortedRegions = Array.from(allRegions).sort();
      const sortedTrades = Array.from(allTradeNames).sort();

      for (const region of sortedRegions) {
        if (!matrix[region]) matrix[region] = {};
        for (const trade of sortedTrades) {
          if (!(trade in matrix[region])) {
            matrix[region][trade] = 0;
          }
        }
      }

      return {
        regions: sortedRegions,
        trades: sortedTrades,
        matrix,
        totalProfessionals: professionals.length,
      };
    } catch (error) {
      this.logger.error('Failed to load trade-district matrix', error);
      throw new HttpException(
        'Failed to load matrix',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
