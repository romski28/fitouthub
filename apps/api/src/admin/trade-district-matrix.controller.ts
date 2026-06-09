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

      const professionals = await this.prisma.professional.findMany({
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
      });

      // Build matrix: district → trade → count
      // A professional counts once per unique district they serve
      const matrix: Record<string, Record<string, number>> = {};
      const allTrades = new Set<string>();
      const allDistricts = new Set<string>();

      for (const pro of professionals) {
        // Collect all districts this professional serves
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
            allTrades.add(t);
            matrix[district][t] = (matrix[district][t] || 0) + 1;
          }
        }
      }

      return {
        districts: Array.from(allDistricts).sort(),
        trades: Array.from(allTrades).sort(),
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
