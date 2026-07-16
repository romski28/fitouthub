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

  // ─── Professional Availability ────────────────────────────────────────────

  async getAvailability(professionalId: string) {
    return this.prisma.professionalAvailability.findMany({
      where: { professionalId },
      orderBy: [{ dayOfWeek: 'asc' }, { date: 'asc' }],
    });
  }

  async upsertAvailability(
    professionalId: string,
    windows: Array<{
      id?: string;
      dayOfWeek?: number | null;
      date?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      maxProjects?: number;
      availableForEmergency?: boolean;
      notes?: string | null;
    }>,
  ) {
    const incomingIds = windows
      .map((w) => w.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

    if (incomingIds.length > 0) {
      await this.prisma.professionalAvailability.deleteMany({
        where: { professionalId, id: { notIn: incomingIds } },
      });
    }

    const results: Array<{
      id: string;
      professionalId: string;
      dayOfWeek: number | null;
      date: Date | null;
      startTime: string | null;
      endTime: string | null;
      maxProjects: number;
      availableForEmergency: boolean;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    for (const window of windows) {
      const data = {
        professionalId,
        dayOfWeek:
          typeof window.dayOfWeek === 'number' && window.dayOfWeek >= 0 && window.dayOfWeek <= 6
            ? window.dayOfWeek
            : null,
        date: window.date ? new Date(window.date) : null,
        startTime: window.startTime?.trim() || null,
        endTime: window.endTime?.trim() || null,
        maxProjects: window.maxProjects ?? 1,
        availableForEmergency: window.availableForEmergency ?? false,
        notes: window.notes?.trim() || null,
      };

      if (window.id) {
        const updated = await this.prisma.professionalAvailability.update({
          where: { id: window.id },
          data,
        });
        results.push(updated);
      } else {
        const created = await this.prisma.professionalAvailability.create({ data });
        results.push(created);
      }
    }

    return results;
  }

  async deleteAvailability(professionalId: string, windowId: string) {
    const existing = await this.prisma.professionalAvailability.findFirst({
      where: { id: windowId, professionalId },
    });
    if (!existing) throw new BadRequestException('Availability window not found');

    await this.prisma.professionalAvailability.delete({ where: { id: windowId } });
    return { ok: true };
  }

  private buildProfessionalCertificationPayload(certification: any) {
    if (!certification) return certification;
    return {
      ...certification,
      documentUrl: certification.documentStorageKey
        ? buildPublicAssetUrl(certification.documentStorageKey)
        : null,
    };
  }

  private normalizeCertificationReviewNotes(value?: string | null) {
    if (value === undefined) return undefined;
    const trimmed = String(value || '').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

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

  private buildLegacyLocationMirrorFromAreas(areas: Array<{ name: string; zone?: { label?: string | null } | null }>) {
    if (!areas.length) {
      return {
        serviceArea: null as string | null,
        locationPrimary: null as string | null,
        locationSecondary: null as string | null,
        locationTertiary: null as string | null,
      };
    }

    const uniqueAreaNames = Array.from(new Set(areas.map((area) => area.name.trim()).filter(Boolean)));
    const uniqueZoneLabels = Array.from(
      new Set(
        areas
          .map((area) => (area.zone?.label || '').trim())
          .filter(Boolean),
      ),
    );
    const locationPrimary = uniqueZoneLabels.join(', ');

    return {
      serviceArea: uniqueAreaNames.join(', '),
      locationPrimary,
      locationSecondary: uniqueAreaNames.length === 1 ? uniqueAreaNames[0] : null,
      locationTertiary: null,
      servicePrimaries: uniqueZoneLabels,
      serviceSecondaries: [],
    };
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

  async countMatching(params: { trades: string[]; location?: string; isEmergency?: boolean }) {
    const { trades, location, isEmergency } = params;
    const prisma = this.prisma as any;
    try {
      // Build a simple trade + status query — same base as findAll
      const where: any = {
        status: 'approved',
        professionType: { in: ['contractor', 'company'] },
      };
      if (isEmergency) where.emergencyCalloutAvailable = true;
      if (trades.length > 0) {
        where.OR = [
          { primaryTrade: { in: trades, mode: 'insensitive' } },
          { tradesOffered: { hasSome: trades } },
        ];
      }

      // Fetch with regionCoverage so we can filter in JS — same as client-side
      const pros = await prisma.professional.findMany({
        where,
        select: {
          id: true,
          locationPrimary: true,
          locationSecondary: true,
          locationTertiary: true,
          servicePrimaries: true,
          serviceSecondaries: true,
          regionCoverage: {
            select: {
              zone: { select: { label: true, code: true } },
              area: { select: { name: true, code: true } },
            },
          },
        },
      });

      console.log('[countMatching] trade-matched:', pros.length, 'trades:', trades);

      if (!location) {
        console.log('[countMatching] no location filter, returning:', pros.length);
        return pros.length;
      }

      // Filter by location using same token-extraction logic as client-side getProfessionalCoverageTokens
      const parts = location.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      console.log('[countMatching] location parts:', parts);

      const matching = pros.filter((pro: any) => {
        const tokens = new Set<string>();

        // From regionCoverage
        for (const cov of pro.regionCoverage || []) {
          const zoneLabel = cov?.zone?.label?.trim().toLowerCase();
          const zoneCode = cov?.zone?.code?.trim().toLowerCase();
          const areaName = cov?.area?.name?.trim().toLowerCase();
          const areaCode = cov?.area?.code?.trim().toLowerCase();
          if (zoneLabel) tokens.add(zoneLabel);
          if (zoneCode) tokens.add(zoneCode);
          if (areaName) tokens.add(areaName);
          if (areaCode) tokens.add(areaCode);
        }

        // From string columns
        for (const field of [pro.locationPrimary, pro.locationSecondary, pro.locationTertiary]) {
          if (typeof field === 'string') {
            field.split(',').forEach(s => tokens.add(s.trim().toLowerCase()));
          }
        }

        // From array columns
        for (const arr of [pro.servicePrimaries, pro.serviceSecondaries]) {
          if (Array.isArray(arr)) {
            arr.forEach((s: string) => tokens.add(s.trim().toLowerCase()));
          }
        }

        // Match: any token contains any part, or any part contains any token
        return parts.some(part =>
          Array.from(tokens).some(token =>
            token.includes(part) || part.includes(token)
          )
        );
      });

      console.log('[countMatching] after location filter:', matching.length);
      return matching.length;
    } catch (err) {
      console.error('[countMatching] error:', err?.message || err);
      return 0;
    }
  }

  async findAll() {
    try {
      console.log('findAll: Attempting to fetch professionals');

      const result = await (this.prisma as any).professional.findMany({
        include: {
          referenceProjects: { orderBy: { createdAt: 'desc' } },
          regionCoverage: {
            include: {
              zone: {
                select: {
                  id: true,
                  code: true,
                  label: true,
                  labelZh: true,
                  mapSvgId: true,
                },
              },
              area: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
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
        regionCoverage: {
          include: {
            zone: {
              select: {
                id: true,
                code: true,
                label: true,
                labelZh: true,
                mapSvgId: true,
              },
            },
            area: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
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

  async listProfessionalCertifications(professionalId: string) {
    const rows = await (this.prisma as any).professionalCertification.findMany({
      where: { professionalId },
      include: {
        certificationType: true,
        trade: {
          select: {
            id: true,
            title: true,
            professionType: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    return rows.map((row: any) => this.buildProfessionalCertificationPayload(row));
  }

  async reviewProfessionalCertification(
    professionalId: string,
    certificationId: string,
    adminId: string,
    body: {
      verificationStatus?: 'VERIFIED' | 'REJECTED' | 'EXPIRED';
      verificationNotes?: string | null;
    },
  ) {
    const verificationStatus = body.verificationStatus;
    if (!verificationStatus || !['VERIFIED', 'REJECTED', 'EXPIRED'].includes(verificationStatus)) {
      throw new BadRequestException('verificationStatus must be VERIFIED, REJECTED, or EXPIRED');
    }

    const existing = await (this.prisma as any).professionalCertification.findFirst({
      where: {
        id: certificationId,
        professionalId,
      },
    });

    if (!existing) {
      throw new BadRequestException('Certification record not found');
    }

    const verificationNotes = this.normalizeCertificationReviewNotes(body.verificationNotes);
    const isVerified = verificationStatus === 'VERIFIED';

    const updated = await (this.prisma as any).professionalCertification.update({
      where: { id: existing.id },
      data: {
        verificationStatus,
        verificationNotes: verificationNotes === undefined ? existing.verificationNotes : verificationNotes,
        verifiedAt: isVerified ? new Date() : null,
        verifiedByAdminId: isVerified ? adminId : null,
      },
      include: {
        certificationType: true,
        trade: {
          select: {
            id: true,
            title: true,
            professionType: true,
          },
        },
      },
    });

    return this.buildProfessionalCertificationPayload(updated);
  }

  async runBrcCheck(
    professionalId: string,
    certificationId: string,
    mode: 'name' | 'brn',
    manualValue?: string,
  ) {
    if (!['name', 'brn'].includes(mode)) {
      throw new BadRequestException('mode must be name or brn');
    }

    const certification = await (this.prisma as any).professionalCertification.findFirst({
      where: {
        id: certificationId,
        professionalId,
      },
      include: {
        certificationType: true,
        professional: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
    });

    if (!certification) {
      throw new BadRequestException('Certification record not found');
    }

    if (certification.certificationType?.code !== 'BUSINESS_REGISTRATION_CERTIFICATE') {
      throw new BadRequestException('BRC check is only available for BUSINESS_REGISTRATION_CERTIFICATE records');
    }

    const manualOverride = String(manualValue || '').trim();
    const rawValue =
      manualOverride ||
      (mode === 'name'
        ? String(certification.professional?.businessName || '').trim()
        : String(certification.registrationNumber || '').trim());

    if (!rawValue) {
      throw new BadRequestException(
        mode === 'name'
          ? 'Business name is required for company-name check'
          : 'Registration number is required for BRN check',
      );
    }

    // CR BRN search is strict; normalize common stored formats like "12-345678" or "1234 5678".
    const value = mode === 'brn' ? rawValue.replace(/\D/g, '') : rawValue;

    if (mode === 'brn' && !value) {
      throw new BadRequestException('Registration number must contain at least one digit for BRN check');
    }

    const endpoint = new URL('https://data.cr.gov.hk/cr/api/api/v1/api_builder/json/local/search');
    endpoint.searchParams.append('query[0][key1]', mode === 'name' ? 'Comp_name' : 'Brn');
    endpoint.searchParams.append('query[0][key2]', mode === 'name' ? 'begins_with' : 'equal');
    endpoint.searchParams.append('query[0][key3]', value);

    const response = await fetch(endpoint.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const payload = contentType.includes('json') ? await response.json() : await response.text();

    if (!response.ok) {
      const payloadMessage =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message?: unknown }).message ?? '')
          : typeof payload === 'string'
            ? payload
            : '';

      // CR API returns 400 for "No result found."; this should be a valid manual-check outcome.
      if (response.status === 400 && /no result found/i.test(payloadMessage)) {
        return {
          mode,
          requestedValue: value,
          requestUrl: endpoint.toString(),
          data: [],
          noResult: true,
          message: 'No result found',
        };
      }

      throw new BadRequestException(
        `CR API request failed (${response.status}). ${payloadMessage.slice(0, 240)}`.trim(),
      );
    }

    return {
      mode,
      requestedValue: value,
      requestUrl: endpoint.toString(),
      data: payload,
    };
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

    const normalizedCoverageAreaCodes = Array.isArray(updateProfessionalDto.coverage_area_codes)
      ? Array.from(
          new Set(
            updateProfessionalDto.coverage_area_codes
              .map((value) => String(value || '').trim().toUpperCase())
              .filter(Boolean),
          ),
        )
      : undefined;

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

    if (normalizedCoverageAreaCodes !== undefined) {
      const areas = normalizedCoverageAreaCodes.length
        ? await (this.prisma as any).regionArea.findMany({
            where: { code: { in: normalizedCoverageAreaCodes } },
            select: {
              id: true,
              code: true,
              zoneId: true,
              name: true,
              zone: {
                select: {
                  label: true,
                },
              },
            },
          })
        : [];

      const foundCodes = new Set((areas as Array<{ code: string }>).map((area) => area.code));
      const invalidCodes = normalizedCoverageAreaCodes.filter((code) => !foundCodes.has(code));
      if (invalidCodes.length > 0) {
        throw new BadRequestException(`Invalid coverage area codes: ${invalidCodes.join(', ')}`);
      }

      const mirroredLegacy = this.buildLegacyLocationMirrorFromAreas(
        areas as Array<{ name: string; zone?: { label?: string | null } | null }>,
      );
      data.serviceArea = mirroredLegacy.serviceArea;
      data.locationPrimary = mirroredLegacy.locationPrimary;
      data.locationSecondary = mirroredLegacy.locationSecondary;
      data.locationTertiary = mirroredLegacy.locationTertiary;
      data.servicePrimaries = mirroredLegacy.servicePrimaries;
      data.serviceSecondaries = mirroredLegacy.serviceSecondaries;

      return this.prisma.$transaction(async (tx) => {
        const updated = await (tx as any).professional.update({
          where: { id },
          data,
        });

        await (tx as any).professionalRegionCoverage.deleteMany({
          where: { professionalId: id },
        });

        if (areas.length > 0) {
          await (tx as any).professionalRegionCoverage.createMany({
            data: (areas as Array<{ id: string; zoneId: string }>).map((area) => ({
              professionalId: id,
              zoneId: area.zoneId,
              areaId: area.id,
            })),
          });
        }

        return updated;
      });
    }

    if (updateProfessionalDto.emergencyCalloutAvailable !== undefined) {
      data.emergencyCalloutAvailable = updateProfessionalDto.emergencyCalloutAvailable;
    }

    if (updateProfessionalDto.languages !== undefined) {
      data.languages = updateProfessionalDto.languages;
    }

    if (updateProfessionalDto.years_in_business !== undefined) {
      data.yearsInBusiness = updateProfessionalDto.years_in_business;
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

  async updatePassword(id: string, password: string) {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(password, 10);

    // Find the professional to get their identityId
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id },
      select: { identityId: true },
    });

    if (!professional?.identityId) {
      throw new Error('Professional has no linked identity record');
    }

    // Update password on the Identity table
    return (this.prisma as any).identity.update({
      where: { id: professional.identityId },
      data: { passwordHash: hash },
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

  private buildDualReadLocationFilters(location?: string | null) {
    if (!location?.trim()) return null;
    const keyword = location.trim();

    return [
      {
        regionCoverage: {
          some: {
            OR: [
              { area: { name: { contains: keyword, mode: 'insensitive' } } },
              { zone: { label: { contains: keyword, mode: 'insensitive' } } },
              { zone: { code: { contains: keyword, mode: 'insensitive' } } },
            ],
          },
        },
      },
      { locationPrimary: { contains: keyword, mode: 'insensitive' } },
      { locationSecondary: { contains: keyword, mode: 'insensitive' } },
      { locationTertiary: { contains: keyword, mode: 'insensitive' } },
      { serviceArea: { contains: keyword, mode: 'insensitive' } },
    ];
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

      const locationFilters = this.buildDualReadLocationFilters(location);

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
