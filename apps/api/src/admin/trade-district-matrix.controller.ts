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
            locationPrimary: true,
            locationSecondary: true,
            servicePrimaries: true,
            serviceSecondaries: true,
            tradesOffered: true,
          },
        }),
        // Fetch ALL trades directly from DB, including disabled ones
        (this.prisma as any).tradesman.findMany({
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
          select: { title: true },
        }) as Promise<Array<{ title: string }>>,
      ]);

      // Build the full trade name list from the tradesman table
      const allTradeNames = new Set<string>();
      for (const trade of tradesmen) {
        if (trade?.title?.trim()) allTradeNames.add(trade.title.trim());
      }
      // Also include any trades found in professional data
      for (const pro of professionals) {
        if (Array.isArray(pro.tradesOffered)) {
          for (const t of pro.tradesOffered) {
            if (t?.trim()) allTradeNames.add(t.trim());
          }
        }
      }

      // Build matrix: district → trade → count
      const matrix: Record<string, Record<string, number>> = {};
      const allDistricts = new Set<string>();

      for (const pro of professionals) {
        const districts = new Set<string>();
        if (pro.locationPrimary?.trim()) districts.add(pro.locationPrimary.trim());
        if (pro.locationSecondary?.trim()) districts.add(pro.locationSecondary.trim());
        if (Array.isArray(pro.servicePrimaries)) {
          for (const d of pro.servicePrimaries) {
            if (d?.trim()) districts.add(d.trim());
          }
        }
        if (Array.isArray(pro.serviceSecondaries)) {
          for (const d of pro.serviceSecondaries) {
            if (d?.trim()) districts.add(d.trim());
          }
        }
        if (districts.size === 0) districts.add('Unknown');

        const trades: string[] = Array.isArray(pro.tradesOffered) ? pro.tradesOffered : [];

        for (const district of districts) {
          allDistricts.add(district);
          if (!matrix[district]) matrix[district] = {};

          for (const trade of trades) {
            const t = trade.trim();
            if (!t) continue;
            matrix[district][t] = (matrix[district][t] || 0) + 1;
          }
        }
      }

      // Ensure all trades appear in every district (with 0 if no coverage)
      const sortedDistricts = Array.from(allDistricts).sort();
      const sortedTrades = Array.from(allTradeNames).sort();

      for (const district of sortedDistricts) {
        if (!matrix[district]) matrix[district] = {};
        for (const trade of sortedTrades) {
          if (!(trade in matrix[district])) {
            matrix[district][trade] = 0;
          }
        }
      }

      return {
        districts: sortedDistricts,
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
