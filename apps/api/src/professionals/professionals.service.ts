import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CreateProfessionalDto,
  UpdateProfessionalDto,
} from './dto/create-professional.dto';
import { buildPublicAssetUrl } from '../storage/media-assets.util';

type RegionBackfillActor = {
  userId?: string;
  actorName?: string;
};

@Injectable()
export class ProfessionalsService {
  constructor(private prisma: PrismaService) {}

  private async writeRegionBackfillActivityLog(params: {
    action: 'region_backfill_dry_run' | 'region_backfill_apply';
    actor?: RegionBackfillActor;
    details: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      const created = await (this.prisma as any).activityLog.create({
        data: {
          userId: params.actor?.userId || null,
          actorName: params.actor?.actorName || 'Admin',
          actorType: 'admin',
          action: params.action,
          resource: 'ProfessionalRegionCoverage',
          details: params.details,
          metadata: params.metadata,
          status: 'success',
        },
      });

      return {
        action: created.action,
        actorName: created.actorName,
        createdAt: created.createdAt,
        details: created.details,
      };
    } catch (error) {
      console.error('[ProfessionalsService] Failed to write region backfill activity log:', (error as any)?.message);
      return null;
    }
  }

  async getRegionBackfillLastRun() {
    const last = await (this.prisma as any).activityLog.findFirst({
      where: {
        action: {
          in: ['region_backfill_dry_run', 'region_backfill_apply'],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        action: true,
        actorName: true,
        createdAt: true,
        details: true,
      },
    });

    if (!last) return null;

    return {
      action: last.action,
      actorName: last.actorName,
      createdAt: last.createdAt,
      details: last.details,
    };
  }

  private normalizeLocationText(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private splitServiceAreaTokens(serviceArea: string | null | undefined): string[] {
    if (!serviceArea) return [];
    return serviceArea
      .split(/[,;/\n|]+/g)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  private resolveProfessionalMedia(professional: any) {
    if (!professional) return professional;
    return {
      ...professional,
      profileImages: (professional.profileImages || []).map((v: string) => buildPublicAssetUrl(v)),
      referenceProjects: (professional.referenceProjects || []).map((rp: any) => ({
        ...rp,
        imageUrls: (rp.imageUrls || []).map((v: string) => buildPublicAssetUrl(v)),
      })),
    };
  }

  private async getMasterTradeMap() {
    const masterTrades = await (this.prisma as any).tradesman.findMany({
      select: { title: true },
    });

    const map = new Map<string, string>();
    for (const trade of masterTrades as Array<{ title?: string | null }>) {
      if (!trade?.title) continue;
      const canonical = trade.title.trim();
      if (!canonical) continue;
      map.set(canonical.toLowerCase(), canonical);
    }
    return map;
  }

  private normalizeTradeInput(rawValue: string | undefined | null) {
    if (typeof rawValue !== 'string') return null;
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeTradeList(rawValues: unknown): string[] {
    if (!Array.isArray(rawValues)) return [];
    const deduped = new Set<string>();
    for (const value of rawValues) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      deduped.add(trimmed);
    }
    return Array.from(deduped);
  }

  private resolveCanonicalTrades(rawTrades: string[], masterTradeMap: Map<string, string>) {
    const unknown: string[] = [];
    const canonical: string[] = [];

    for (const trade of rawTrades) {
      const matched = masterTradeMap.get(trade.toLowerCase());
      if (!matched) {
        unknown.push(trade);
        continue;
      }
      if (!canonical.includes(matched)) {
        canonical.push(matched);
      }
    }

    return { canonical, unknown };
  }

  async create(createProfessionalDto: CreateProfessionalDto) {
    try {
      // Use any type assertion to bypass Prisma type checking issues
      const result = await (this.prisma as any).professional.create({
        data: {
          professionType: createProfessionalDto.profession_type || 'contractor',
          email: createProfessionalDto.email,
          phone: createProfessionalDto.phone,
          fullName: createProfessionalDto.full_name,
          businessName: createProfessionalDto.business_name,
          serviceArea: createProfessionalDto.service_area,
          // Canonical location fields
          locationPrimary: createProfessionalDto.location_primary || null,
          locationSecondary: createProfessionalDto.location_secondary || null,
          locationTertiary: createProfessionalDto.location_tertiary || null,
          // Multi-location arrays for contractors/companies
          servicePrimaries: createProfessionalDto.location_primaries ?? [],
          serviceSecondaries: createProfessionalDto.location_secondaries ?? [],
          additionalData: createProfessionalDto.additional_data || {},
          profileImages: createProfessionalDto.profile_images ?? [],
        },
      });

      console.log('Professional created successfully:', result);
      return result;
    } catch (error) {
      console.error('Error creating professional:', error);
      throw error;
    }
  }

  async findAll() {
    try {
      console.log('findAll: Attempting to fetch professionals');

      const result = await (this.prisma as any).professional.findMany({
        include: { referenceProjects: { orderBy: { createdAt: 'desc' } } },
      });
      console.log(`findAll: Success, found ${result.length} professionals`);
      return result.map((p: any) => this.resolveProfessionalMedia(p));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('findAll: Error fetching professionals:', errorMsg);
      throw new Error(`Failed to fetch professionals: ${errorMsg}`);
    }
  }

  async findOne(id: string) {
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id },
      include: {
        referenceProjects: { orderBy: { createdAt: 'desc' } },
        notificationPreferences: {
          select: {
            id: true,
            allowPartnerOffers: true,
            allowPlatformUpdates: true,
            preferredLanguage: true,
          },
        },
      },
    });
    return this.resolveProfessionalMedia(professional);
  }

