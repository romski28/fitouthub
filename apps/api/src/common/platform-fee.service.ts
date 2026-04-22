/**
 * Platform Fee Calculation Service
 * Computes professional base quote -> gross client price with FoH platform fee
 *
 * Phase A: Tiered base fee by quote amount + performance/loyalty adjustments
 * Rounding: Floor to nearest $10
 */

import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma.service';

export interface PlatformFeeBreakdown {
  baseAmount: number;
  baseBandPercent: number;
  performanceAdjustmentPercent: number;
  loyaltyAdjustmentPercent: number;
  effectivePercent: number;
  platformFeeAmount: number;
  grossAmount: number;
  pricingVersion: string;
  calculatedAt: Date;
}

@Injectable()
export class PlatformFeeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate gross price (with platform fee) from professional's base quote
    *
   * @param baseAmount - Professional submitted base quote amount (HKD)
   * @param professionalId - Professional's ID (to look up performance history)
   * @param clientId - Client's ID (to look up loyalty history)
   * @returns PlatformFeeBreakdown with gross amount (floored to nearest 10)
   */
  async calculateGrossPrice(
    baseAmount: number,
    professionalId: string,
    clientId?: string | null,
  ): Promise<PlatformFeeBreakdown> {
    const now = new Date();

    // 1. Get active quote band for this amount
    const quoteBand = await this.prisma.platformFeeQuoteBand.findFirst({
      where: {
        active: true,
        effectiveFrom: { lte: now },
        AND: [
          {
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          {
            minAmount: { lte: new Decimal(baseAmount) },
          },
          {
            OR: [
              { maxAmount: null },
              { maxAmount: { gte: new Decimal(baseAmount) } },
            ],
          },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const baseBandPercent = quoteBand ? Number(quoteBand.basePercent) : 12; // Default to 12%

    // 2. Get professional performance adjustment (by project count awarded/completed)
    const performanceAdjust = await this.getProfessionalPerformanceAdjustment(
      professionalId,
      now,
    );

    // 3. Get client loyalty adjustment (by their historical project count)
    const loyaltyAdjust = clientId
      ? await this.getClientLoyaltyAdjustment(clientId, now)
      : 0;

    // 4. Calculate effective percentage
    const effectivePercent = this.clampPercent(
      baseBandPercent + performanceAdjust + loyaltyAdjust,
    );

    // 5. Calculate gross amount with rounding (floor to nearest 10)
    const feeAmount = baseAmount * (effectivePercent / 100);
    const preRoundGross = baseAmount + feeAmount;
    const grossAmount = Math.floor(preRoundGross / 10) * 10;

    return {
      baseAmount,
      baseBandPercent,
      performanceAdjustmentPercent: performanceAdjust,
      loyaltyAdjustmentPercent: loyaltyAdjust,
      effectivePercent,
      platformFeeAmount: grossAmount - baseAmount,
      grossAmount,
      pricingVersion: 'phase-a-flat',
      calculatedAt: now,
    };
  }

  /**
   * Get performance adjustment for a professional based on awarded project count
   * Looks at ProjectProfessional records with status='accepted' (awarded)
   */
  private async getProfessionalPerformanceAdjustment(
    professionalId: string,
    asOf: Date,
  ): Promise<number> {
    const awardedCount = await this.prisma.projectProfessional.count({
      where: {
        professionalId,
        status: 'accepted', // awarded/accepted projects
        quotedAt: { lte: asOf },
      },
    });

    const adjustment = await this.prisma.platformFeePerformanceAdjustment.findFirst({
      where: {
        active: true,
        effectiveFrom: { lte: asOf },
        AND: [
          {
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
          },
          {
            minProjects: { lte: awardedCount },
          },
          {
            OR: [
              { maxProjects: null },
              { maxProjects: { gte: awardedCount } },
            ],
          },
        ],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { minProjects: 'desc' }],
    });

    return adjustment ? Number(adjustment.percentAdjustment) : 0;
  }

  /**
   * Get loyalty adjustment for a client based on their historical project count
   * Counts Project records (any status, regardless of professional awarded)
   */
  private async getClientLoyaltyAdjustment(
    clientId: string,
    asOf: Date,
  ): Promise<number> {
    const projectCount = await this.prisma.project.count({
      where: {
        clientId,
        createdAt: { lte: asOf },
      },
    });

    const adjustment = await this.prisma.platformFeeLoyaltyAdjustment.findFirst({
      where: {
        active: true,
        effectiveFrom: { lte: asOf },
        AND: [
          {
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
          },
          {
            minProjects: { lte: projectCount },
          },
          {
            OR: [
              { maxProjects: null },
              { maxProjects: { gte: projectCount } },
            ],
          },
        ],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { minProjects: 'desc' }],
    });

    return adjustment ? Number(adjustment.percentAdjustment) : 0;
  }

  /**
   * Clamp effective percent to reasonable bounds (e.g., 3% minimum, 20% maximum)
   */
  private clampPercent(percent: number): number {
    const MIN_PERCENT = 3;
    const MAX_PERCENT = 20;
    return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, percent));
  }
}
