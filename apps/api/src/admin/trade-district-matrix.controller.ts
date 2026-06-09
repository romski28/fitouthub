import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('admin/trade-district-matrix')
export class TradeDistrictMatrixController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getMatrix(@Query('featured') featured?: string) {
    const onlyFeatured = featured === '1' || featured === 'true';

    const professionals = await (this.prisma as any).professional.findMany({
      where: {
        status: onlyFeatured ? 'approved' : undefined,
      },
      select: {
        locationPrimary: true,
        tradesOffered: true,
      },
    });

    // Build matrix: district → trade → count
    const matrix: Record<string, Record<string, number>> = {};
    const allTrades = new Set<string>();
    const allDistricts = new Set<string>();

    for (const pro of professionals) {
      const district = pro.locationPrimary?.trim() || 'Unknown';
      const trades: string[] = Array.isArray(pro.tradesOffered) ? pro.tradesOffered : [];

      allDistricts.add(district);

      if (!matrix[district]) matrix[district] = {};

      for (const trade of trades) {
        const t = trade.trim();
        if (!t) continue;
        allTrades.add(t);
        matrix[district][t] = (matrix[district][t] || 0) + 1;
      }
    }

    return {
      districts: Array.from(allDistricts).sort(),
      trades: Array.from(allTrades).sort(),
      matrix,
      totalProfessionals: professionals.length,
    };
  }
}