  async update(id: string, updateProfessionalDto: UpdateProfessionalDto) {
    // Filter undefined values to prevent "no fields to update" error
    const data: Record<string, any> = {};

    if (updateProfessionalDto.profession_type !== undefined) {
      data.professionType = updateProfessionalDto.profession_type;
    }

    if (updateProfessionalDto.full_name !== undefined) {
      data.fullName = updateProfessionalDto.full_name;
    }

    if (updateProfessionalDto.business_name !== undefined) {
      data.businessName = updateProfessionalDto.business_name;
    }

    if (updateProfessionalDto.service_area !== undefined) {
      data.serviceArea = updateProfessionalDto.service_area || null;
    }

    if (updateProfessionalDto.email !== undefined) {
      data.email = updateProfessionalDto.email;
    }

    if (updateProfessionalDto.phone !== undefined) {
      data.phone = updateProfessionalDto.phone;
    }

    if (updateProfessionalDto.status !== undefined) {
      data.status = updateProfessionalDto.status;
    }

    if (updateProfessionalDto.rating !== undefined) {
      data.rating = updateProfessionalDto.rating;
    }

    const requiresTradeValidation =
      updateProfessionalDto.primary_trade !== undefined ||
      updateProfessionalDto.trades_offered !== undefined;

    let masterTradeMap: Map<string, string> | null = null;
    if (requiresTradeValidation) {
      masterTradeMap = await this.getMasterTradeMap();
    }

    if (updateProfessionalDto.primary_trade !== undefined) {
      const normalizedPrimaryTrade = this.normalizeTradeInput(updateProfessionalDto.primary_trade);
      if (!normalizedPrimaryTrade) {
        data.primaryTrade = null;
      } else {
        const canonical = masterTradeMap?.get(normalizedPrimaryTrade.toLowerCase());
        if (!canonical) {
          throw new BadRequestException(
            `Unknown trade "${normalizedPrimaryTrade}". Please choose a trade from the master trade list.`,
          );
        }
        data.primaryTrade = canonical;
      }
    }

    if (updateProfessionalDto.trades_offered !== undefined) {
      const normalizedTrades = this.normalizeTradeList(updateProfessionalDto.trades_offered);
      const { canonical, unknown } = this.resolveCanonicalTrades(normalizedTrades, masterTradeMap || new Map());
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Unknown trades: ${unknown.join(', ')}. Please choose trades from the master trade list.`,
        );
      }
      data.tradesOffered = canonical;
    }

    if (updateProfessionalDto.supplies_offered !== undefined) {
      data.suppliesOffered = updateProfessionalDto.supplies_offered;
    }

    if (updateProfessionalDto.profile_images !== undefined) {
      data.profileImages = updateProfessionalDto.profile_images;
    }

    if (updateProfessionalDto.location_primary !== undefined) {
      data.locationPrimary = updateProfessionalDto.location_primary;
    }

    if (updateProfessionalDto.location_secondary !== undefined) {
      data.locationSecondary = updateProfessionalDto.location_secondary;
    }

    if (updateProfessionalDto.location_tertiary !== undefined) {
      data.locationTertiary = updateProfessionalDto.location_tertiary;
    }

    if (updateProfessionalDto.emergencyCalloutAvailable !== undefined) {
      data.emergencyCalloutAvailable = updateProfessionalDto.emergencyCalloutAvailable;
    }

    // Check if we have any fields to update
    if (Object.keys(data).length === 0) {
      return (this.prisma as any).professional.findUnique({
        where: { id },
      });
    }

    return (this.prisma as any).professional.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return (this.prisma as any).professional.delete({
      where: { id },
    });
  }

  getLocations() {
    // Return HK locations dataset for client consumption
    // In production, this would be synced from a shared schema
    const locations = [
      {
        primary: 'Hong Kong Island',
        secondary: 'Central and Western',
        tertiary: 'Central',
      },
      {
        primary: 'Hong Kong Island',
        secondary: 'Central and Western',
        tertiary: 'Sheung Wan',
      },
      {
        primary: 'Hong Kong Island',
        secondary: 'Wan Chai',
        tertiary: 'Causeway Bay',
      },
      {
        primary: 'Hong Kong Island',
        secondary: 'Wan Chai',
        tertiary: 'Wan Chai',
      },
      {
        primary: 'Kowloon',
        secondary: 'Yau Tsim Mong',
        tertiary: 'Tsim Sha Tsui',
      },
      { primary: 'Kowloon', secondary: 'Yau Tsim Mong', tertiary: 'Mong Kok' },
      {
        primary: 'Kowloon',
        secondary: 'Sham Shui Po',
        tertiary: 'Sham Shui Po',
      },
      {
        primary: 'New Territories',
        secondary: 'Sai Kung',
        tertiary: 'Tseung Kwan O',
      },
      { primary: 'New Territories', secondary: 'Sha Tin', tertiary: 'Sha Tin' },
      { primary: 'Islands District', secondary: 'Discovery Bay' },
    ];
    return {
      success: true,
      data: locations,
      count: locations.length,
      message: 'HK locations dataset (sample) for reference',
    };
  }

  async getTrades() {
    try {
      const trades = await (this.prisma as any).tradesman.findMany({
        select: {
          id: true,
          title: true,
          category: true,
          emoji: true,
          description: true,
        },
        orderBy: {
          title: 'asc',
        },
      });

      return {
        success: true,
        data: trades,
        count: trades.length,
        message: 'Available tradesman titles',
      };
    } catch (error) {
      console.error('Error fetching trades:', error);
      throw error;
    }
  }

  async bulkApprove(ids: string[]) {
    if (!ids || ids.length === 0) {
      return { updated: 0 };
    }

    const result = await (this.prisma as any).professional.updateMany({
      where: { id: { in: ids } },
      data: { status: 'approved', updatedAt: new Date() },
    });

    return { updated: result?.count ?? 0 };
  }

  async exportCsv() {
    const records = await (this.prisma as any).professional.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const header = [
      'id',
      'professionType',
      'email',
      'phone',
      'status',
      'rating',
      'fullName',
      'businessName',
      'serviceArea',
      'locationPrimary',
      'locationSecondary',
      'locationTertiary',
      'primaryTrade',
      'tradesOffered',
      'suppliesOffered',
      'createdAt',
    ];

    const escape = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const str = Array.isArray(value) ? value.join('; ') : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = records.map((r: any) =>
      [
        r.id,
        r.professionType,
        r.email,
        r.phone,
        r.status,
        r.rating,
        r.fullName,
        r.businessName,
        r.serviceArea,
        r.locationPrimary,
        r.locationSecondary,
        r.locationTertiary,
        r.primaryTrade,
        Array.isArray(r.tradesOffered) ? r.tradesOffered.join(';') : '',
        Array.isArray(r.suppliesOffered) ? r.suppliesOffered.join(';') : '',
        r.createdAt,
      ]
        .map(escape)
        .join(','),
    );

    return [header.join(','), ...rows].join('\n');
  }

  async countPublic(trade?: string, location?: string): Promise<{ count: number }> {
    try {
      const where: any = { status: 'approved' };

      const tradeFilters = trade
        ? [
            { primaryTrade: { contains: trade, mode: 'insensitive' } },
            { tradesOffered: { hasSome: [trade] } },
          ]
        : null;

      const locationFilters = location
        ? [
            { locationPrimary: { contains: location, mode: 'insensitive' } },
            { locationSecondary: { contains: location, mode: 'insensitive' } },
            { locationTertiary: { contains: location, mode: 'insensitive' } },
            { serviceArea: { contains: location, mode: 'insensitive' } },
          ]
        : null;

      if (tradeFilters && locationFilters) {
        where.AND = [{ OR: tradeFilters }, { OR: locationFilters }];
      } else if (tradeFilters) {
        where.OR = tradeFilters;
      } else if (locationFilters) {
        where.OR = locationFilters;
      }

      const count = await (this.prisma as any).professional.count({ where });
      return { count };
    } catch (error) {
      console.error('Error counting professionals:', error);
      return { count: 0 };
    }
  }

  private async buildRegionBackfillPlan(sampleSize = 25) {
    const cappedSampleSize = Math.max(5, Math.min(100, Number(sampleSize) || 25));

    const [zones, areas, aliases, professionals] = await Promise.all([
      (this.prisma as any).regionZone.findMany({
        select: { id: true, code: true, label: true },
      }),
      (this.prisma as any).regionArea.findMany({
        select: { id: true, zoneId: true, code: true, name: true },
      }),
      (this.prisma as any).regionAreaAlias.findMany({
        select: { areaId: true, aliasNormalized: true, alias: true },
      }),
      (this.prisma as any).professional.findMany({
        select: {
          id: true,
          fullName: true,
          businessName: true,
          locationPrimary: true,
          locationSecondary: true,
          locationTertiary: true,
          serviceArea: true,
        },
      }),
    ]);

    const areaById = new Map<string, { id: string; zoneId: string; code: string; name: string }>();
    for (const area of areas as Array<{ id: string; zoneId: string; code: string; name: string }>) {
      areaById.set(area.id, area);
    }

    const zoneById = new Map<string, { id: string; code: string; label: string }>();
    for (const zone of zones as Array<{ id: string; code: string; label: string }>) {
      zoneById.set(zone.id, zone);
    }

    const areaTokenMap = new Map<string, Set<string>>();
    const pushAreaToken = (token: string, areaId: string) => {
      const normalized = this.normalizeLocationText(token);
      if (!normalized) return;
      if (!areaTokenMap.has(normalized)) {
        areaTokenMap.set(normalized, new Set<string>());
      }
      areaTokenMap.get(normalized)!.add(areaId);
    };

    for (const area of areas as Array<{ id: string; name: string }>) {
      pushAreaToken(area.name, area.id);
    }
    for (const alias of aliases as Array<{ areaId: string; aliasNormalized: string; alias: string }>) {
      pushAreaToken(alias.aliasNormalized, alias.areaId);
      pushAreaToken(alias.alias, alias.areaId);
    }

    const zoneTokenMap = new Map<string, string[]>();
    const pushZoneToken = (token: string, zoneIds: string[]) => {
      const normalized = this.normalizeLocationText(token);
      if (!normalized) return;
      zoneTokenMap.set(normalized, zoneIds);
    };

    for (const zone of zones as Array<{ id: string; label: string }>) {
      pushZoneToken(zone.label, [zone.id]);
    }

    const zoneByCode = new Map<string, string>();
    for (const zone of zones as Array<{ id: string; code: string }>) {
      zoneByCode.set(zone.code, zone.id);
    }

    if (zoneByCode.get('HKI')) pushZoneToken('hong kong island', [zoneByCode.get('HKI')!]);
    if (zoneByCode.get('KLN')) pushZoneToken('kowloon', [zoneByCode.get('KLN')!]);
    if (zoneByCode.get('ISL')) {
      pushZoneToken('islands', [zoneByCode.get('ISL')!]);
      pushZoneToken('islands district', [zoneByCode.get('ISL')!]);
    }
    if (zoneByCode.get('NTE') && zoneByCode.get('NTW')) {
      pushZoneToken('new territories', [zoneByCode.get('NTE')!, zoneByCode.get('NTW')!]);
      pushZoneToken('nt', [zoneByCode.get('NTE')!, zoneByCode.get('NTW')!]);
    }

    const sample = {
      matched: [] as any[],
      zoneOnly: [] as any[],
      ambiguous: [] as any[],
      unmatched: [] as any[],
    };

    const coverageRows: Array<{ professionalId: string; zoneId: string; areaId: string | null }> = [];
    const coverageByProfessional = new Map<string, Array<{ zoneId: string; areaId: string | null }>>();

    let matchedCount = 0;
    let zoneOnlyCount = 0;
    let ambiguousCount = 0;
    let unmatchedCount = 0;

    let proposedCoverageRows = 0;

    for (const professional of professionals as Array<any>) {
      const areaCandidates = new Set<string>();
      const zoneCandidates = new Set<string>();
      const ambiguousTokens = new Array<{ token: string; areaIds?: string[]; zoneIds?: string[] }>();

      const tokens = [
        professional.locationSecondary,
        professional.locationTertiary,
        ...this.splitServiceAreaTokens(professional.serviceArea),
      ]
        .filter(Boolean)
        .map((value) => String(value));

      for (const token of tokens) {
        const normalized = this.normalizeLocationText(token);
        if (!normalized) continue;
        const matchedAreaIds = areaTokenMap.get(normalized);
        if (!matchedAreaIds || matchedAreaIds.size === 0) continue;

        if (matchedAreaIds.size > 1) {
          ambiguousTokens.push({ token, areaIds: Array.from(matchedAreaIds) });
          continue;
        }

        const [areaId] = Array.from(matchedAreaIds);
        areaCandidates.add(areaId);
      }

      const primaryToken = professional.locationPrimary
        ? this.normalizeLocationText(String(professional.locationPrimary))
        : '';

      if (primaryToken) {
        const mappedZones = zoneTokenMap.get(primaryToken) || [];
        if (mappedZones.length > 1) {
          ambiguousTokens.push({ token: String(professional.locationPrimary), zoneIds: mappedZones });
        } else if (mappedZones.length === 1) {
          zoneCandidates.add(mappedZones[0]);
        }
      }

      for (const areaId of areaCandidates) {
        const area = areaById.get(areaId);
        if (area) {
          zoneCandidates.add(area.zoneId);
        }
      }

      const baseSample = {
        professionalId: professional.id,
        fullName: professional.fullName,
        businessName: professional.businessName,
        locationPrimary: professional.locationPrimary,
        locationSecondary: professional.locationSecondary,
        locationTertiary: professional.locationTertiary,
        serviceArea: professional.serviceArea,
      };

      if (areaCandidates.size > 0) {
        matchedCount += 1;
        proposedCoverageRows += areaCandidates.size;

        const rowsForProfessional = new Array<{ zoneId: string; areaId: string | null }>();
        for (const areaId of areaCandidates) {
          const area = areaById.get(areaId);
          if (!area) continue;
          const row = { zoneId: area.zoneId, areaId };
          rowsForProfessional.push(row);
          coverageRows.push({ professionalId: professional.id, ...row });
        }
        coverageByProfessional.set(professional.id, rowsForProfessional);

        if (sample.matched.length < cappedSampleSize) {
          sample.matched.push({
            ...baseSample,
            matchedAreas: Array.from(areaCandidates)
              .map((areaId) => areaById.get(areaId))
              .filter(Boolean)
              .map((area) => ({
                areaId: area!.id,
                areaCode: area!.code,
                areaName: area!.name,
                zoneId: area!.zoneId,
                zoneCode: zoneById.get(area!.zoneId)?.code,
              })),
            ambiguousTokens,
          });
        }
        continue;
      }

      if (zoneCandidates.size > 0 && ambiguousTokens.length === 0) {
        zoneOnlyCount += 1;
        proposedCoverageRows += zoneCandidates.size;

        const rowsForProfessional = Array.from(zoneCandidates).map((zoneId) => ({
          zoneId,
          areaId: null as string | null,
        }));
        coverageByProfessional.set(professional.id, rowsForProfessional);
        for (const row of rowsForProfessional) {
          coverageRows.push({ professionalId: professional.id, ...row });
        }

        if (sample.zoneOnly.length < cappedSampleSize) {
          sample.zoneOnly.push({
            ...baseSample,
            matchedZones: Array.from(zoneCandidates).map((zoneId) => ({
              zoneId,
              zoneCode: zoneById.get(zoneId)?.code,
              zoneLabel: zoneById.get(zoneId)?.label,
            })),
          });
        }
        continue;
      }

      if (ambiguousTokens.length > 0) {
        ambiguousCount += 1;
        if (sample.ambiguous.length < cappedSampleSize) {
          sample.ambiguous.push({
            ...baseSample,
            ambiguousTokens,
          });
        }
        continue;
      }

      unmatchedCount += 1;
      if (sample.unmatched.length < cappedSampleSize) {
        sample.unmatched.push(baseSample);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        professionalsScanned: professionals.length,
        matchedAreas: matchedCount,
        matchedZonesOnly: zoneOnlyCount,
        ambiguous: ambiguousCount,
        unmatched: unmatchedCount,
        proposedCoverageRows,
      },
      sampleSize: cappedSampleSize,
      samples: sample,
      notes: [
        'No database writes were performed in dry-run mode.',
        'Ambiguous records should be reviewed before apply mode is enabled.',
      ],
      coverageRows,
      coverageByProfessional,
    };
  }

  async dryRunRegionBackfill(sampleSize = 25, actor?: RegionBackfillActor) {
    const plan = await this.buildRegionBackfillPlan(sampleSize);
    const lastRun = await this.writeRegionBackfillActivityLog({
      action: 'region_backfill_dry_run',
      actor,
      details: `Dry run scanned ${plan.totals.professionalsScanned} professionals; proposed ${plan.totals.proposedCoverageRows} coverage rows`,
      metadata: {
        mode: 'dry-run',
        sampleSize: plan.sampleSize,
        totals: plan.totals,
      },
    });

    return {
      success: true,
      mode: 'dry-run',
      generatedAt: plan.generatedAt,
      totals: plan.totals,
      sampleSize: plan.sampleSize,
      samples: plan.samples,
      notes: plan.notes,
      lastRun,
    };
  }

  async applyRegionBackfill(options: { sampleSize?: number; confirm?: boolean; actor?: RegionBackfillActor }) {
    if (!options?.confirm) {
      throw new BadRequestException('confirm=true is required for apply mode');
    }

    const plan = await this.buildRegionBackfillPlan(options.sampleSize ?? 25);
    const professionalIds = Array.from(plan.coverageByProfessional.keys());

    if (professionalIds.length === 0 || plan.coverageRows.length === 0) {
      return {
        success: true,
        mode: 'apply',
        generatedAt: plan.generatedAt,
        totals: plan.totals,
        applied: {
          professionalsReset: 0,
          coverageRowsInserted: 0,
        },
        notes: ['No matched records to apply.'],
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const deleted = await (tx as any).professionalRegionCoverage.deleteMany({
        where: { professionalId: { in: professionalIds } },
      });

      const inserted = await (tx as any).professionalRegionCoverage.createMany({
        data: plan.coverageRows,
      });

      return {
        deletedCount: deleted?.count ?? 0,
        insertedCount: inserted?.count ?? 0,
      };
    });

    const lastRun = await this.writeRegionBackfillActivityLog({
      action: 'region_backfill_apply',
      actor: options.actor,
      details: `Apply reset ${professionalIds.length} professionals; inserted ${result.insertedCount} coverage rows`,
      metadata: {
        mode: 'apply',
        sampleSize: plan.sampleSize,
        totals: plan.totals,
        applied: {
          professionalsReset: professionalIds.length,
          coverageRowsInserted: result.insertedCount,
          previousCoverageRowsRemoved: result.deletedCount,
        },
      },
    });

    return {
      success: true,
      mode: 'apply',
      generatedAt: new Date().toISOString(),
      totals: plan.totals,
      applied: {
        professionalsReset: professionalIds.length,
        coverageRowsInserted: result.insertedCount,
        previousCoverageRowsRemoved: result.deletedCount,
      },
      sampleSize: plan.sampleSize,
      samples: plan.samples,
      notes: [
        'Coverage rows were written to ProfessionalRegionCoverage.',
        'Only professionals with deterministic area/zone matches were updated.',
      ],
      lastRun,
    };
  }

  async updateNotificationPreferences(
    id: string,
    preferences: {
      allowPartnerOffers?: boolean;
      allowPlatformUpdates?: boolean;
      preferredLanguage?: string;
    },
  ) {
    // First, ensure the notification preference record exists
    let notificationPreference = await this.prisma.notificationPreference.findUnique({
      where: { professionalId: id },
    });

    if (!notificationPreference) {
      notificationPreference = await this.prisma.notificationPreference.create({
        data: {
          professionalId: id,
          allowPartnerOffers: preferences.allowPartnerOffers ?? false,
          allowPlatformUpdates: preferences.allowPlatformUpdates ?? true,
          preferredLanguage: preferences.preferredLanguage ?? 'en',
        },
      });
    } else {
      notificationPreference = await this.prisma.notificationPreference.update({
        where: { professionalId: id },
        data: {
          ...(preferences.allowPartnerOffers !== undefined && {
            allowPartnerOffers: preferences.allowPartnerOffers,
          }),
          ...(preferences.allowPlatformUpdates !== undefined && {
            allowPlatformUpdates: preferences.allowPlatformUpdates,
          }),
          ...(preferences.preferredLanguage !== undefined && {
            preferredLanguage: preferences.preferredLanguage,
          }),
        },
      });
    }

    return {
      id: notificationPreference.id,
      allowPartnerOffers: notificationPreference.allowPartnerOffers,
      allowPlatformUpdates: notificationPreference.allowPlatformUpdates,
      preferredLanguage: notificationPreference.preferredLanguage,
    };
  }
}
