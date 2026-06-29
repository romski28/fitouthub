import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { PlatformFeeService } from '../common/platform-fee.service';
import { UpdatesService } from '../updates/updates.service';
import { ActivityLogService } from '../activity-log.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { Decimal } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcrypt';
import { buildPublicAssetUrl } from '../storage/media-assets.util';
import { extractObjectKeyFromValue } from '../storage/media-assets.util';
import {
  getQuoteBreakdownDisplayLines,
  getStoredQuoteBreakdownClientItems,
  normalizeQuoteBreakdownInput,
  withClientQuoteBreakdown,
} from '../projects/quote-breakdown';

@Controller('professional')
export class ProfessionalController {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private platformFeeService: PlatformFeeService,
    private updatesService: UpdatesService,
    private activityLogService: ActivityLogService,
    private pushService: PushNotificationService,
  ) {}

  private readonly visibleProfessionalStatuses = [
    'pending',
    'accepted',
    'quoted',
    'counter_requested',
    'awarded',
    'declined',
    'rejected',
  ];

  private readonly activeProfessionalStatuses = [
    'pending',
    'accepted',
    'quoted',
    'counter_requested',
    'awarded',
  ];

  private canAccessFullProject(status?: string | null) {
    return this.activeProfessionalStatuses.includes(String(status || '').toLowerCase());
  }

  private async listProjectExtras(projectId: string) {
    try {
      return await this.prisma.$queryRaw<Array<{
        id: string;
        projectId: string;
        extraType: string;
        status: string;
        source: string | null;
        title: string | null;
        summary: string | null;
        notes: string | null;
        price: number | string | null;
        currency: string;
        metadata: Record<string, unknown> | null;
        requestedAt: Date;
        approvedAt: Date | null;
        scheduledAt: Date | null;
        startedAt: Date | null;
        completedAt: Date | null;
        cancelledAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>>`
        SELECT
          id,
          "projectId" as "projectId",
          "extraType" as "extraType",
          status,
          source,
          title,
          summary,
          notes,
          price,
          currency,
          metadata,
          "requestedAt" as "requestedAt",
          "approvedAt" as "approvedAt",
          "scheduledAt" as "scheduledAt",
          "startedAt" as "startedAt",
          "completedAt" as "completedAt",
          "cancelledAt" as "cancelledAt",
          "createdAt" as "createdAt",
          "updatedAt" as "updatedAt"
        FROM mimo_project_extras
        WHERE "projectId" = ${projectId}
        ORDER BY "requestedAt" DESC
      `;
    } catch {
      return [];
    }
  }

  private getProfessionalProfileInclude() {
    return {
      media: {
        orderBy: [
          { isProfileFeature: 'desc' },
          { profileFeatureSortOrder: 'asc' },
          { projectSortOrder: 'asc' },
          { createdAt: 'desc' },
        ],
      },
      referenceProjects: {
        orderBy: { createdAt: 'desc' },
        include: {
          media: {
            orderBy: [
              { projectSortOrder: 'asc' },
              { createdAt: 'asc' },
            ],
          },
        },
      },
      notificationPreferences: true,
      certifications: {
        select: {
          id: true,
        },
      },
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
    };
  }

  private mapProfessionalMediaItem(media: any) {
    if (!media) return media;
    return {
      ...media,
      imageUrl: buildPublicAssetUrl(media.storageKey),
    };
  }

  private resolveProfileMediaUrls(professional: any) {
    if (!professional) return professional;

    const mediaRows = Array.isArray(professional.media) ? [...professional.media] : [];
    const featuredMedia = mediaRows
      .filter((media) => media.isProfileFeature)
      .sort((left, right) => {
        const leftOrder = left.profileFeatureSortOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.profileFeatureSortOrder ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
      });

    return {
      ...professional,
      media: mediaRows.map((media) => this.mapProfessionalMediaItem(media)),
      profileImages:
        featuredMedia.length > 0
          ? featuredMedia.map((media) => buildPublicAssetUrl(media.storageKey))
          : (professional.profileImages || []).map((v: string) => buildPublicAssetUrl(v)),
      referenceProjects: (professional.referenceProjects || []).map((rp: any) => ({
        ...this.resolveReferenceProjectMediaUrls(rp),
      })),
    };
  }

  private resolveReferenceProjectMediaUrls(referenceProject: any) {
    if (!referenceProject) return referenceProject;

    const mediaRows = Array.isArray(referenceProject.media)
      ? [...referenceProject.media].sort((left, right) => {
          const leftOrder = left.projectSortOrder ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = right.projectSortOrder ?? Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;
          return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
        })
      : [];

    return {
      ...referenceProject,
      media: mediaRows.map((media) => this.mapProfessionalMediaItem(media)),
      imageUrls:
        mediaRows.length > 0
          ? mediaRows.map((media) => buildPublicAssetUrl(media.storageKey))
          : (referenceProject.imageUrls || []).map((v: string) => buildPublicAssetUrl(v)),
    };
  }

  private normalizeStorageKeys(values: Array<string | null | undefined>) {
    return this.normalizeUniqueStrings(
      values.map((value) => extractObjectKeyFromValue(value)),
    );
  }

  private async syncLegacyProfileImagesMirror(tx: any, professionalId: string) {
    const featuredMedia = await (tx as any).professionalMedia.findMany({
      where: { professionalId, isProfileFeature: true },
      orderBy: [
        { profileFeatureSortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
      select: { storageKey: true },
    });

    await (tx as any).professional.update({
      where: { id: professionalId },
      data: {
        profileImages: featuredMedia.map((media: { storageKey: string }) => media.storageKey),
      },
    });
  }

  private async syncLegacyReferenceProjectImagesMirror(tx: any, referenceProjectId: string) {
    const projectMedia = await (tx as any).professionalMedia.findMany({
      where: { referenceProjectId },
      orderBy: [
        { projectSortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
      select: { storageKey: true },
    });

    await (tx as any).professionalReferenceProject.update({
      where: { id: referenceProjectId },
      data: {
        imageUrls: projectMedia.map((media: { storageKey: string }) => media.storageKey),
      },
    });
  }

  private async syncProfileFeatureMedia(tx: any, professionalId: string, storageKeys: string[]) {
    if (storageKeys.length > 5) {
      throw new BadRequestException('You can select up to 5 profile feature images');
    }

    const relevantMedia: any[] = await (tx as any).professionalMedia.findMany({
      where: {
        professionalId,
        OR: [
          { isProfileFeature: true },
          { storageKey: { in: storageKeys } },
        ],
      },
      select: {
        id: true,
        storageKey: true,
        kind: true,
        isProfileFeature: true,
      },
    });

    const mediaByKey = new Map(relevantMedia.map((media: any) => [media.storageKey, media]));
    const selectedSet = new Set(storageKeys);

    for (const media of relevantMedia) {
      if (media.isProfileFeature && !selectedSet.has(media.storageKey)) {
        await (tx as any).professionalMedia.update({
          where: { id: media.id },
          data: {
            isProfileFeature: false,
            profileFeatureSortOrder: null,
          },
        });
      }
    }

    for (const [index, storageKey] of storageKeys.entries()) {
      const existing: any = mediaByKey.get(storageKey);
      if (existing) {
        await (tx as any).professionalMedia.update({
          where: { id: existing.id },
          data: {
            isProfileFeature: true,
            profileFeatureSortOrder: index + 1,
          },
        });
        continue;
      }

      await (tx as any).professionalMedia.create({
        data: {
          professionalId,
          storageKey,
          kind: 'STANDALONE',
          isProfileFeature: true,
          profileFeatureSortOrder: index + 1,
        },
      });
    }

    await this.syncLegacyProfileImagesMirror(tx, professionalId);
  }

  private async syncReferenceProjectMedia(
    tx: any,
    professionalId: string,
    referenceProjectId: string,
    storageKeys: string[],
  ) {
    const relevantMedia: any[] = await (tx as any).professionalMedia.findMany({
      where: {
        professionalId,
        OR: [
          { referenceProjectId },
          { storageKey: { in: storageKeys } },
        ],
      },
      select: {
        id: true,
        storageKey: true,
        isProfileFeature: true,
        referenceProjectId: true,
      },
    });

    const mediaByKey = new Map(relevantMedia.map((media: any) => [media.storageKey, media]));
    const selectedSet = new Set(storageKeys);

    for (const media of relevantMedia) {
      if (media.referenceProjectId !== referenceProjectId) continue;
      if (selectedSet.has(media.storageKey)) continue;

      if (media.isProfileFeature) {
        await (tx as any).professionalMedia.update({
          where: { id: media.id },
          data: {
            kind: 'STANDALONE',
            referenceProjectId: null,
            projectSortOrder: null,
          },
        });
      } else {
        await (tx as any).professionalMedia.delete({
          where: { id: media.id },
        });
      }
    }

    for (const [index, storageKey] of storageKeys.entries()) {
      const existing: any = mediaByKey.get(storageKey);
      if (existing) {
        await (tx as any).professionalMedia.update({
          where: { id: existing.id },
          data: {
            kind: 'REFERENCE_PROJECT',
            referenceProjectId,
            projectSortOrder: index + 1,
          },
        });
        continue;
      }

      await (tx as any).professionalMedia.create({
        data: {
          professionalId,
          storageKey,
          kind: 'REFERENCE_PROJECT',
          referenceProjectId,
          projectSortOrder: index + 1,
        },
      });
    }

    await this.syncLegacyReferenceProjectImagesMirror(tx, referenceProjectId);
  }

  private async detachOrDeleteReferenceProjectMedia(tx: any, referenceProjectId: string) {
    const mediaRows = await (tx as any).professionalMedia.findMany({
      where: { referenceProjectId },
      select: { id: true, isProfileFeature: true },
    });

    for (const media of mediaRows) {
      if (media.isProfileFeature) {
        await (tx as any).professionalMedia.update({
          where: { id: media.id },
          data: {
            kind: 'STANDALONE',
            referenceProjectId: null,
            projectSortOrder: null,
          },
        });
      } else {
        await (tx as any).professionalMedia.delete({
          where: { id: media.id },
        });
      }
    }
  }

  private async loadResolvedProfessionalProfile(professionalId: string) {
    const professional = await (this.prisma as any).professional.findUnique({
      where: { id: professionalId },
      include: this.getProfessionalProfileInclude(),
    });
    if (!professional) throw new BadRequestException('Professional not found');
    return this.resolveProfileMediaUrls(professional);
  }

  private mapTradeCertificationRequirement(requirement: any) {
    if (!requirement) return requirement;
    return {
      ...requirement,
      certificationType: requirement.certificationType,
      trade: requirement.trade,
    };
  }

  private mapProfessionalCertification(certification: any) {
    if (!certification) return certification;
    return {
      ...certification,
      documentUrl: certification.documentStorageKey
        ? buildPublicAssetUrl(certification.documentStorageKey)
        : null,
    };
  }

  private normalizeOptionalDateInput(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = this.normalizeTextInput(value);
    if (!normalized) return null;

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date value: ${value}`);
    }

    return parsed;
  }

  private normalizeQuoteSchedule(input: {
    quoteEstimatedStartAt?: string | Date | null;
    quoteEstimatedDurationMinutes?: number | string | null;
    quoteEstimatedDurationUnit?: string | null;
  }) {
    const rawStart = input.quoteEstimatedStartAt;
    const rawDuration = input.quoteEstimatedDurationMinutes;
    const rawUnit = input.quoteEstimatedDurationUnit || 'hours';
    const hasStart =
      rawStart !== undefined && rawStart !== null && String(rawStart).trim().length > 0;
    const hasDuration =
      rawDuration !== undefined && rawDuration !== null && String(rawDuration).trim().length > 0;

    if (!hasStart || !hasDuration) {
      throw new BadRequestException(
        'Start date and duration are required when submitting a quote',
      );
    }

    const quoteEstimatedStartAt =
      rawStart instanceof Date ? rawStart : new Date(String(rawStart));
    if (Number.isNaN(quoteEstimatedStartAt.getTime())) {
      throw new BadRequestException('Invalid estimated start date');
    }

    const durationValue = Number(rawDuration);
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      throw new BadRequestException(
        'Estimated duration must be greater than zero',
      );
    }

    // Convert duration to minutes based on unit
    let durationMinutes: number;
    if (rawUnit === 'days') {
      if (durationValue > 365) {
        throw new BadRequestException('Duration in days cannot exceed 365 days');
      }
      durationMinutes = Math.round(durationValue * 24 * 60);
    } else {
      if (durationValue > 60 * 24 * 365) {
        throw new BadRequestException('Estimated duration is too large');
      }
      durationMinutes = Math.round(durationValue * 60);
    }

    if (durationMinutes < 30) {
      throw new BadRequestException(
        'Estimated duration must be at least 30 minutes',
      );
    }

    return {
      quoteEstimatedStartAt,
      quoteEstimatedDurationMinutes: durationMinutes,
      quoteEstimatedDurationUnit: ['hours', 'days'].includes(rawUnit) ? rawUnit : 'hours',
    };
  }

  private formatDurationMinutes(durationMinutes: number) {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return 'unspecified duration';
    }

    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }

    const hours = durationMinutes / 60;
    if (Number.isInteger(hours)) {
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${hours.toFixed(1).replace(/\.0$/, '')} hours`;
  }

  private normalizeUniqueStrings(values: Array<string | null | undefined>) {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const value of values) {
      const cleaned = (value || '').trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(cleaned);
    }

    return normalized;
  }

  private normalizeCsvInput(value?: string) {
    if (value === undefined) return undefined;
    const values = value.split(',').map((part) => part.trim());
    return this.normalizeUniqueStrings(values).join(', ');
  }

  private normalizeTextInput(value?: string) {
    if (value === undefined) return undefined;
    return value.trim();
  }

  private buildLegacyLocationMirrorFromAreas(areas: Array<{ name: string; zone?: { label?: string | null } | null }>) {
    if (!areas.length) {
      return {
        serviceArea: '',
        locationPrimary: '',
        locationSecondary: '',
        locationTertiary: '',
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

    const normalizedZoneSet = new Set(uniqueZoneLabels.map((zone) => zone.toLowerCase()));
    const primary =
      normalizedZoneSet.has('new territories east') && normalizedZoneSet.has('new territories west')
        ? uniqueZoneLabels.filter((zone) => zone.toLowerCase() !== 'new territories east' && zone.toLowerCase() !== 'new territories west').length === 0
          ? 'New Territories'
          : uniqueZoneLabels.join(', ')
        : uniqueZoneLabels.join(', ');

    return {
      serviceArea: uniqueAreaNames.join(', '),
      locationPrimary: primary,
      locationSecondary: uniqueAreaNames.length === 1 ? uniqueAreaNames[0] : '',
      locationTertiary: '',
    };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProfile(@Request() req: any) {
    const professionalId = req.user.id || req.user.sub;
    return this.loadResolvedProfessionalProfile(professionalId);
  }

  @Patch('me/notification-preferences')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateMyNotificationPreferences(
    @Request() req: any,
    @Body()
    body: {
      allowPartnerOffers?: boolean;
      allowPlatformUpdates?: boolean;
      preferredLanguage?: string;
      preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
    },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const preferredContactMethod = body.preferredContactMethod?.toUpperCase() as
      | 'EMAIL'
      | 'WHATSAPP'
      | 'SMS'
      | 'WECHAT'
      | undefined;

    if (
      preferredContactMethod &&
      !['EMAIL', 'WHATSAPP', 'SMS', 'WECHAT'].includes(preferredContactMethod)
    ) {
      throw new BadRequestException('Invalid preferred contact method');
    }

    const existing = await (this.prisma as any).notificationPreference.findUnique({
      where: { professionalId },
    });

    if (!existing) {
      return (this.prisma as any).notificationPreference.create({
        data: {
          professionalId,
          primaryChannel: preferredContactMethod ?? 'EMAIL',
          fallbackChannel: 'WHATSAPP',
          enableEmail: true,
          enableWhatsApp: true,
          enableSMS: true,
          enableWeChat: false,
          allowPartnerOffers: body.allowPartnerOffers ?? false,
          allowPlatformUpdates: body.allowPlatformUpdates ?? true,
          preferredLanguage: body.preferredLanguage ?? 'en',
        },
      });
    }

    return (this.prisma as any).notificationPreference.update({
      where: { professionalId },
      data: {
        allowPartnerOffers: body.allowPartnerOffers,
        allowPlatformUpdates: body.allowPlatformUpdates,
        preferredLanguage: body.preferredLanguage,
        ...(preferredContactMethod !== undefined
          ? { primaryChannel: preferredContactMethod }
          : {}),
      },
    });
  }

  @Put('me')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateProfile(
    @Request() req: any,
    @Body()
    body: {
      email?: string;
      fullName?: string;
      businessName?: string;
      phone?: string;
      professionType?: string;
      serviceArea?: string;
      locationPrimary?: string;
      locationSecondary?: string;
      locationTertiary?: string;
      coverageAreaCodes?: string[];
      suppliesOffered?: string[];
      tradesOffered?: string[];
      primaryTrade?: string;
      profileImages?: string[];
      emergencyCalloutAvailable?: boolean;
    },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const normalizedProfileImages = Array.isArray(body.profileImages)
      ? this.normalizeStorageKeys(body.profileImages)
      : undefined;

    const normalizedServiceArea = this.normalizeCsvInput(body.serviceArea);
    const normalizedTradesOffered = Array.isArray(body.tradesOffered)
      ? this.normalizeUniqueStrings(body.tradesOffered)
      : undefined;
    const normalizedSuppliesOffered = Array.isArray(body.suppliesOffered)
      ? this.normalizeUniqueStrings(body.suppliesOffered)
      : undefined;
    const normalizedCoverageAreaCodes = Array.isArray(body.coverageAreaCodes)
      ? Array.from(
          new Set(
            body.coverageAreaCodes
              .map((value) => this.normalizeTextInput(value)?.toUpperCase())
              .filter((value): value is string => Boolean(value)),
          ),
        )
      : undefined;

    const data: any = {
      email: this.normalizeTextInput(body.email),
      fullName: this.normalizeTextInput(body.fullName),
      businessName: this.normalizeTextInput(body.businessName),
      phone: this.normalizeTextInput(body.phone),
      professionType: this.normalizeTextInput(body.professionType),
      serviceArea: normalizedServiceArea,
      locationPrimary: this.normalizeTextInput(body.locationPrimary),
      locationSecondary: this.normalizeTextInput(body.locationSecondary),
      locationTertiary: this.normalizeTextInput(body.locationTertiary),
      suppliesOffered: normalizedSuppliesOffered,
      tradesOffered: normalizedTradesOffered,
      primaryTrade: this.normalizeTextInput(body.primaryTrade),
      emergencyCalloutAvailable: body.emergencyCalloutAvailable,
    };
    // Remove undefined to avoid overwriting
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    let cachedAreas: Array<{ id: string; code: string; zoneId: string; name: string; zone?: { label?: string | null } | null }> = [];

    if (normalizedCoverageAreaCodes !== undefined) {
      cachedAreas = normalizedCoverageAreaCodes.length
        ? await (this.prisma as any).regionArea.findMany({
            where: { code: { in: normalizedCoverageAreaCodes } },
            select: { id: true, code: true, zoneId: true, name: true, zone: { select: { label: true } } },
          })
        : [];

      const foundCodes = new Set(cachedAreas.map((area) => area.code));
      const invalidCodes = normalizedCoverageAreaCodes.filter((code) => !foundCodes.has(code));
      if (invalidCodes.length > 0) {
        throw new BadRequestException(`Invalid coverage area codes: ${invalidCodes.join(', ')}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (normalizedCoverageAreaCodes !== undefined) {
        const mirroredLegacy = this.buildLegacyLocationMirrorFromAreas(cachedAreas);
        await (tx as any).professional.update({
          where: { id: professionalId },
          data: {
            ...data,
            serviceArea: mirroredLegacy.serviceArea,
            locationPrimary: mirroredLegacy.locationPrimary,
            locationSecondary: mirroredLegacy.locationSecondary,
            locationTertiary: mirroredLegacy.locationTertiary,
          },
        });

        await (tx as any).professionalRegionCoverage.deleteMany({
          where: { professionalId },
        });

        if (cachedAreas.length > 0) {
          await (tx as any).professionalRegionCoverage.createMany({
            data: cachedAreas.map((area) => ({
              professionalId,
              zoneId: area.zoneId,
              areaId: area.id,
            })),
          });
        }
      } else {
        await (tx as any).professional.update({
          where: { id: professionalId },
          data,
        });
      }

      if (normalizedProfileImages !== undefined) {
        await this.syncProfileFeatureMedia(tx, professionalId, normalizedProfileImages);
      }
    });

    return this.loadResolvedProfessionalProfile(professionalId);
  }

  @Get('certification-types')
  @UseGuards(AuthGuard('jwt-professional'))
  async listCertificationTypes() {
    const rows = await (this.prisma as any).certificationType.findMany({
      where: { isActive: true },
    });

    return rows.sort((left: any, right: any) =>
      String(left.name || '').localeCompare(String(right.name || '')),
    );
  }

  @Get('certification-requirements')
  @UseGuards(AuthGuard('jwt-professional'))
  async listCertificationRequirements() {
    const rows = await (this.prisma as any).tradeCertificationRequirement.findMany({
      include: {
        trade: {
          select: {
            id: true,
            title: true,
            professionType: true,
          },
        },
        certificationType: true,
      },
      where: {
        certificationType: {
          isActive: true,
        },
      },
    });

    return rows
      .map((item: any) => this.mapTradeCertificationRequirement(item))
      .sort((left: any, right: any) => {
        const tradeCompare = String(left.trade?.title || '').localeCompare(String(right.trade?.title || ''));
        if (tradeCompare !== 0) return tradeCompare;
        return String(left.certificationType?.name || '').localeCompare(String(right.certificationType?.name || ''));
      });
  }

  @Get('certifications')
  @UseGuards(AuthGuard('jwt-professional'))
  async listCertifications(@Request() req: any) {
    const professionalId = req.user.id || req.user.sub;
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

    return rows.map((item: any) => this.mapProfessionalCertification(item));
  }

  @Post('certifications')
  @UseGuards(AuthGuard('jwt-professional'))
  async createCertification(
    @Request() req: any,
    @Body()
    body: {
      certificationTypeId?: string;
      tradeId?: string | null;
      holderType?: 'INDIVIDUAL' | 'BUSINESS';
      registrationNumber?: string;
      issuedAt?: string | null;
      expiresAt?: string | null;
      documentStorageKey?: string | null;
    },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const certificationTypeId = this.normalizeTextInput(body.certificationTypeId);
    const registrationNumber = this.normalizeTextInput(body.registrationNumber);
    const documentStorageKey = this.normalizeStorageKeys([body.documentStorageKey])[0] || null;
    const issuedAt = this.normalizeOptionalDateInput(body.issuedAt);
    const expiresAt = this.normalizeOptionalDateInput(body.expiresAt);
    const holderType = body.holderType === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL';
    const tradeId = this.normalizeTextInput(body.tradeId ?? undefined) || null;

    if (!certificationTypeId) {
      throw new BadRequestException('Certification type is required');
    }
    if (!registrationNumber) {
      throw new BadRequestException('Registration number is required');
    }
    if (!documentStorageKey) {
      throw new BadRequestException('Certification image is required');
    }
    if (issuedAt && expiresAt && issuedAt.getTime() > expiresAt.getTime()) {
      throw new BadRequestException('Issue date cannot be later than expiry date');
    }

    const certificationType = await (this.prisma as any).certificationType.findFirst({
      where: { id: certificationTypeId, isActive: true },
    });
    if (!certificationType) {
      throw new BadRequestException('Certification type not found');
    }

    if (tradeId) {
      const trade = await (this.prisma as any).tradesman.findUnique({ where: { id: tradeId } });
      if (!trade) {
        throw new BadRequestException('Trade not found');
      }
    }

    const created = await (this.prisma as any).professionalCertification.create({
      data: {
        professionalId,
        certificationTypeId,
        tradeId,
        holderType,
        registrationNumber,
        issuedAt: issuedAt ?? null,
        expiresAt: expiresAt ?? null,
        documentStorageKey,
        verificationStatus: 'SUBMITTED',
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

    return this.mapProfessionalCertification(created);
  }

  @Put('certifications/:id')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateCertification(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      certificationTypeId?: string;
      tradeId?: string | null;
      holderType?: 'INDIVIDUAL' | 'BUSINESS';
      registrationNumber?: string;
      issuedAt?: string | null;
      expiresAt?: string | null;
      documentStorageKey?: string | null;
    },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const existing = await (this.prisma as any).professionalCertification.findFirst({
      where: { id, professionalId },
    });

    if (!existing) {
      throw new BadRequestException('Certification record not found');
    }

    const certificationTypeId = this.normalizeTextInput(body.certificationTypeId) || existing.certificationTypeId;
    const registrationNumber = this.normalizeTextInput(body.registrationNumber) || existing.registrationNumber;
    const normalizedDocumentKeys = body.documentStorageKey === undefined
      ? undefined
      : this.normalizeStorageKeys([body.documentStorageKey]);
    const documentStorageKey = normalizedDocumentKeys === undefined
      ? existing.documentStorageKey
      : normalizedDocumentKeys[0] || null;
    const issuedAt = this.normalizeOptionalDateInput(body.issuedAt);
    const expiresAt = this.normalizeOptionalDateInput(body.expiresAt);
    const holderType = body.holderType === undefined ? existing.holderType : body.holderType === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL';
    const tradeId = body.tradeId === undefined ? existing.tradeId : this.normalizeTextInput(body.tradeId ?? undefined) || null;

    if (!certificationTypeId) {
      throw new BadRequestException('Certification type is required');
    }
    if (!registrationNumber) {
      throw new BadRequestException('Registration number is required');
    }
    if (!documentStorageKey) {
      throw new BadRequestException('Certification image is required');
    }

    const certificationType = await (this.prisma as any).certificationType.findFirst({
      where: { id: certificationTypeId, isActive: true },
    });
    if (!certificationType) {
      throw new BadRequestException('Certification type not found');
    }
    if (tradeId) {
      const trade = await (this.prisma as any).tradesman.findUnique({ where: { id: tradeId } });
      if (!trade) {
        throw new BadRequestException('Trade not found');
      }
    }

    const nextIssuedAt = issuedAt === undefined ? existing.issuedAt : issuedAt;
    const nextExpiresAt = expiresAt === undefined ? existing.expiresAt : expiresAt;
    if (nextIssuedAt && nextExpiresAt && nextIssuedAt.getTime() > nextExpiresAt.getTime()) {
      throw new BadRequestException('Issue date cannot be later than expiry date');
    }

    const updated = await (this.prisma as any).professionalCertification.update({
      where: { id: existing.id },
      data: {
        certificationTypeId,
        tradeId,
        holderType,
        registrationNumber,
        issuedAt: nextIssuedAt ?? null,
        expiresAt: nextExpiresAt ?? null,
        documentStorageKey,
        verificationStatus: 'SUBMITTED',
        verifiedAt: null,
        verifiedByAdminId: null,
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

    return this.mapProfessionalCertification(updated);
  }

  @Delete('certifications/:id')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCertification(@Request() req: any, @Param('id') id: string) {
    const professionalId = req.user.id || req.user.sub;
    const existing = await (this.prisma as any).professionalCertification.findFirst({
      where: { id, professionalId },
      select: { id: true },
    });

    if (!existing) {
      throw new BadRequestException('Certification record not found');
    }

    await (this.prisma as any).professionalCertification.delete({
      where: { id: existing.id },
    });
  }

  @Put('me/password')
  @UseGuards(AuthGuard('jwt-professional'))
  async updatePassword(@Request() req: any, @Body() body: { password?: string }) {
    const professionalId = req.user.id || req.user.sub;
    if (!body?.password || body.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const hashedPassword = await bcrypt.hash(body.password, 10);
    const updated = await (this.prisma as any).professional.update({
      where: { id: professionalId },
      data: { passwordHash: hashedPassword },
      select: { id: true, email: true, fullName: true, updatedAt: true },
    });
    return updated;
  }

  @Get('media')
  @UseGuards(AuthGuard('jwt-professional'))
  async listMedia(@Request() req: any) {
    const professionalId = req.user.id || req.user.sub;
    const media = await (this.prisma as any).professionalMedia.findMany({
      where: { professionalId },
      orderBy: [
        { isProfileFeature: 'desc' },
        { profileFeatureSortOrder: 'asc' },
        { projectSortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        referenceProject: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return media.map((item: any) => this.mapProfessionalMediaItem(item));
  }

  @Post('media')
  @UseGuards(AuthGuard('jwt-professional'))
  async createMedia(
    @Request() req: any,
    @Body()
    body: {
      storageKeys?: string[];
      imageUrls?: string[];
      description?: string;
      credit?: string;
      copyrightNotice?: string;
      sourceType?: string;
      isProfileFeature?: boolean;
    },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const storageKeys = this.normalizeStorageKeys(body.storageKeys || body.imageUrls || []);
    if (storageKeys.length === 0) {
      throw new BadRequestException('At least one media item is required');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      let nextFeatureOrder: number | null = null;

      if (body.isProfileFeature) {
        const featureCount = await (tx as any).professionalMedia.count({
          where: { professionalId, isProfileFeature: true },
        });
        if (featureCount + storageKeys.length > 5) {
          throw new BadRequestException('You can select up to 5 profile feature images');
        }
        nextFeatureOrder = featureCount + 1;
      }

      const rows: any[] = [];
      for (const storageKey of storageKeys) {
        const existing = await (tx as any).professionalMedia.findUnique({
          where: {
            professionalId_storageKey: {
              professionalId,
              storageKey,
            },
          },
        });

        if (existing) {
          const updated = await (tx as any).professionalMedia.update({
            where: { id: existing.id },
            data: {
              description: body.description !== undefined ? this.normalizeTextInput(body.description) : existing.description,
              credit: body.credit !== undefined ? this.normalizeTextInput(body.credit) : existing.credit,
              copyrightNotice:
                body.copyrightNotice !== undefined
                  ? this.normalizeTextInput(body.copyrightNotice)
                  : existing.copyrightNotice,
              sourceType: body.sourceType !== undefined ? this.normalizeTextInput(body.sourceType) : existing.sourceType,
              ...(body.isProfileFeature
                ? {
                    isProfileFeature: true,
                    profileFeatureSortOrder: nextFeatureOrder,
                  }
                : {}),
            },
          });
          if (body.isProfileFeature && nextFeatureOrder !== null) nextFeatureOrder += 1;
          rows.push(updated);
          continue;
        }

        const createdRow = await (tx as any).professionalMedia.create({
          data: {
            professionalId,
            storageKey,
            kind: 'STANDALONE',
            description: this.normalizeTextInput(body.description),
            credit: this.normalizeTextInput(body.credit),
            copyrightNotice: this.normalizeTextInput(body.copyrightNotice),
            sourceType: this.normalizeTextInput(body.sourceType),
            isProfileFeature: Boolean(body.isProfileFeature),
            profileFeatureSortOrder: body.isProfileFeature ? nextFeatureOrder : null,
          },
        });
        if (body.isProfileFeature && nextFeatureOrder !== null) nextFeatureOrder += 1;
        rows.push(createdRow);
      }

      if (body.isProfileFeature) {
        await this.syncLegacyProfileImagesMirror(tx, professionalId);
      }

      return rows;
    });

    return created.map((item: any) => this.mapProfessionalMediaItem(item));
  }

  @Put('media/:id')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateMedia(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      description?: string | null;
      credit?: string | null;
      copyrightNotice?: string | null;
      sourceType?: string | null;
      isProfileFeature?: boolean;
    },
  ) {
    const professionalId = req.user.id || req.user.sub;

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await (tx as any).professionalMedia.findFirst({
        where: { id, professionalId },
      });
      if (!existing) {
        throw new BadRequestException('Media item not found');
      }

      let profileFeatureSortOrder = existing.profileFeatureSortOrder;
      if (body.isProfileFeature === true && !existing.isProfileFeature) {
        const featureCount = await (tx as any).professionalMedia.count({
          where: { professionalId, isProfileFeature: true },
        });
        if (featureCount >= 5) {
          throw new BadRequestException('You can select up to 5 profile feature images');
        }
        profileFeatureSortOrder = featureCount + 1;
      }
      if (body.isProfileFeature === false) {
        profileFeatureSortOrder = null;
      }

      const row = await (tx as any).professionalMedia.update({
        where: { id: existing.id },
        data: {
          description:
            body.description === undefined ? existing.description : this.normalizeTextInput(body.description ?? undefined) || null,
          credit: body.credit === undefined ? existing.credit : this.normalizeTextInput(body.credit ?? undefined) || null,
          copyrightNotice:
            body.copyrightNotice === undefined
              ? existing.copyrightNotice
              : this.normalizeTextInput(body.copyrightNotice ?? undefined) || null,
          sourceType:
            body.sourceType === undefined ? existing.sourceType : this.normalizeTextInput(body.sourceType ?? undefined) || null,
          ...(body.isProfileFeature === undefined
            ? {}
            : {
                isProfileFeature: body.isProfileFeature,
                profileFeatureSortOrder,
              }),
        },
        include: {
          referenceProject: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      if (body.isProfileFeature !== undefined) {
        await this.syncLegacyProfileImagesMirror(tx, professionalId);
      }

      return row;
    });

    return this.mapProfessionalMediaItem(updated);
  }

  @Delete('media/:id')
  @UseGuards(AuthGuard('jwt-professional'))
  async deleteMedia(@Request() req: any, @Param('id') id: string) {
    const professionalId = req.user.id || req.user.sub;

    await this.prisma.$transaction(async (tx) => {
      const existing = await (tx as any).professionalMedia.findFirst({
        where: { id, professionalId },
        select: {
          id: true,
          isProfileFeature: true,
          referenceProjectId: true,
        },
      });
      if (!existing) {
        throw new BadRequestException('Media item not found');
      }

      await (tx as any).professionalMedia.delete({
        where: { id: existing.id },
      });

      if (existing.isProfileFeature) {
        await this.syncLegacyProfileImagesMirror(tx, professionalId);
      }
      if (existing.referenceProjectId) {
        await this.syncLegacyReferenceProjectImagesMirror(tx, existing.referenceProjectId);
      }
    });

    return { success: true };
  }

  @Get('projects')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProfessionalProjects(@Request() req: any) {
    try {
      const professionalId = req.user.id || req.user.sub;

      const projectProfessionals = await (
        this.prisma as any
      ).projectProfessional.findMany({
        where: {
          professionalId,
          status: { in: this.visibleProfessionalStatuses },
          project: {
            status: { not: 'archived' },
          },
        },
        include: {
          project: {
            select: {
              id: true,
              projectName: true,
              isEmergency: true,
              clientName: true,
              region: true,
              budget: true,
              notes: true,
              tradesRequired: true,
              endDate: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const mapped = projectProfessionals.map((pp: any) => {
        const isRestricted = !this.canAccessFullProject(pp.status);
        if (!isRestricted) {
          return { ...pp, accessRestricted: false };
        }

        return {
          ...pp,
          accessRestricted: true,
          project: {
            id: pp.project?.id,
            projectName: pp.project?.projectName,
            isEmergency: pp.project?.isEmergency,
            clientName: '',
            region: '',
            budget: undefined,
            notes: pp.project?.notes,
            endDate: pp.project?.endDate,
          },
        };
      });

      return mapped;
    } catch (error) {
      console.error('Error fetching professional projects:', error);
      throw error;
    }
  }

  @Get('reference-projects')
  @UseGuards(AuthGuard('jwt-professional'))
  async listReferenceProjects(@Request() req: any) {
    const professionalId = req.user.id || req.user.sub;
    const projects = await (this.prisma as any).professionalReferenceProject.findMany({
      where: { professionalId },
      include: {
        media: {
          orderBy: [
            { projectSortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return projects.map((project: any) => this.resolveReferenceProjectMediaUrls(project));
  }

  @Post('reference-projects')
  @UseGuards(AuthGuard('jwt-professional'))
  async createReferenceProject(
    @Request() req: any,
    @Body() body: { title: string; description?: string; imageUrls?: string[] },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;
      const normalizedImageUrls = this.normalizeStorageKeys(body.imageUrls || []);
      console.log('[createReferenceProject] req.user:', req.user);
      console.log('[createReferenceProject] professionalId:', professionalId);
      if (!professionalId) {
        throw new BadRequestException('Professional ID not found in auth token');
      }
      if (!body.title || !body.title.trim()) {
        throw new BadRequestException('Title is required');
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const project = await (tx as any).professionalReferenceProject.create({
          data: {
            professionalId,
            title: body.title.trim(),
            description: body.description?.trim() || null,
            imageUrls: normalizedImageUrls,
          },
        });

        await this.syncReferenceProjectMedia(tx, professionalId, project.id, normalizedImageUrls);

        return (tx as any).professionalReferenceProject.findUnique({
          where: { id: project.id },
          include: {
            media: {
              orderBy: [
                { projectSortOrder: 'asc' },
                { createdAt: 'asc' },
              ],
            },
          },
        });
      });
      return this.resolveReferenceProjectMediaUrls(created);
    } catch (error) {
      console.error('[createReferenceProject] Error:', error instanceof Error ? error.message : error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException((error as any)?.message || 'Failed to create reference project');
    }
  }

  @Put('reference-projects/:id')
  @UseGuards(AuthGuard('jwt-professional'))
  async updateReferenceProject(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string; imageUrls?: string[] },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;
      const normalizedImageUrls = body.imageUrls
        ? this.normalizeStorageKeys(body.imageUrls)
        : undefined;
      if (!professionalId) {
        throw new BadRequestException('Professional ID not found in auth token');
      }
      const existing = await (this.prisma as any).professionalReferenceProject.findFirst({
        where: { id, professionalId },
      });
      if (!existing) throw new BadRequestException('Reference project not found');

      const updated = await this.prisma.$transaction(async (tx) => {
        await (tx as any).professionalReferenceProject.update({
          where: { id },
          data: {
            title: body.title?.trim() || existing.title,
            description:
              body.description === undefined
                ? existing.description
                : body.description?.trim() || null,
            imageUrls: normalizedImageUrls ?? existing.imageUrls,
          },
        });

        if (normalizedImageUrls !== undefined) {
          await this.syncReferenceProjectMedia(tx, professionalId, id, normalizedImageUrls);
        }

        return (tx as any).professionalReferenceProject.findUnique({
          where: { id },
          include: {
            media: {
              orderBy: [
                { projectSortOrder: 'asc' },
                { createdAt: 'asc' },
              ],
            },
          },
        });
      });
      return this.resolveReferenceProjectMediaUrls(updated);
    } catch (error) {
      console.error('[updateReferenceProject] Error:', error instanceof Error ? error.message : error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException((error as any)?.message || 'Failed to update reference project');
    }
  }

  @Delete('reference-projects/:id')
  @UseGuards(AuthGuard('jwt-professional'))
  async deleteReferenceProject(@Request() req: any, @Param('id') id: string) {
    try {
      const professionalId = req.user.id || req.user.sub;
      if (!professionalId) {
        throw new BadRequestException('Professional ID not found in auth token');
      }
      const existing = await (this.prisma as any).professionalReferenceProject.findFirst({
        where: { id, professionalId },
      });
      if (!existing) throw new BadRequestException('Reference project not found');
      await this.prisma.$transaction(async (tx) => {
        await this.detachOrDeleteReferenceProjectMedia(tx, id);
        await (tx as any).professionalReferenceProject.delete({ where: { id } });
      });
      return { success: true };
    } catch (error) {
      console.error('[deleteReferenceProject] Error:', error instanceof Error ? error.message : error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException((error as any)?.message || 'Failed to delete reference project');
    }
  }

  @Get('projects/:projectProfessionalId')
  @UseGuards(AuthGuard('jwt-professional'))
  async getProjectDetail(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
          status: { in: this.activeProfessionalStatuses },
          project: {
            status: { not: 'archived' },
          },
        },
        include: {
          project: {
            include: {
              photos: true,
              aiIntake: {
                select: {
                  id: true,
                  assumptions: true,
                  risks: true,
                  project: true,
                },
              },
            },
          },
          paymentRequests: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const mimoProjectExtras = await this.listProjectExtras(projectProfessional.projectId);

      return {
        ...projectProfessional,
        project: {
          ...(projectProfessional as any).project,
          mimoProjectExtras,
        },
      };
    } catch (error) {
      console.error('Error fetching project detail, retrying with explicit project select:', error);

      try {
        const professionalId = req.user.id || req.user.sub;
        const projectProfessional = await (
          this.prisma as any
        ).projectProfessional.findFirst({
          where: {
            id: projectProfessionalId,
            professionalId,
            status: { in: this.activeProfessionalStatuses },
            project: {
              status: { not: 'archived' },
            },
          },
          select: {
            id: true,
            projectId: true,
            professionalId: true,
            status: true,
            quoteAmount: true,
            quoteBaseAmount: true,
            quoteBreakdown: true,
            quoteNotes: true,
            quoteEstimatedStartAt: true,
            quoteEstimatedDurationMinutes: true,
            quoteEstimatedDurationUnit: true,
            quotedAt: true,
            respondedAt: true,
            createdAt: true,
            quoteReminderSentAt: true,
            quoteExtendedUntil: true,
            updatedAt: true,
            quoteRequestedTrades: true,
            projectTradesSnapshot: true,
            project: {
              select: {
                id: true,
                projectName: true,
                clientName: true,
                region: true,
                projectScale: true,
                currentStage: true,
                isEmergency: true,
                siteStartedAt: true,
                budget: true,
                notes: true,
                tradesRequired: true,
                photos: true,
              },
            },
            paymentRequests: {
              select: {
                id: true,
                requestType: true,
                requestAmount: true,
                requestPercentage: true,
                status: true,
                notes: true,
                createdAt: true,
              },
            },
          },
        });

        if (!projectProfessional) {
          throw new BadRequestException('Project not found');
        }

        const mimoProjectExtras = await this.listProjectExtras(projectProfessional.projectId);

        return {
          ...projectProfessional,
          project: {
            ...(projectProfessional as any).project,
            mimoProjectExtras,
          },
        };
      } catch (fallbackError) {
        console.error('Fallback error fetching project detail:', fallbackError);
        throw fallbackError;
      }
    }
  }

  @Post('projects/:projectProfessionalId/quote-preview')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async previewQuoteFee(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: { quoteAmount: number | string },
  ) {
    const professionalId = req.user.id || req.user.sub;
    const quoteAmount = parseFloat(String(body?.quoteAmount));

    if (isNaN(quoteAmount) || quoteAmount < 0) {
      throw new BadRequestException('Invalid quote amount');
    }

    const projectProfessional = await (this.prisma as any).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        professionalId,
        status: { in: this.activeProfessionalStatuses },
      },
      include: {
        project: {
          select: {
            clientId: true,
          },
        },
      },
    });

    if (!projectProfessional) {
      throw new BadRequestException('Project not found');
    }

    const feeBreakdown = await this.platformFeeService.calculateGrossPrice(
      quoteAmount,
      professionalId,
      projectProfessional.project?.clientId,
    );

    return {
      baseAmount: feeBreakdown.baseAmount,
      platformFeePercent: feeBreakdown.effectivePercent,
      platformFeeAmount: feeBreakdown.platformFeeAmount,
      grossAmount: feeBreakdown.grossAmount,
    };
  }

  @Post('projects/:projectProfessionalId/quote')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async submitQuote(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body()
    body: {
      quoteAmount: number | string;
      quoteBreakdown?: unknown;
      quoteNotes?: string;
      quoteEstimatedStartAt?: string;
      quoteEstimatedDurationMinutes?: number | string;
      quoteEstimatedDurationUnit?: string;
    },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
          status: { in: this.activeProfessionalStatuses },
        },
        include: {
          project: {
            select: {
              isEmergency: true,
              projectScale: true,
              clientId: true,
            },
          },
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const normalizedBreakdown = normalizeQuoteBreakdownInput(body.quoteBreakdown, {
        projectScale: projectProfessional.project?.projectScale,
        isEmergency: projectProfessional.project?.isEmergency === true,
      });

      const quoteAmount = normalizedBreakdown
        ? normalizedBreakdown.baseTotal
        : parseFloat(String(body.quoteAmount));

      if (isNaN(quoteAmount) || quoteAmount < 0) {
        throw new BadRequestException('Invalid quote amount');
      }
      const quoteSchedule = this.normalizeQuoteSchedule({
        quoteEstimatedStartAt: body.quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes: body.quoteEstimatedDurationMinutes,
        quoteEstimatedDurationUnit: body.quoteEstimatedDurationUnit,
      });

      if (projectProfessional.quotedAt) {
        throw new BadRequestException('You have already submitted a quote for this project');
      }

      const inviteCreatedAt = projectProfessional.createdAt
        ? new Date(projectProfessional.createdAt)
        : null;
      const quoteWindowMs = projectProfessional.project?.isEmergency
        ? 1 * 60 * 60 * 1000
        : 3 * 24 * 60 * 60 * 1000;

      if (inviteCreatedAt) {
        const extendedUntil = projectProfessional.quoteExtendedUntil
          ? new Date(projectProfessional.quoteExtendedUntil)
          : null;
        const quoteDeadline = extendedUntil ?? new Date(inviteCreatedAt.getTime() + quoteWindowMs);
        if (new Date() > quoteDeadline) {
          throw new BadRequestException(
            projectProfessional.project?.isEmergency
              ? 'Initial quote window closed (1 hour from invitation)'
              : 'Initial quote window closed (3 days from invitation)',
          );
        }
      }

      // Calculate gross price (with platform fee) from professional's base quote
      const feeBreakdown = await this.platformFeeService.calculateGrossPrice(
        quoteAmount,
        professionalId,
        projectProfessional.project?.clientId,
      );

      const storedBreakdown = withClientQuoteBreakdown(normalizedBreakdown, feeBreakdown.grossAmount);

      await (this.prisma as any).projectProfessional.update({
        where: { id: projectProfessionalId },
        data: {
          quoteBaseAmount: feeBreakdown.baseAmount,
          quoteAmount: feeBreakdown.grossAmount,  // Client sees this (gross with fee)
          quotePlatformFeeAmount: feeBreakdown.platformFeeAmount,
          quotePlatformFeePercent: feeBreakdown.effectivePercent,
          quotePricingVersion: feeBreakdown.pricingVersion,
          quotePlatformFeeBreakdown: feeBreakdown as any,
          quoteBreakdown: storedBreakdown as any,
          feeCalculatedAt: feeBreakdown.calculatedAt,
          quoteNotes: body.quoteNotes || '',
          quoteEstimatedStartAt: quoteSchedule.quoteEstimatedStartAt,
          quoteEstimatedDurationMinutes:
            quoteSchedule.quoteEstimatedDurationMinutes,
          quoteEstimatedDurationUnit: quoteSchedule.quoteEstimatedDurationUnit,
          quotedAt: new Date(),
          status: 'quoted',
          respondedAt: projectProfessional.respondedAt || new Date(),
        },
      });

      const updated = await (this.prisma as any).projectProfessional.findUnique({
        where: { id: projectProfessionalId },
        include: {
          project: { include: { user: true } },
          professional: true,
        },
      });

      if (!updated) {
        throw new BadRequestException('Failed to load updated quote record');
      }

      // Create a structured event message to notify the client in-app
      const _fmtDate = (d: Date): string => {
        const p = new Intl.DateTimeFormat('en-GB', {
          weekday: 'short', day: '2-digit', month: 'short',
          hour: '2-digit', minute: '2-digit', hour12: false,
          timeZone: 'Asia/Hong_Kong',
        }).formatToParts(d);
        const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
        return `${get('weekday')} ${get('day')} ${get('month')} at ${get('hour')}:${get('minute')}`;
      };
      const _quoteEventPayload = {
        type: 'quote-submitted',
        icon: '💰',
        title: 'Quotation Submitted',
        fields: [
          ...(isNaN(quoteAmount) ? [] : [{ label: 'Amount', value: `HK$${quoteAmount.toLocaleString?.() ?? quoteAmount}` }]),
          ...getStoredQuoteBreakdownClientItems(storedBreakdown).map((item) => ({
            label: item.label,
            value: `HK$${item.amount.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
          })),
          { label: 'Start', value: _fmtDate(quoteSchedule.quoteEstimatedStartAt) },
          { label: 'Duration', value: this.formatDurationMinutes(quoteSchedule.quoteEstimatedDurationMinutes) },
          ...(body.quoteNotes ? [{ label: 'Notes', value: body.quoteNotes }] : []),
        ],
      };
      await (this.prisma as any).message.create({
        data: {
          projectProfessionalId,
          senderType: 'professional',
          senderProfessionalId: professionalId,
          content: `[[event]]\n${JSON.stringify(_quoteEventPayload)}`,
        },
      });

      // Send email notification to client (best-effort; ignore if email not configured)
      try {
        const baseUrl =
          process.env.WEB_BASE_URL ||
          process.env.FRONTEND_BASE_URL ||
          process.env.APP_WEB_URL ||
          'https://fitouthub-web.vercel.app';

        const clientEmail = updated.project?.user?.email;
        if (clientEmail) {
          await this.email.sendQuoteSubmitted({
            to: clientEmail,
            clientName:
              updated.project?.user?.firstName ||
              updated.project?.clientName ||
              'Client',
            professionalName:
              updated.professional?.fullName ||
              updated.professional?.businessName ||
              'A professional',
            projectName: updated.project?.projectName || 'Your Project',
            quoteAmount: Number(quoteAmount) || 0,
            quoteBreakdownLines: getQuoteBreakdownDisplayLines(storedBreakdown),
            projectId: updated.project?.id,
            baseUrl,
          });
        }
      } catch (e) {
        console.warn('Failed to send quote submitted email:', e);
      }

      try {
        await this.activityLogService.record({
          professionalId,
          actorName:
            updated.professional?.fullName ||
            updated.professional?.businessName ||
            updated.professional?.email ||
            'Professional',
          actorType: 'professional',
          action: 'quote_submitted',
          resource: 'Project',
          resourceId: updated.project?.id || projectProfessional.projectId,
          projectId: updated.project?.id || projectProfessional.projectId,
          projectTitle: updated.project?.projectName,
          details: `Submitted quote for ${updated.project?.projectName || 'project'}`,
          metadata: {
            projectProfessionalId,
            quoteAmount: Number(quoteAmount) || 0,
          },
          status: 'success',
        });
      } catch (e) {
        console.error('[ProfessionalController.submitQuote] Failed to write activity log:', (e as any)?.message);
      }

      // Push notification to client
      const clientUserId = updated.project?.user?.id;
      if (clientUserId) {
        const proName = updated.professional?.fullName || updated.professional?.businessName || 'A professional';
        void this.pushService.sendToUser(clientUserId, {
          title: 'New Quote Received',
          body: `${proName} submitted a quote of HK$${Number(quoteAmount).toLocaleString()} for "${updated.project?.projectName}".`,
          url: `/projects/${updated.project?.id}?tab=quotes`,
          tag: `quote-submitted-${projectProfessionalId}`,
        });
      }

      // Invalidate next-step cache so the client sees updated actions
      try {
        await this.prisma.project.update({
          where: { id: updated.project?.id },
          data: { nextStepCache: null as any },
        });
      } catch { /* non-critical */ }

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error submitting quote:', error);
      throw error;
    }
  }

  @Post('projects/:projectProfessionalId/accept')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async acceptProject(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
          status: { in: this.activeProfessionalStatuses },
        },
        include: {
          project: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const updated = await (this.prisma as any).$transaction(async (tx: any) => {
        // Update project professional status
        const updatedPP = await tx.projectProfessional.update({
          where: { id: projectProfessionalId },
          data: {
            status: 'accepted',
            respondedAt: new Date(),
          },
          include: {
            project: true,
          },
        });

        // Transition project to BIDDING_ACTIVE if still in CREATED
        if (projectProfessional.project?.currentStage === 'CREATED') {
          await tx.project.update({
            where: { id: projectProfessional.projectId },
            data: { currentStage: 'BIDDING_ACTIVE' },
          });
        }

        // Create financial transactions for quotation acceptance
        const quoteAmount = projectProfessional.quoteAmount 
          ? new Decimal(projectProfessional.quoteAmount.toString()) 
          : new Decimal(0);

        if (quoteAmount.greaterThan(0)) {
          // Transaction 1: Quotation accepted notification (info status)
          const quoteTx = await tx.financialTransaction.create({
            data: {
              projectId: projectProfessional.projectId,
              projectProfessionalId,
              type: 'quotation_accepted',
              description: `Quotation accepted from ${projectProfessional.project?.contractorName || 'Professional'}`,
              amount: quoteAmount,
              status: 'info', // informational, not actionable
              requestedBy: professionalId,
              requestedByRole: 'professional',
              actionBy: professionalId,
              actionByRole: 'professional',
              actionComplete: true,
            },
          });

          // Persist approved budget + award pointers on project
          await tx.project.update({
            where: { id: projectProfessional.projectId },
            data: {
              approvedBudget: quoteAmount,
              approvedBudgetTxId: quoteTx.id,
              awardedProjectProfessionalId: projectProfessionalId,
              escrowRequired: quoteAmount,
            },
          });

          // Transaction 2: Escrow deposit request (pending until client confirms payment) - from FOH
          const project = projectProfessional.project;
          const clientId = project?.clientId || project?.userId;
          await tx.financialTransaction.create({
            data: {
              projectId: projectProfessional.projectId,
              projectProfessionalId,
              type: 'escrow_deposit_request',
              description: `Request to deposit project fees to escrow`,
              amount: quoteAmount,
              status: 'pending',
              requestedBy: 'foh',
              requestedByRole: 'platform',
              actionBy: clientId,
              actionByRole: 'client',
              actionComplete: false,
              notes: `Quote amount for project ${project?.projectName || 'Project'}`,
            },
          });
        }

        return updatedPP;
      });

      try {
        await this.activityLogService.record({
          professionalId,
          actorName: req.user?.fullName || req.user?.email || 'Professional',
          actorType: 'professional',
          action: 'project_invitation_accepted',
          resource: 'ProjectProfessional',
          resourceId: projectProfessionalId,
          projectId: projectProfessional.projectId,
          projectTitle: projectProfessional.project?.projectName,
          details: `Accepted project invitation for ${projectProfessional.project?.projectName || 'project'}`,
          metadata: {
            projectProfessionalId,
          },
          status: 'success',
        });
      } catch (e) {
        console.error('[ProfessionalController.acceptProject] Failed to write activity log:', (e as any)?.message);
      }

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error accepting project:', error);
      throw error;
    }
  }

  @Post('projects/:projectProfessionalId/reject')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async rejectProject(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: any,
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this professional owns this project
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
          status: { in: this.activeProfessionalStatuses },
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found');
      }

      const updated = await (this.prisma as any).projectProfessional.update({
        where: { id: projectProfessionalId },
        data: {
          status: 'rejected',
          respondedAt: new Date(),
          ...(body?.quoteNotes ? { quoteNotes: body.quoteNotes } : {}),
        },
      });

      try {
        await this.activityLogService.record({
          professionalId,
          actorName: req.user?.fullName || req.user?.email || 'Professional',
          actorType: 'professional',
          action: 'project_invitation_rejected',
          resource: 'ProjectProfessional',
          resourceId: projectProfessionalId,
          projectId: projectProfessional.projectId,
          details: 'Declined project invitation',
          metadata: {
            projectProfessionalId,
          },
          status: 'info',
        });
      } catch (e) {
        console.error('[ProfessionalController.rejectProject] Failed to write activity log:', (e as any)?.message);
      }

      return {
        success: true,
        projectProfessional: updated,
      };
    } catch (error) {
      console.error('Error rejecting project:', error);
      throw error;
    }
  }

  // Messages: list with pagination (default 30 newest)
  @Get('projects/:projectProfessionalId/messages')
  @UseGuards(AuthGuard('jwt-professional'))
  async getMessages(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const professionalId = req.user.id || req.user.sub;

    const projectProfessional = await (
      this.prisma as any
    ).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        professionalId,
        status: { in: this.activeProfessionalStatuses },
      },
    });
    if (!projectProfessional) {
      throw new ForbiddenException('Messaging is no longer available for this project');
    }

    const messages = await (this.prisma as any).message.findMany({
      where: { projectProfessionalId },
      orderBy: { createdAt: 'asc' },
      take: 100, // initial cap; client will show first 30 and allow more
    });
    return { messages };
  }

  // Messages: send from professional
  @Post('projects/:projectProfessionalId/messages')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: { content: string },
  ) {
    const professionalId = req.user.id || req.user.sub;
    if (!body?.content || body.content.trim().length === 0) {
      throw new BadRequestException('Message content is required');
    }

    const projectProfessional = await (
      this.prisma as any
    ).projectProfessional.findFirst({
      where: {
        id: projectProfessionalId,
        professionalId,
        status: { in: this.activeProfessionalStatuses },
      },
    });
    if (!projectProfessional) {
      throw new ForbiddenException('Messaging is no longer available for this project');
    }

    const message = await (this.prisma as any).message.create({
      data: {
        projectProfessionalId,
        senderType: 'professional',
        senderProfessionalId: professionalId,
        content: body.content.trim(),
      },
    });
    return { success: true, message };
  }

  // Messages: mark client messages as read by professional
  @Post('projects/:projectProfessionalId/messages/mark-read')
  @UseGuards(AuthGuard('jwt-professional'))
  @HttpCode(HttpStatus.OK)
  async markMessagesRead(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
  ) {
    const professionalId = req.user.id || req.user.sub;
    return this.updatesService.markMessageGroupAsRead(professionalId, 'professional', {
      chatType: 'project-professional',
      threadId: projectProfessionalId,
    });
  }

  // Request advance payment for upfront costs
  @Post('projects/:projectProfessionalId/advance-payment-request')
  @UseGuards(AuthGuard('jwt-professional'))
  async requestAdvancePayment(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Body() body: { 
      requestType?: 'fixed' | 'percentage'; 
      paymentMilestoneId?: string;
      amount?: number; 
      percentage?: number;
      notes?: string;
    },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      // Verify this is the professional's project and it's awarded
      const projectProfessional = await (
        this.prisma as any
      ).projectProfessional.findFirst({
        where: { 
          id: projectProfessionalId, 
          professionalId,
          status: 'awarded',
        },
        include: {
          project: {
            include: {
              user: true,
            },
          },
          professional: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException(
          'Project not found or not awarded to you',
        );
      }

      const paymentPlan = await (this.prisma as any).projectPaymentPlan.findUnique({
        where: { projectId: projectProfessional.projectId },
        include: {
          milestones: {
            orderBy: { sequence: 'asc' },
          },
        },
      });

      // Allow multiple payment requests; no invoice dependency

      // Validate request
      const quoteAmount = Number(projectProfessional.quoteAmount || 0);
      const now = new Date();
      const trimmedNotes = String(body.notes || '').trim();

      let requestType: string | undefined = body.requestType;
      let requestAmount = 0;
      let requestPercentage: number | null = null;
      let requestNotes = trimmedNotes || null;
      let requestDescription = 'Payment request';
      let emailRequestType: string = body.requestType || 'fixed';
      let milestoneUpdateData: Record<string, any> | null = null;

      if (body.paymentMilestoneId) {
        if (!paymentPlan) {
          throw new BadRequestException('No payment plan exists for this project');
        }

        if (!['locked', 'active'].includes(paymentPlan.status)) {
          throw new BadRequestException('Payment plan must be locked or active before requesting milestone payments');
        }

        const milestone = paymentPlan.milestones.find((item: any) => item.id === body.paymentMilestoneId);
        if (!milestone) {
          throw new BadRequestException('Selected milestone was not found on this payment plan');
        }

        if (paymentPlan.escrowFundingPolicy === 'ROLLING_TWO_MILESTONES' && milestone.status !== 'escrow_funded') {
          throw new BadRequestException('This milestone is not yet funded in escrow for release');
        }

        if (paymentPlan.escrowFundingPolicy !== 'ROLLING_TWO_MILESTONES') {
          const escrowHeld = Number(projectProfessional.project?.escrowHeld || 0);
          if (!Number.isFinite(escrowHeld) || escrowHeld <= 0) {
            throw new BadRequestException('Escrow funding is not confirmed yet for this project');
          }
        }

        if (!['scheduled', 'escrow_funded'].includes(milestone.status)) {
          throw new BadRequestException('This milestone is not currently eligible for a payment request');
        }

        const plannedDueAt = milestone.plannedDueAt ? new Date(milestone.plannedDueAt) : null;
        const requestDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const dueDay = plannedDueAt
          ? new Date(plannedDueAt.getFullYear(), plannedDueAt.getMonth(), plannedDueAt.getDate()).getTime()
          : null;
        const timingStatus =
          dueDay == null
            ? 'on_time'
            : requestDay < dueDay
              ? 'early'
              : requestDay > dueDay
                ? 'late'
                : 'on_time';

        const milestoneMeta = {
          paymentMilestoneId: milestone.id,
          paymentPlanId: paymentPlan.id,
          milestoneSequence: milestone.sequence,
          milestoneTitle: milestone.title,
          timingStatus,
          plannedDueAt: plannedDueAt ? plannedDueAt.toISOString() : null,
        };

        requestType = 'milestone';
        emailRequestType = 'milestone';
        requestAmount = Number(milestone.amount || 0);
        requestPercentage = typeof milestone.percentOfTotal === 'number' ? milestone.percentOfTotal : null;
        requestDescription = `Milestone payment request: ${milestone.title}${requestPercentage ? ` (${requestPercentage}%)` : ''}`;
        requestNotes = [
          trimmedNotes || null,
          `Milestone: ${milestone.title}`,
          plannedDueAt ? `Planned due: ${plannedDueAt.toISOString()}` : null,
          `Timing: ${timingStatus}`,
          `__FOH_MILESTONE__${JSON.stringify(milestoneMeta)}`,
        ]
          .filter(Boolean)
          .join(' | ');

        milestoneUpdateData = {
          status: 'release_requested',
          releaseRequestedAt: now,
          adminComment:
            timingStatus === 'late'
              ? 'Late milestone request submitted; schedule extension review may be required.'
              : null,
        };
      } else if (body.requestType === 'fixed') {
        if (!body.amount || body.amount <= 0) {
          throw new BadRequestException('Invalid amount');
        }
        if (quoteAmount > 0 && body.amount > quoteAmount) {
          throw new BadRequestException(
            'Amount cannot exceed quote total',
          );
        }
        requestAmount = body.amount;
      } else if (body.requestType === 'percentage') {
        if (!body.percentage || body.percentage <= 0 || body.percentage > 100) {
          throw new BadRequestException('Percentage must be between 1 and 100');
        }
        requestAmount = (quoteAmount * body.percentage) / 100;
        requestPercentage = body.percentage;
        requestDescription = `Payment request (${body.percentage}%)`;
      } else {
        throw new BadRequestException('Invalid request type');
      }

      // Create payment request in PaymentRequest table
      const paymentRequest = await (
        this.prisma as any
      ).paymentRequest.create({
        data: {
          projectProfessionalId,
          requestType: requestType || 'fixed',
          requestAmount,
          requestPercentage: requestPercentage ?? undefined,
          status: 'pending',
          notes: requestNotes,
        },
      });

      // Also create a FinancialTransaction for visibility in financials view
      const decimalAmount = new Decimal(requestAmount.toString());
      const clientId = projectProfessional.project?.clientId || projectProfessional.project?.userId;
      await (this.prisma as any).financialTransaction.create({
        data: {
          projectId: projectProfessional.projectId,
          projectProfessionalId,
          type: 'payment_request',
          description: requestDescription,
          amount: decimalAmount,
          status: 'pending',
          requestedBy: professionalId,
          requestedByRole: 'professional',
          actionBy: clientId,
          actionByRole: 'client',
          actionComplete: false,  // Pending client approval
          notes: requestNotes || `Payment request for project milestone`,
        },
      });

      if (milestoneUpdateData && body.paymentMilestoneId) {
        await (this.prisma as any).paymentMilestone.update({
          where: { id: body.paymentMilestoneId },
          data: milestoneUpdateData,
        });
      }

      // Send notification to client
      const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';
      const professionalName = projectProfessional.professional.fullName ||
        projectProfessional.professional.businessName ||
        'Professional';
      const clientEmail = projectProfessional.project.user?.email;

      if (clientEmail) {
        await this.email.sendAdvancePaymentRequestNotification({
          to: clientEmail,
          clientName: projectProfessional.project.clientName,
          professionalName,
          projectName: projectProfessional.project.projectName,
          requestType: emailRequestType,
          requestAmount: `$${requestAmount.toFixed(2)}`,
          requestPercentage: requestPercentage ?? undefined,
          invoiceAmount: `$${quoteAmount.toFixed(2)}`,
          projectUrl: `${webBaseUrl}/projects/${projectProfessional.project.id}`,
        });
      }

      // Add system message to chat
      await (this.prisma as any).message.create({
        data: {
          projectProfessionalId,
          senderType: 'professional',
          senderProfessionalId: professionalId,
          content: body.paymentMilestoneId
            ? `💰 Milestone payment requested: $${requestAmount.toFixed(2)} for ${requestDescription}.${requestNotes?.includes('Timing: late') ? ' ⚠️ Submitted after the planned milestone date; schedule review may be required.' : ''}`
            : `💰 Payment requested: ${body.requestType === 'percentage' ? `${body.percentage}% (` : ''}$${requestAmount.toFixed(2)}${body.requestType === 'percentage' ? ')' : ''} for upfront costs. Mimo will review and contact the client.`,
        },
      });

      return { success: true, paymentRequest };
    } catch (err) {
      console.error('[ProfessionalController.requestAdvancePayment] Error:', err);
      throw err;
    }
  }

  // ─── B.2: Rolling policy milestone funding request ───────────────────────

  /**
   * POST /professional/projects/:projectProfessionalId/payment-plan/milestones/:milestoneId/request-funding
   *
   * For ROLLING_TWO_MILESTONES projects only.
   * Professional (or platform on their behalf) requests that the client fund the
   * next milestone window into escrow.
   *
   * Transitions: milestone scheduled → escrow_requested
   * Creates:     FinancialTransaction type=escrow_deposit_request with milestone metadata
   */
  @Post('projects/:projectProfessionalId/payment-plan/milestones/:milestoneId/request-funding')
  @UseGuards(AuthGuard('jwt-professional'))
  async requestMilestoneFunding(
    @Request() req: any,
    @Param('projectProfessionalId') projectProfessionalId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: { notes?: string },
  ) {
    try {
      const professionalId = req.user.id || req.user.sub;

      const projectProfessional = await (this.prisma as any).projectProfessional.findFirst({
        where: {
          id: projectProfessionalId,
          professionalId,
          status: 'awarded',
        },
        include: {
          project: { include: { user: true } },
          professional: true,
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Project not found or not awarded to you');
      }

      const paymentPlan = await (this.prisma as any).projectPaymentPlan.findUnique({
        where: { projectId: projectProfessional.projectId },
        include: {
          milestones: { orderBy: { sequence: 'asc' } },
        },
      });

      if (!paymentPlan) {
        throw new BadRequestException('No payment plan exists for this project');
      }

      if (paymentPlan.escrowFundingPolicy !== 'ROLLING_TWO_MILESTONES') {
        throw new BadRequestException(
          'Funding requests only apply to ROLLING_TWO_MILESTONES projects; all escrow is held upfront for this project',
        );
      }

      if (!['locked', 'active'].includes(paymentPlan.status)) {
        throw new BadRequestException('Payment plan must be locked or active to request milestone funding');
      }

      const milestone = paymentPlan.milestones.find((m: any) => m.id === milestoneId);
      if (!milestone) {
        throw new BadRequestException('Milestone not found on this payment plan');
      }

      if (milestone.status !== 'scheduled') {
        throw new BadRequestException(
          `Milestone is already in status '${milestone.status}' and cannot be funding-requested again`,
        );
      }

      const now = new Date();
      const milestoneMeta = {
        paymentMilestoneId: milestone.id,
        paymentPlanId: paymentPlan.id,
        milestoneSequence: milestone.sequence,
        milestoneTitle: milestone.title,
        context: 'funding_request',
        plannedDueAt: milestone.plannedDueAt ? new Date(milestone.plannedDueAt).toISOString() : null,
      };

      const trimmedNotes = String(body.notes || '').trim();
      const transactionNotes = [
        trimmedNotes || null,
        `Milestone: ${milestone.title}`,
        milestone.plannedDueAt ? `Planned due: ${new Date(milestone.plannedDueAt).toISOString()}` : null,
        `__FOH_MILESTONE__${JSON.stringify(milestoneMeta)}`,
      ]
        .filter(Boolean)
        .join(' | ');

      // Create the escrow deposit request transaction (client will pay from the project page)
      const clientId = projectProfessional.project?.clientId || projectProfessional.project?.userId;
      const transaction = await (this.prisma as any).financialTransaction.create({
        data: {
          projectId: projectProfessional.projectId,
          projectProfessionalId,
          type: 'escrow_deposit_request',
          description: `Escrow funding request for milestone: ${milestone.title} (${typeof milestone.percentOfTotal === 'number' ? `${milestone.percentOfTotal}%` : 'progress payment'})`,
          amount: milestone.amount,
          status: 'pending',
          requestedBy: professionalId,
          requestedByRole: 'professional',
          actionBy: clientId || null,
          actionByRole: 'client',
          actionComplete: false,
          notes: transactionNotes,
        },
      });

      // Transition milestone to escrow_requested
      await (this.prisma as any).paymentMilestone.update({
        where: { id: milestoneId },
        data: {
          status: 'escrow_requested',
          escrowRequestedAt: now,
        },
      });

      // Chat message
      await (this.prisma as any).message.create({
        data: {
          projectProfessionalId,
          senderType: 'professional',
          senderProfessionalId: professionalId,
          content: `📋 Escrow funding requested for milestone ${milestone.sequence}: "${milestone.title}" — HK$${Number(milestone.amount).toLocaleString()}. The client will be asked to fund this milestone window before work proceeds.`,
        },
      }).catch(() => void 0);

      return {
        success: true,
        transactionId: transaction.id,
        milestoneId: milestone.id,
        milestoneStatus: 'escrow_requested',
      };
    } catch (err) {
      console.error('[ProfessionalController.requestMilestoneFunding] Error:', err);
      throw err;
    }
  }
}
