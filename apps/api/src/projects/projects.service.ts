import { Injectable, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { ChatService } from '../chat/chat.service';
import { PlatformFeeService } from '../common/platform-fee.service';
import { NotificationService } from '../notifications/notification.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { AiService } from '../ai/ai.service';
import { ActivityLogService } from '../activity-log.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { resolve } from 'path';
import { promises as fs } from 'fs';
import * as jwt from 'jsonwebtoken';
import { createId } from '@paralleldrive/cuid2';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { ProjectStage } from '@prisma/client';
import { NotificationChannel } from '@prisma/client';
import { extractObjectKeyFromValue, buildPublicAssetUrl } from '../storage/media-assets.util';
import {
  getQuoteBreakdownDisplayLines,
  normalizeQuoteBreakdownInput,
  withClientQuoteBreakdown,
} from './quote-breakdown';

type NotificationDeliveryStatus = 'sent' | 'failed' | 'skipped';
type NotificationActorType = 'professional' | 'client' | 'reseller' | 'platform' | 'unknown';

interface NotificationAuditRecipient {
  actorType: NotificationActorType;
  actorId: string;
  role: string;
  email: {
    status: NotificationDeliveryStatus;
    error?: string;
  };
  direct: {
    status: NotificationDeliveryStatus;
    preferredChannel?: NotificationChannel | null;
    channel?: NotificationChannel | null;
    reason?: string;
    error?: string;
  };
}

interface NotificationAuditEvent {
  event: string;
  projectId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  recipients: NotificationAuditRecipient[];
}

type MimoProjectExtraRow = {
  id: string;
  projectId: string;
  extraType: 'survey' | 'design' | string;
  status: string;
  source: string | null;
  title: string | null;
  summary: string | null;
  notes: string | null;
  price: number | string | null;
  currency: string;
  metadata: Record<string, unknown> | null;
  adminFeedMessageId: string | null;
  requestedAt: Date;
  approvedAt: Date | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SurveyOpsQueueRow = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  region: string | null;
  projectStatus: string;
  surveyExtraId: string;
  surveyStatus: string;
  assignmentStatus: string | null;
  assignedSurveyorUserId: string | null;
  assignedSurveyorFirstName: string | null;
  assignedSurveyorSurname: string | null;
  assignedSurveyorEmail: string | null;
  calendarEventId: string | null;
  calendarEventStatus: string | null;
  requestedAt: Date;
  scheduledAt: Date | null;
  metadata: Record<string, unknown> | null;
  updatedAt: Date;
};

type TimeInterval = {
  startsAt: Date;
  endsAt: Date;
};

type SurveyorRow = {
  id: string;
  firstName: string | null;
  surname: string | null;
  email: string;
  role: string;
};

type SurveyWorkspacePoint = {
  x: number;
  y: number;
  note?: string;
  color?: string;
};

type SurveyWorkspacePhoto = {
  storageKey?: string | null;
  imageUrl?: string | null;
  caption?: string | null;
  markup?: {
    points?: SurveyWorkspacePoint[];
  };
};

type SurveyWorkspaceRoom = {
  id?: string;
  room?: string;
  scanUrl?: string;
  summary?: string;
  accessNotes?: string;
  recommendations?: string;
  photos?: SurveyWorkspacePhoto[];
};

type SurveyWorkspaceRoomRecord = {
  id: string;
  room: string;
  scanUrl: string;
  summary: string;
  accessNotes: string;
  recommendations: string;
  photos: SurveyWorkspacePhoto[];
};

const coerceJsonArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeSurveyWorkspacePhotos = (photos?: unknown) => {
  const sourcePhotos = coerceJsonArray<SurveyWorkspacePhoto>(photos);

  return sourcePhotos
        .slice(0, 100)
        .map((photo) => ({
          storageKey: String(photo?.storageKey || '').trim() || null,
          imageUrl: String(photo?.imageUrl || '').trim() || null,
          caption: String(photo?.caption || '').trim() || null,
          markup: {
            points: Array.isArray(photo?.markup?.points)
              ? photo.markup.points
                  .slice(0, 200)
                  .map((point) => ({
                    x: Number(point?.x || 0),
                    y: Number(point?.y || 0),
                    note: String(point?.note || '').slice(0, 500),
                    color: String(point?.color || '#ef4444').slice(0, 20),
                  }))
              : [],
          },
        }));
};

const normalizeSurveyWorkspaceRooms = (
  rooms?: unknown,
  fallbackPhotos?: unknown,
  fallbackRoomCount = 1,
): SurveyWorkspaceRoomRecord[] => {
  const sourceRooms = coerceJsonArray<SurveyWorkspaceRoom>(rooms);

  const cleanRooms = sourceRooms
    .slice(0, 25)
    .map((room, index) => ({
        id: String(room?.id || `room_${index + 1}`),
        room: String(room?.room || `Room ${index + 1}`).trim() || `Room ${index + 1}`,
        scanUrl: String(room?.scanUrl || '').trim(),
        summary: String(room?.summary || '').trim(),
        accessNotes: String(room?.accessNotes || '').trim(),
        recommendations: String(room?.recommendations || '').trim(),
        photos: normalizeSurveyWorkspacePhotos(room?.photos),
      }));

  if (cleanRooms.length > 0) {
    return cleanRooms;
  }

  const roomCount = Number.isFinite(fallbackRoomCount) && fallbackRoomCount > 0 ? Math.floor(fallbackRoomCount) : 1;
  const safeRoomCount = Math.max(roomCount, 1);
  const legacyPhotos = normalizeSurveyWorkspacePhotos(fallbackPhotos);

  return Array.from({ length: safeRoomCount }, (_, index) => ({
    id: `room_${index + 1}`,
    room: safeRoomCount > 1 ? `Room ${index + 1}` : 'Room',
    scanUrl: '',
    summary: '',
    accessNotes: '',
    recommendations: '',
    photos: index === 0 ? legacyPhotos : [],
  }));
};

const flattenSurveyWorkspaceRoomPhotos = (rooms: SurveyWorkspaceRoomRecord[]) =>
  rooms.flatMap((room) => room.photos || []);

const HK_TIMEZONE_OFFSET_HOURS = 8;
const HK_TIMEZONE_OFFSET_MS = HK_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private chatService: ChatService,
    private platformFeeService: PlatformFeeService,
    private notificationService: NotificationService,
    private pushService: PushNotificationService,
    private aiService: AiService,
    private activityLogService: ActivityLogService,
  ) {}

  private readonly STATUS_ORDER = [
    'withdrawn',
    'awarded',
    'quoted',
    'accepted',
    'counter_requested',
    'pending',
    'declined',
  ];

  private readonly ARCHIVED_STATUS = 'archived';
  private readonly PROJECT_SELECTABLE_PROFESSION_TYPES = ['contractor', 'company'] as const;
  private readonly MIMO_SURVEY_WORKDAY_START_HOUR = 9;
  private readonly MIMO_SURVEY_WORKDAY_END_HOUR = 18;
  private readonly MIMO_SURVEY_LUNCH_START_HOUR = 13;
  private readonly MIMO_SURVEY_LUNCH_END_HOUR = 14;
  private readonly MIMO_SURVEY_SLOT_STEP_MINUTES = 30;
  private readonly MIMO_SURVEY_LOOKAHEAD_DAYS = 30;
  private readonly MIMO_SURVEY_MAX_LOOKAHEAD_DAYS = 120;
  private surveyAssignmentHasCalendarEventId: boolean | null = null;

  private getMimoSurveyDurationMinutes(rooms: number): number {
    const setupMinutes = 20;
    const finalisationMinutes = 15;
    const travelBeforeMinutes = 30;
    const travelAfterMinutes = 30;
    const onsiteBaseMinutes = 35;
    const onsitePerRoomMinutes = 25;

    return (
      setupMinutes +
      finalisationMinutes +
      travelBeforeMinutes +
      travelAfterMinutes +
      onsiteBaseMinutes +
      onsitePerRoomMinutes * rooms
    );
  }

  private toHkDate(value: Date): Date {
    return new Date(value.getTime() + HK_TIMEZONE_OFFSET_MS);
  }

  private fromHkDate(value: Date): Date {
    return new Date(value.getTime() - HK_TIMEZONE_OFFSET_MS);
  }

  private getTomorrowStartUtcInHk(): Date {
    const nowHk = this.toHkDate(new Date());
    const tomorrowStartHk = new Date(
      Date.UTC(
        nowHk.getUTCFullYear(),
        nowHk.getUTCMonth(),
        nowHk.getUTCDate() + 1,
        0,
        0,
        0,
        0,
      ),
    );
    return this.fromHkDate(tomorrowStartHk);
  }

  private alignToSlotStep(value: Date): Date {
    const stepMs = this.MIMO_SURVEY_SLOT_STEP_MINUTES * 60 * 1000;
    const aligned = Math.ceil(value.getTime() / stepMs) * stepMs;
    return new Date(aligned);
  }

  private getWorkdayStartUtc(dateUtc: Date): Date {
    const hk = this.toHkDate(dateUtc);
    const hkStart = new Date(
      Date.UTC(
        hk.getUTCFullYear(),
        hk.getUTCMonth(),
        hk.getUTCDate(),
        this.MIMO_SURVEY_WORKDAY_START_HOUR,
        0,
        0,
        0,
      ),
    );
    return this.fromHkDate(hkStart);
  }

  private getNextWorkdayStartUtc(dateUtc: Date): Date {
    const hk = this.toHkDate(dateUtc);
    const hkNextStart = new Date(
      Date.UTC(
        hk.getUTCFullYear(),
        hk.getUTCMonth(),
        hk.getUTCDate() + 1,
        this.MIMO_SURVEY_WORKDAY_START_HOUR,
        0,
        0,
        0,
      ),
    );
    return this.fromHkDate(hkNextStart);
  }

  private isSundayInHk(dateUtc: Date): boolean {
    const hk = this.toHkDate(dateUtc);
    return hk.getUTCDay() === 0;
  }

  private isValidSurveyWindow(startUtc: Date, durationMinutes: number): boolean {
    const endUtc = new Date(startUtc.getTime() + durationMinutes * 60 * 1000);
    const hkStart = this.toHkDate(startUtc);
    const hkEnd = this.toHkDate(endUtc);

    if (hkStart.getUTCDay() === 0) {
      return false;
    }

    // Slot must fit in one local day.
    if (
      hkStart.getUTCFullYear() !== hkEnd.getUTCFullYear() ||
      hkStart.getUTCMonth() !== hkEnd.getUTCMonth() ||
      hkStart.getUTCDate() !== hkEnd.getUTCDate()
    ) {
      return false;
    }

    const startMinutes = hkStart.getUTCHours() * 60 + hkStart.getUTCMinutes();
    const endMinutes = hkEnd.getUTCHours() * 60 + hkEnd.getUTCMinutes();
    const dayStart = this.MIMO_SURVEY_WORKDAY_START_HOUR * 60;
    const dayEnd = this.MIMO_SURVEY_WORKDAY_END_HOUR * 60;
    const lunchStart = this.MIMO_SURVEY_LUNCH_START_HOUR * 60;
    const lunchEnd = this.MIMO_SURVEY_LUNCH_END_HOUR * 60;

    if (startMinutes < dayStart || endMinutes > dayEnd) {
      return false;
    }

    // No slot may straddle lunch break.
    if (startMinutes < lunchEnd && endMinutes > lunchStart) {
      return false;
    }

    return true;
  }

  private moveToNextValidWindowStart(startUtc: Date): Date {
    const hk = this.toHkDate(startUtc);
    const minutes = hk.getUTCHours() * 60 + hk.getUTCMinutes();
    const dayStart = this.MIMO_SURVEY_WORKDAY_START_HOUR * 60;
    const dayEnd = this.MIMO_SURVEY_WORKDAY_END_HOUR * 60;
    const lunchStart = this.MIMO_SURVEY_LUNCH_START_HOUR * 60;
    const lunchEnd = this.MIMO_SURVEY_LUNCH_END_HOUR * 60;

    if (minutes < dayStart) {
      return this.getWorkdayStartUtc(startUtc);
    }

    if (minutes >= lunchStart && minutes < lunchEnd) {
      const hkAfterLunch = new Date(
        Date.UTC(
          hk.getUTCFullYear(),
          hk.getUTCMonth(),
          hk.getUTCDate(),
          this.MIMO_SURVEY_LUNCH_END_HOUR,
          0,
          0,
          0,
        ),
      );
      return this.fromHkDate(hkAfterLunch);
    }

    if (minutes >= dayEnd) {
      return this.getNextWorkdayStartUtc(startUtc);
    }

    if (this.isSundayInHk(startUtc)) {
      const hkNextDayStart = new Date(
        Date.UTC(
          hk.getUTCFullYear(),
          hk.getUTCMonth(),
          hk.getUTCDate() + 1,
          this.MIMO_SURVEY_WORKDAY_START_HOUR,
          0,
          0,
          0,
        ),
      );
      return this.fromHkDate(hkNextDayStart);
    }

    return startUtc;
  }

  private findBlockingInterval(
    startUtc: Date,
    endUtc: Date,
    intervals: TimeInterval[],
  ): TimeInterval | null {
    for (const interval of intervals) {
      if (interval.endsAt <= startUtc) continue;
      if (interval.startsAt >= endUtc) break;
      if (interval.startsAt < endUtc && interval.endsAt > startUtc) {
        return interval;
      }
    }
    return null;
  }

  private mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
    if (intervals.length <= 1) return intervals;

    const sorted = [...intervals].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );
    const merged: TimeInterval[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i += 1) {
      const current = sorted[i];
      const last = merged[merged.length - 1];
      if (current.startsAt <= last.endsAt) {
        if (current.endsAt > last.endsAt) {
          last.endsAt = current.endsAt;
        }
        continue;
      }
      merged.push({ ...current });
    }

    return merged;
  }

  private async upsertClientAddressBookAndProjectSite(
    projectId: string,
    userId: string,
    body: {
      addressFull: string;
      district?: string;
      postalCode?: string;
      unitNumber?: string;
      floorLevel?: string;
      propertyType?: string;
      propertySize?: string;
      propertyAge?: string;
      accessDetails?: string;
      existingConditions?: string;
      accessHoursType?: string;
      workingHoursWindow?: string;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
      buildingName?: string;
    },
  ): Promise<void> {
    try {
      const addressFull = String(body.addressFull || '').trim();
      if (!addressFull) return;

      const existingAddress = await this.prisma.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT id
        FROM client_site_addresses
        WHERE "userId" = ${userId}
          AND LOWER(TRIM("addressFull")) = LOWER(TRIM(${addressFull}))
          AND COALESCE(LOWER(TRIM("unitNumber")), '') = COALESCE(LOWER(TRIM(${String(body.unitNumber || '')})), '')
          AND COALESCE(LOWER(TRIM("floorLevel")), '') = COALESCE(LOWER(TRIM(${String(body.floorLevel || '')})), '')
        LIMIT 1
      `;

      const addressId = existingAddress[0]?.id || `csa_${createId()}`;

      if (!existingAddress[0]) {
        await this.prisma.$executeRaw`
          INSERT INTO client_site_addresses (
            id,
            "userId",
            label,
            "buildingName",
            "addressFull",
            "unitNumber",
            "floorLevel",
            "district",
            "postalCode",
            "propertyType",
            "propertySize",
            "propertyAge",
            "accessDetails",
            "existingConditions",
            "accessHoursType",
            "workingHoursWindow",
            "onSiteContactName",
            "onSiteContactPhone",
            "isActive",
            metadata,
            "createdAt",
            "updatedAt"
          ) VALUES (
            ${addressId},
            ${userId},
            ${String(body.buildingName || '').trim() || String(body.addressFull || '').trim().slice(0, 80)},
            ${String(body.buildingName || '').trim() || null},
            ${addressFull},
            ${String(body.unitNumber || '').trim() || null},
            ${String(body.floorLevel || '').trim() || null},
            ${String(body.district || '').trim() || null},
            ${String(body.postalCode || '').trim() || null},
            ${String(body.propertyType || '').trim() || null},
            ${String(body.propertySize || '').trim() || null},
            ${String(body.propertyAge || '').trim() || null},
            ${String(body.accessDetails || '').trim() || null},
            ${String(body.existingConditions || '').trim() || null},
            ${String(body.accessHoursType || '').trim() || null},
            ${String(body.workingHoursWindow || '').trim() || null},
            ${String(body.onSiteContactName || '').trim() || null},
            ${String(body.onSiteContactPhone || '').trim() || null},
            true,
            '{}'::jsonb,
            now(),
            now()
          )
        `;
      } else {
        await this.prisma.$executeRaw`
          UPDATE client_site_addresses
          SET
            "buildingName" = COALESCE(${String(body.buildingName || '').trim() || null}, "buildingName"),
            "district" = COALESCE(${String(body.district || '').trim() || null}, "district"),
            "postalCode" = COALESCE(${String(body.postalCode || '').trim() || null}, "postalCode"),
            "propertyType" = COALESCE(${String(body.propertyType || '').trim() || null}, "propertyType"),
            "propertySize" = COALESCE(${String(body.propertySize || '').trim() || null}, "propertySize"),
            "propertyAge" = COALESCE(${String(body.propertyAge || '').trim() || null}, "propertyAge"),
            "accessDetails" = COALESCE(${String(body.accessDetails || '').trim() || null}, "accessDetails"),
            "existingConditions" = COALESCE(${String(body.existingConditions || '').trim() || null}, "existingConditions"),
            "accessHoursType" = COALESCE(${String(body.accessHoursType || '').trim() || null}, "accessHoursType"),
            "workingHoursWindow" = COALESCE(${String(body.workingHoursWindow || '').trim() || null}, "workingHoursWindow"),
            "onSiteContactName" = COALESCE(${String(body.onSiteContactName || '').trim() || null}, "onSiteContactName"),
            "onSiteContactPhone" = COALESCE(${String(body.onSiteContactPhone || '').trim() || null}, "onSiteContactPhone"),
            "updatedAt" = now()
          WHERE id = ${addressId}
        `;
      }

      await this.prisma.$executeRaw`
        INSERT INTO project_sites (
          id,
          "projectId",
          "clientAddressId",
          "siteLabel",
          "buildingName",
          "addressFullSnapshot",
          "unitNumberSnapshot",
          "floorLevelSnapshot",
          "districtSnapshot",
          "postalCodeSnapshot",
          "propertyTypeSnapshot",
          "propertySizeSnapshot",
          "propertyAgeSnapshot",
          "accessDetailsSnapshot",
          "existingConditionsSnapshot",
          "accessHoursTypeSnapshot",
          "workingHoursWindowSnapshot",
          "onSiteContactNameSnapshot",
          "onSiteContactPhoneSnapshot",
          "isPrimary",
          "isActive",
          metadata,
          "createdByUserId",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${`ps_${createId()}`},
          ${projectId},
          ${addressId},
          ${String(body.buildingName || '').trim() || 'Primary Site'},
          ${String(body.buildingName || '').trim() || null},
          ${addressFull},
          ${String(body.unitNumber || '').trim() || null},
          ${String(body.floorLevel || '').trim() || null},
          ${String(body.district || '').trim() || null},
          ${String(body.postalCode || '').trim() || null},
          ${String(body.propertyType || '').trim() || null},
          ${String(body.propertySize || '').trim() || null},
          ${String(body.propertyAge || '').trim() || null},
          ${String(body.accessDetails || '').trim() || null},
          ${String(body.existingConditions || '').trim() || null},
          ${String(body.accessHoursType || '').trim() || null},
          ${String(body.workingHoursWindow || '').trim() || null},
          ${String(body.onSiteContactName || '').trim() || null},
          ${String(body.onSiteContactPhone || '').trim() || null},
          true,
          true,
          '{}'::jsonb,
          ${userId},
          now(),
          now()
        )
        ON CONFLICT ("projectId", "isPrimary") WHERE "isPrimary" = true
        DO UPDATE SET
          "clientAddressId" = EXCLUDED."clientAddressId",
          "siteLabel" = EXCLUDED."siteLabel",
          "buildingName" = EXCLUDED."buildingName",
          "addressFullSnapshot" = EXCLUDED."addressFullSnapshot",
          "unitNumberSnapshot" = EXCLUDED."unitNumberSnapshot",
          "floorLevelSnapshot" = EXCLUDED."floorLevelSnapshot",
            "districtSnapshot" = EXCLUDED."districtSnapshot",
            "postalCodeSnapshot" = EXCLUDED."postalCodeSnapshot",
            "propertyTypeSnapshot" = EXCLUDED."propertyTypeSnapshot",
            "propertySizeSnapshot" = EXCLUDED."propertySizeSnapshot",
            "propertyAgeSnapshot" = EXCLUDED."propertyAgeSnapshot",
          "accessDetailsSnapshot" = EXCLUDED."accessDetailsSnapshot",
            "existingConditionsSnapshot" = EXCLUDED."existingConditionsSnapshot",
            "accessHoursTypeSnapshot" = EXCLUDED."accessHoursTypeSnapshot",
            "workingHoursWindowSnapshot" = EXCLUDED."workingHoursWindowSnapshot",
          "onSiteContactNameSnapshot" = EXCLUDED."onSiteContactNameSnapshot",
          "onSiteContactPhoneSnapshot" = EXCLUDED."onSiteContactPhoneSnapshot",
          "isActive" = true,
          "updatedAt" = now()
      `;
    } catch {
      // Phase A tables may not yet exist in some environments.
    }
  }

  private async getPrimaryProjectSiteAddress(projectId: string): Promise<
    | {
        buildingName: string | null;
        addressFull: string | null;
        unitNumber: string | null;
        floorLevel: string | null;
        accessDetails: string | null;
        onSiteContactName: string | null;
        onSiteContactPhone: string | null;
      }
    | null
  > {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          buildingName: string | null;
          addressFull: string | null;
          unitNumber: string | null;
          floorLevel: string | null;
          accessDetails: string | null;
          onSiteContactName: string | null;
          onSiteContactPhone: string | null;
        }>
      >`
        SELECT
          COALESCE(ps."buildingName", csa."buildingName") as "buildingName",
          COALESCE(ps."addressFullSnapshot", csa."addressFull") as "addressFull",
          COALESCE(ps."unitNumberSnapshot", csa."unitNumber") as "unitNumber",
          COALESCE(ps."floorLevelSnapshot", csa."floorLevel") as "floorLevel",
          COALESCE(ps."accessDetailsSnapshot", csa."accessDetails") as "accessDetails",
          COALESCE(ps."onSiteContactNameSnapshot", csa."onSiteContactName") as "onSiteContactName",
          COALESCE(ps."onSiteContactPhoneSnapshot", csa."onSiteContactPhone") as "onSiteContactPhone"
        FROM project_sites ps
        LEFT JOIN client_site_addresses csa ON csa.id = ps."clientAddressId"
        WHERE ps."projectId" = ${projectId}
          AND ps."isActive" = true
        ORDER BY ps."isPrimary" DESC, ps."updatedAt" DESC
        LIMIT 1
      `;

      return rows[0] || null;
    } catch {
      return null;
    }
  }

  async listClientSiteAddresses(projectId: string, userId: string) {
    await this.assertClientProjectAccess(projectId, userId);

    const addresses = await this.prisma.$queryRaw<
      Array<{
        id: string;
        label: string | null;
        isProjectPrimary: boolean;
        buildingName: string | null;
        addressFull: string;
        unitNumber: string | null;
        floorLevel: string | null;
        district: string | null;
        postalCode: string | null;
        propertyType: string | null;
        propertySize: string | null;
        propertyAge: string | null;
        existingConditions: string | null;
        accessHoursType: string | null;
        workingHoursWindow: string | null;
        accessDetails: string | null;
        onSiteContactName: string | null;
        onSiteContactPhone: string | null;
      }>
    >`
      SELECT
        csa.id,
        csa.label,
        EXISTS (
          SELECT 1
          FROM project_sites ps
          WHERE ps."projectId" = ${projectId}
            AND ps."clientAddressId" = csa.id
            AND ps."isPrimary" = true
            AND ps."isActive" = true
        ) as "isProjectPrimary",
        csa."buildingName" as "buildingName",
        csa."addressFull" as "addressFull",
        csa."unitNumber" as "unitNumber",
        csa."floorLevel" as "floorLevel",
        csa."district" as "district",
        csa."postalCode" as "postalCode",
        csa."propertyType" as "propertyType",
        csa."propertySize" as "propertySize",
        csa."propertyAge" as "propertyAge",
        csa."existingConditions" as "existingConditions",
        csa."accessHoursType" as "accessHoursType",
        csa."workingHoursWindow" as "workingHoursWindow",
        csa."accessDetails" as "accessDetails",
        csa."onSiteContactName" as "onSiteContactName",
        csa."onSiteContactPhone" as "onSiteContactPhone"
      FROM client_site_addresses csa
      WHERE csa."userId" = ${userId}
        AND csa."isActive" = true
      ORDER BY csa."updatedAt" DESC
    `;

    return {
      success: true,
      addresses,
    };
  }

  async setProjectPrimarySiteAddress(
    projectId: string,
    userId: string,
    body: { clientAddressId: string },
  ) {
    await this.assertClientProjectAccess(projectId, userId);

    if (!body?.clientAddressId) {
      throw new BadRequestException('clientAddressId is required');
    }

    const addresses = await this.prisma.$queryRaw<
      Array<{
        id: string;
        label: string | null;
        buildingName: string | null;
        addressFull: string;
        unitNumber: string | null;
        floorLevel: string | null;
        district: string | null;
        postalCode: string | null;
        propertyType: string | null;
        propertySize: string | null;
        propertyAge: string | null;
        existingConditions: string | null;
        accessHoursType: string | null;
        workingHoursWindow: string | null;
        accessDetails: string | null;
        onSiteContactName: string | null;
        onSiteContactPhone: string | null;
      }>
    >`
      SELECT
        id,
        label,
        "buildingName" as "buildingName",
        "addressFull" as "addressFull",
        "unitNumber" as "unitNumber",
        "floorLevel" as "floorLevel",
        "district" as "district",
        "postalCode" as "postalCode",
        "propertyType" as "propertyType",
        "propertySize" as "propertySize",
        "propertyAge" as "propertyAge",
        "existingConditions" as "existingConditions",
        "accessHoursType" as "accessHoursType",
        "workingHoursWindow" as "workingHoursWindow",
        "accessDetails" as "accessDetails",
        "onSiteContactName" as "onSiteContactName",
        "onSiteContactPhone" as "onSiteContactPhone"
      FROM client_site_addresses
      WHERE id = ${body.clientAddressId}
        AND "userId" = ${userId}
        AND "isActive" = true
      LIMIT 1
    `;

    const address = addresses[0];
    if (!address) {
      throw new BadRequestException('Address not found');
    }

    await this.prisma.$executeRaw`
      INSERT INTO project_sites (
        id,
        "projectId",
        "clientAddressId",
        "siteLabel",
        "buildingName",
        "addressFullSnapshot",
        "unitNumberSnapshot",
        "floorLevelSnapshot",
        "districtSnapshot",
        "postalCodeSnapshot",
        "propertyTypeSnapshot",
        "propertySizeSnapshot",
        "propertyAgeSnapshot",
        "accessDetailsSnapshot",
        "existingConditionsSnapshot",
        "accessHoursTypeSnapshot",
        "workingHoursWindowSnapshot",
        "onSiteContactNameSnapshot",
        "onSiteContactPhoneSnapshot",
        "isPrimary",
        "isActive",
        metadata,
        "createdByUserId",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${`ps_${createId()}`},
        ${projectId},
        ${address.id},
        ${String(address.label || address.buildingName || 'Primary Site')},
        ${address.buildingName},
        ${address.addressFull},
        ${address.unitNumber},
        ${address.floorLevel},
        ${address.district},
        ${address.postalCode},
        ${address.propertyType},
        ${address.propertySize},
        ${address.propertyAge},
        ${address.accessDetails},
        ${address.existingConditions},
        ${address.accessHoursType},
        ${address.workingHoursWindow},
        ${address.onSiteContactName},
        ${address.onSiteContactPhone},
        true,
        true,
        '{}'::jsonb,
        ${userId},
        now(),
        now()
      )
      ON CONFLICT ("projectId", "isPrimary") WHERE "isPrimary" = true
      DO UPDATE SET
        "clientAddressId" = EXCLUDED."clientAddressId",
        "siteLabel" = EXCLUDED."siteLabel",
        "buildingName" = EXCLUDED."buildingName",
        "addressFullSnapshot" = EXCLUDED."addressFullSnapshot",
        "unitNumberSnapshot" = EXCLUDED."unitNumberSnapshot",
        "floorLevelSnapshot" = EXCLUDED."floorLevelSnapshot",
        "districtSnapshot" = EXCLUDED."districtSnapshot",
        "postalCodeSnapshot" = EXCLUDED."postalCodeSnapshot",
        "propertyTypeSnapshot" = EXCLUDED."propertyTypeSnapshot",
        "propertySizeSnapshot" = EXCLUDED."propertySizeSnapshot",
        "propertyAgeSnapshot" = EXCLUDED."propertyAgeSnapshot",
        "accessDetailsSnapshot" = EXCLUDED."accessDetailsSnapshot",
        "existingConditionsSnapshot" = EXCLUDED."existingConditionsSnapshot",
        "accessHoursTypeSnapshot" = EXCLUDED."accessHoursTypeSnapshot",
        "workingHoursWindowSnapshot" = EXCLUDED."workingHoursWindowSnapshot",
        "onSiteContactNameSnapshot" = EXCLUDED."onSiteContactNameSnapshot",
        "onSiteContactPhoneSnapshot" = EXCLUDED."onSiteContactPhoneSnapshot",
        "isActive" = true,
        "updatedAt" = now()
    `;

    return {
      success: true,
      projectId,
      clientAddressId: address.id,
    };
  }

  private async supportsSurveyAssignmentCalendarLink(): Promise<boolean> {
    if (this.surveyAssignmentHasCalendarEventId !== null) {
      return this.surveyAssignmentHasCalendarEventId;
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'mimo_survey_assignments'
            AND column_name = 'calendarEventId'
        ) as "exists"
      `;
      this.surveyAssignmentHasCalendarEventId = Boolean(rows?.[0]?.exists);
    } catch {
      this.surveyAssignmentHasCalendarEventId = false;
    }

    return this.surveyAssignmentHasCalendarEventId;
  }

  private async listMimoSurveyBusyIntervals(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<TimeInterval[]> {
    const intervals: TimeInterval[] = [];

    try {
      const eventRows = await this.prisma.$queryRaw<
        Array<{ startsAt: Date; endsAt: Date | null }>
      >`
        SELECT
          "startsAt" as "startsAt",
          "endsAt" as "endsAt"
        FROM mimo_calendar_events
        WHERE status <> 'cancelled'
          AND "eventType" = 'survey_visit'
          AND COALESCE("endsAt", "startsAt" + interval '30 minutes') > ${windowStart}
          AND "startsAt" < ${windowEnd}
      `;

      for (const row of eventRows) {
        const startsAt = new Date(row.startsAt);
        const endsAt = row.endsAt
          ? new Date(row.endsAt)
          : new Date(startsAt.getTime() + this.MIMO_SURVEY_SLOT_STEP_MINUTES * 60 * 1000);
        intervals.push({ startsAt, endsAt });
      }
    } catch {
      // Calendar table may not be present in all environments yet.
    }

    // Fallback for environments that still store schedule only on assignment rows.
    try {
      const hasCalendarLink = await this.supportsSurveyAssignmentCalendarLink();
      if (!hasCalendarLink) {
        const assignmentRows = await this.prisma.$queryRaw<
          Array<{ startsAt: Date; endsAt: Date | null }>
        >`
          SELECT
            "scheduledAt" as "startsAt",
            "completedAt" as "endsAt"
          FROM mimo_survey_assignments
          WHERE status IN ('assigned', 'scheduled', 'in_progress')
            AND "scheduledAt" IS NOT NULL
            AND COALESCE("completedAt", "scheduledAt" + interval '30 minutes') > ${windowStart}
            AND "scheduledAt" < ${windowEnd}
        `;

        for (const row of assignmentRows) {
          const startsAt = new Date(row.startsAt);
          const endsAt = row.endsAt
            ? new Date(row.endsAt)
            : new Date(startsAt.getTime() + this.MIMO_SURVEY_SLOT_STEP_MINUTES * 60 * 1000);
          intervals.push({ startsAt, endsAt });
        }
      }
    } catch {
      // Assignment table may not be present in all environments yet.
    }

    return this.mergeIntervals(intervals);
  }

  async getMimoSurveyAvailability(
    projectId: string,
    userId: string,
    payload: { rooms: number; cursor?: string },
  ) {
    const rooms = Number(payload.rooms);
    if (!Number.isInteger(rooms) || rooms <= 0) {
      throw new BadRequestException('Rooms must be a positive whole number');
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        status: { not: this.ARCHIVED_STATUS },
        OR: [{ userId }, { clientId: userId }],
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const surveyRows = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status
      FROM mimo_project_extras
      WHERE "projectId" = ${projectId}
        AND "extraType" = 'survey'
      LIMIT 1
    `;

    const survey = surveyRows[0];
    if (!survey) {
      throw new BadRequestException('Survey service was not requested for this project');
    }

    const blockedStatuses = new Set(['declined', 'cancelled', 'completed']);
    if (blockedStatuses.has(String(survey.status || '').toLowerCase())) {
      throw new BadRequestException('Survey service can no longer be booked');
    }

    const durationMinutes = this.getMimoSurveyDurationMinutes(rooms);
    const tomorrowStartUtc = this.getTomorrowStartUtcInHk();
    let cursor = payload.cursor ? new Date(payload.cursor) : tomorrowStartUtc;

    if (Number.isNaN(cursor.getTime())) {
      throw new BadRequestException('Invalid availability cursor');
    }

    if (cursor < tomorrowStartUtc) {
      cursor = tomorrowStartUtc;
    }

    cursor = this.alignToSlotStep(cursor);
    cursor = this.moveToNextValidWindowStart(cursor);

    const lookaheadEnd = new Date(
      cursor.getTime() + this.MIMO_SURVEY_MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
    );
    let busyWindowStart = cursor;
    let busyWindowEnd = new Date(
      cursor.getTime() + this.MIMO_SURVEY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
    );
    let busyIntervals = await this.listMimoSurveyBusyIntervals(
      busyWindowStart,
      busyWindowEnd,
    );

    const slots: Array<{ startsAt: string; endsAt: string }> = [];
    let pointer = cursor;

    while (slots.length < 5 && pointer < lookaheadEnd) {
      pointer = this.alignToSlotStep(pointer);
      pointer = this.moveToNextValidWindowStart(pointer);

      if (pointer >= busyWindowEnd) {
        busyWindowStart = pointer;
        busyWindowEnd = new Date(
          pointer.getTime() + this.MIMO_SURVEY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
        );
        busyIntervals = await this.listMimoSurveyBusyIntervals(
          busyWindowStart,
          busyWindowEnd,
        );
      }

      const slotEnd = new Date(pointer.getTime() + durationMinutes * 60 * 1000);

      if (!this.isValidSurveyWindow(pointer, durationMinutes)) {
        pointer = new Date(pointer.getTime() + this.MIMO_SURVEY_SLOT_STEP_MINUTES * 60 * 1000);
        continue;
      }

      const blockingInterval = this.findBlockingInterval(pointer, slotEnd, busyIntervals);
      if (blockingInterval) {
        pointer = blockingInterval.endsAt;
        continue;
      }

      slots.push({
        startsAt: pointer.toISOString(),
        endsAt: slotEnd.toISOString(),
      });

      // Returned slots must not overlap one another.
      pointer = slotEnd;
    }

    return {
      rooms,
      durationMinutes,
      timezone: 'Asia/Hong_Kong',
      slots,
      nextCursor: slots.length > 0 ? slots[slots.length - 1].endsAt : null,
    };
  }

  private createNotificationAudit(
    event: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): NotificationAuditEvent {
    return {
      event,
      projectId,
      timestamp: new Date().toISOString(),
      metadata,
      recipients: [],
    };
  }

  private pushNotificationAuditRecipient(
    audit: NotificationAuditEvent,
    recipient: NotificationAuditRecipient,
  ): void {
    audit.recipients.push(recipient);
  }

  private async finalizeNotificationAudit(audit: NotificationAuditEvent): Promise<void> {
    const summary = {
      recipients: audit.recipients.length,
      email: {
        sent: audit.recipients.filter((r) => r.email.status === 'sent').length,
        failed: audit.recipients.filter((r) => r.email.status === 'failed').length,
        skipped: audit.recipients.filter((r) => r.email.status === 'skipped').length,
      },
      direct: {
        sent: audit.recipients.filter((r) => r.direct.status === 'sent').length,
        failed: audit.recipients.filter((r) => r.direct.status === 'failed').length,
        skipped: audit.recipients.filter((r) => r.direct.status === 'skipped').length,
      },
    };

    console.log('[ProjectsService.notificationAudit]', {
      ...audit,
      summary,
    });

    try {
      await this.activityLogService.record({
        actorName: 'System',
        actorType: 'system',
        action: 'notification_audit',
        resource: 'Project',
        resourceId: audit.projectId,
        projectId: audit.projectId,
        details: `Notification audit for ${audit.event}`,
        metadata: {
          ...audit,
          summary,
        },
        status: summary.email.failed > 0 || summary.direct.failed > 0 ? 'warning' : 'success',
      });
    } catch (error) {
      console.error('[ProjectsService.notificationAudit] Failed to persist activity log:', {
        event: audit.event,
        projectId: audit.projectId,
        message: (error as any)?.message,
      });
    }
  }

  private async getProjectSelectableProfessionals(
    ids: string[],
    options?: { requireEmergencyCallout?: boolean },
  ) {
    const professionals = await this.prisma.professional.findMany({
      where: {
        id: { in: ids },
        professionType: { in: [...this.PROJECT_SELECTABLE_PROFESSION_TYPES] },
        ...(options?.requireEmergencyCallout
          ? { emergencyCalloutAvailable: true }
          : {}),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        businessName: true,
        professionType: true,
        primaryTrade: true,
        tradesOffered: true,
      },
    });

    if (professionals.length !== ids.length) {
      throw new BadRequestException(
        options?.requireEmergencyCallout
          ? 'Emergency projects can only select company/contractor professionals with 24/7 emergency callout availability'
          : 'Only company and contractor professionals can be selected for projects',
      );
    }

    return professionals;
  }

  private async persistProjectExtraRequest(
    projectId: string,
    extraType: 'survey' | 'design',
    payload: {
      title: string;
      summary: string;
      source: string;
      price?: number;
    },
  ) {
    await this.prisma.$executeRaw`
      INSERT INTO mimo_project_extras (
        id,
        "projectId",
        "extraType",
        status,
        source,
        title,
        summary,
        price,
        currency,
        "requestedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${`mx_${createId()}`},
        ${projectId},
        ${extraType},
        'requested',
        ${payload.source},
        ${payload.title},
        ${payload.summary},
        ${payload.price ?? null},
        'HKD',
        now(),
        now(),
        now()
      )
      ON CONFLICT ("projectId", "extraType") DO UPDATE
      SET
        status = 'requested',
        source = EXCLUDED.source,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        "requestedAt" = now(),
        "updatedAt" = now();
    `;
  }

  private async listProjectExtras(projectId: string): Promise<MimoProjectExtraRow[]> {
    try {
      return await this.prisma.$queryRaw<MimoProjectExtraRow[]>`
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
          "adminFeedMessageId" as "adminFeedMessageId",
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
      // Extras table may not exist yet on some environments.
      return [];
    }
  }

  async bookMimoSurvey(
    projectId: string,
    userId: string,
    payload: { rooms: number; proposedDate: string },
  ) {
    const rooms = Number(payload.rooms);
    if (!Number.isInteger(rooms) || rooms <= 0) {
      throw new BadRequestException('Rooms must be a positive whole number');
    }

    const scheduledAt = new Date(payload.proposedDate);
    if (!payload.proposedDate || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('A valid proposed survey date is required');
    }

    const tomorrowStartUtc = this.getTomorrowStartUtcInHk();
    if (scheduledAt < tomorrowStartUtc) {
      throw new BadRequestException('Survey date must be from tomorrow onwards');
    }

    const durationMinutes = this.getMimoSurveyDurationMinutes(rooms);
    if (!this.isValidSurveyWindow(scheduledAt, durationMinutes)) {
      throw new BadRequestException('Selected time is outside survey operating windows');
    }

    const bookingEnd = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);
    const busyIntervals = await this.listMimoSurveyBusyIntervals(scheduledAt, bookingEnd);
    const blockingInterval = this.findBlockingInterval(scheduledAt, bookingEnd, busyIntervals);
    if (blockingInterval) {
      throw new BadRequestException('Selected slot is no longer available. Please choose another slot.');
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        status: { not: this.ARCHIVED_STATUS },
        OR: [{ userId }, { clientId: userId }],
      },
      select: {
        id: true,
        projectName: true,
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const surveyRows = await this.prisma.$queryRaw<Array<{
      id: string;
      status: string;
      metadata: Record<string, unknown> | null;
    }>>`
      SELECT id, status, metadata
      FROM mimo_project_extras
      WHERE "projectId" = ${projectId}
        AND "extraType" = 'survey'
      LIMIT 1
    `;

    const survey = surveyRows[0];
    if (!survey) {
      throw new BadRequestException('Survey service was not requested for this project');
    }

    const blockedStatuses = new Set(['declined', 'cancelled', 'completed']);
    if (blockedStatuses.has(String(survey.status || '').toLowerCase())) {
      throw new BadRequestException('Survey service can no longer be booked');
    }

    const totalFee = rooms * 500;
    const mergedMetadata = {
      ...(survey.metadata || {}),
      rooms,
      feePerRoom: 500,
      calculatedFee: totalFee,
      proposedDate: scheduledAt.toISOString(),
      estimatedDurationMinutes: durationMinutes,
      estimatedEndDate: bookingEnd.toISOString(),
      bookingSource: 'next_step_modal',
      bookedAt: new Date().toISOString(),
    };

    const updatedRows = await this.prisma.$queryRaw<Array<{
      id: string;
      projectId: string;
      extraType: string;
      status: string;
      price: number | string | null;
      currency: string;
      metadata: Record<string, unknown> | null;
      scheduledAt: Date | null;
    }>>`
      UPDATE mimo_project_extras
      SET
        status = 'scheduled',
        price = ${totalFee},
        currency = 'HKD',
        metadata = ${JSON.stringify(mergedMetadata)}::jsonb,
        "scheduledAt" = ${scheduledAt.toISOString()}::timestamptz,
        "updatedAt" = now()
      WHERE id = ${survey.id}
      RETURNING
        id,
        "projectId" as "projectId",
        "extraType" as "extraType",
        status,
        price,
        currency,
        metadata,
        "scheduledAt" as "scheduledAt"
    `;

    const updated = updatedRows[0];
    if (!updated) {
      throw new BadRequestException('Unable to book survey at this time');
    }

    // Phase 2: create canonical survey_visit event and keep assignment linked to event.
    try {
      const calendarEventId = `mce_${createId()}`;
      await this.prisma.$executeRaw`
        INSERT INTO mimo_calendar_events (
          id,
          "projectId",
          "surveyExtraId",
          "eventType",
          title,
          description,
          status,
          timezone,
          "startsAt",
          "endsAt",
          metadata,
          "createdByUserId",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${calendarEventId},
          ${projectId},
          ${survey.id},
          'survey_visit',
          ${`Survey - ${project.projectName}`},
          'Client booked survey slot',
          'scheduled',
          'Asia/Hong_Kong',
          ${scheduledAt.toISOString()}::timestamptz,
          ${bookingEnd.toISOString()}::timestamptz,
          ${JSON.stringify({
            source: 'client_booking_modal',
            rooms,
            estimatedDurationMinutes: durationMinutes,
          })}::jsonb,
          ${userId},
          now(),
          now()
        )
      `;

      const hasCalendarLink = await this.supportsSurveyAssignmentCalendarLink();
      if (hasCalendarLink) {
        await this.prisma.$executeRaw`
          INSERT INTO mimo_survey_assignments (
            id,
            "projectId",
            "surveyExtraId",
            "calendarEventId",
            status,
            metadata,
            "scheduledAt",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            ${`msa_${createId()}`},
            ${projectId},
            ${survey.id},
            ${calendarEventId},
            'unassigned',
            ${JSON.stringify({ rooms, calculatedFee: totalFee })}::jsonb,
            ${scheduledAt.toISOString()}::timestamptz,
            now(),
            now()
          )
          ON CONFLICT ("projectId") DO UPDATE
          SET
            "surveyExtraId" = EXCLUDED."surveyExtraId",
            "calendarEventId" = EXCLUDED."calendarEventId",
            status = 'unassigned',
            "assignedSurveyorUserId" = NULL,
            "assignedByUserId" = NULL,
            "scheduledAt" = EXCLUDED."scheduledAt",
            "updatedAt" = now()
        `;
      }
    } catch (error) {
      const err = error as any;
      console.warn('[ProjectsService.bookMimoSurvey] Calendar/assignment sync skipped:', err?.message || err);
    }

    return {
      projectId: project.id,
      projectName: project.projectName,
      survey: updated,
      rooms,
      totalFee,
      proposedDate: scheduledAt.toISOString(),
    };
  }

  private async signalAdminFeedForProjectExtras(
    project: { id: string; projectName: string; clientName: string; region: string; userId?: string | null },
    requestedExtras: Array<'survey' | 'design'>,
  ) {
    if (requestedExtras.length === 0) return;

    const extraSummary = requestedExtras
      .map((extra) => (extra === 'survey' ? 'Surveying+' : 'Interior Design'))
      .join(', ');

    await (this.prisma as any).supportRequest.create({
      data: {
        channel: 'callback',
        fromNumber: null,
        clientName: project.clientName || 'Client',
        clientEmail: null,
        body: `Mimo project extras requested for project ${project.projectName} (${project.id}). Services: ${extraSummary}. Region: ${project.region}. Please schedule delivery.`,
        projectId: project.id,
        status: 'unassigned',
        replies: [],
        statusTimeline: [
          {
            at: new Date().toISOString(),
            action: 'created',
            status: 'unassigned',
          },
        ],
      },
    });
  }

  private normalizeTradeLabels(values: Array<string | null | undefined>): string[] {
    const canonicalizeTradeLabel = (value: string): string => {
      const trimmed = value.trim();
      const lowered = trimmed.toLowerCase();
      const normalized = lowered
        .replace(/[&/,+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Keep woodworking labels canonical for persistence and scope calculations.
      if (/\b(carpenter|carpentry|joiner|joinery)\b/.test(normalized)) {
        return 'Carpenter';
      }

      return trimmed;
    };

    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
      const cleaned = String(value || '').trim();
      if (!cleaned) continue;
      const canonical = canonicalizeTradeLabel(cleaned);
      const key = canonical.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(canonical);
    }

    return result;
  }

  private getProfessionalTradeTokens(professional: any): string[] {
    return this.normalizeTradeLabels([
      professional?.primaryTrade,
      ...(Array.isArray(professional?.tradesOffered)
        ? professional.tradesOffered
        : []),
    ]).map((value) => value.toLowerCase());
  }

  private deriveInvitationTradeScope(
    projectTrades: string[] | null | undefined,
    professional: any,
  ): {
    requestedTrades: string[];
    otherRequiredTrades: string[];
    projectTrades: string[];
  } {
    const normalizedProjectTrades = this.normalizeTradeLabels(projectTrades || []);
    if (normalizedProjectTrades.length === 0) {
      return {
        requestedTrades: [],
        otherRequiredTrades: [],
        projectTrades: [],
      };
    }

    const tradeTokens = this.getProfessionalTradeTokens(professional);
    let requestedTrades = normalizedProjectTrades.filter((trade) =>
      tradeTokens.some((token) => token.includes(trade.toLowerCase()) || trade.toLowerCase().includes(token)),
    );

    // Never leave scope empty when project trades exist; use the first required trade as fallback.
    if (requestedTrades.length === 0 && normalizedProjectTrades.length > 0) {
      requestedTrades = [normalizedProjectTrades[0]];
    }

    requestedTrades = this.normalizeTradeLabels(requestedTrades);
    const requestedKeys = new Set(requestedTrades.map((trade) => trade.toLowerCase()));
    const otherRequiredTrades = normalizedProjectTrades.filter(
      (trade) => !requestedKeys.has(trade.toLowerCase()),
    );

    return {
      requestedTrades,
      otherRequiredTrades,
      projectTrades: normalizedProjectTrades,
    };
  }

  private resolveInvitationTradeScope(
    projectTrades: string[] | null | undefined,
    professional: any,
    explicitRequestedTrades?: string[] | null,
  ): {
    requestedTrades: string[];
    otherRequiredTrades: string[];
    projectTrades: string[];
  } {
    const normalizedProjectTrades = this.normalizeTradeLabels(projectTrades || []);
    const explicit = this.normalizeTradeLabels(explicitRequestedTrades || []);

    let requestedTrades = explicit.length > 0
      ? explicit
      : this.deriveInvitationTradeScope(normalizedProjectTrades, professional).requestedTrades;

    if (requestedTrades.length === 0 && normalizedProjectTrades.length > 0) {
      requestedTrades = [normalizedProjectTrades[0]];
    }

    requestedTrades = this.normalizeTradeLabels(requestedTrades);
    const requestedKeys = new Set(requestedTrades.map((trade) => trade.toLowerCase()));
    const otherRequiredTrades = normalizedProjectTrades.filter(
      (trade) => !requestedKeys.has(trade.toLowerCase()),
    );

    return {
      requestedTrades,
      otherRequiredTrades,
      projectTrades: normalizedProjectTrades,
    };
  }

  private buildInvitationTradeCopy(scope: {
    requestedTrades: string[];
    otherRequiredTrades: string[];
    projectTrades: string[];
  }) {
    return {
      requestedTradesLine:
        scope.requestedTrades.length > 0
          ? `Trade required from you: ${scope.requestedTrades.join(', ')}`
          : 'Trade required from you: To be confirmed',
      otherRequiredTradesLine:
        scope.otherRequiredTrades.length > 0
          ? `Other trades required on this project: ${scope.otherRequiredTrades.join(', ')}`
          : null,
      projectTradesLine:
        scope.projectTrades.length > 0
          ? `Trades required: ${scope.projectTrades.join(', ')}`
          : 'Trades: To be discussed',
      directMessage:
        scope.requestedTrades.length > 0
          ? `Quote requested for ${scope.requestedTrades.join(', ')}${scope.otherRequiredTrades.length > 0 ? `. Other project trades: ${scope.otherRequiredTrades.join(', ')}` : ''}.`
          : scope.projectTrades.length > 0
            ? `Your quote scope will be confirmed from your supplied trades. Project requires: ${scope.projectTrades.join(', ')}.`
            : 'Trades to be discussed.',
    };
  }

  private toAiString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toAiStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  }

  private getAiIntakeProjectJson(aiIntake: any): Record<string, unknown> | null {
    return aiIntake?.project && typeof aiIntake.project === 'object' && !Array.isArray(aiIntake.project)
      ? (aiIntake.project as Record<string, unknown>)
      : null;
  }

  private getAiIntakeRawOutput(aiIntake: any): Record<string, unknown> | null {
    return aiIntake?.rawOutput && typeof aiIntake.rawOutput === 'object' && !Array.isArray(aiIntake.rawOutput)
      ? (aiIntake.rawOutput as Record<string, unknown>)
      : null;
  }

  private getAiIntakeProjectScale(aiIntake: any): 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | null {
    const rawOutput = this.getAiIntakeRawOutput(aiIntake);
    const projectJson = this.getAiIntakeProjectJson(aiIntake);
    const value = rawOutput?.projectScale ?? projectJson?.projectScale ?? projectJson?.projectScaleSuggested;
    return value === 'SCALE_1' || value === 'SCALE_2' || value === 'SCALE_3' ? value : null;
  }

  private buildEmergencyAiInviteSnippet(aiIntake: any): {
    inAppLines: string[];
    emailDescription: string | null;
    directMessageSuffix: string | null;
  } {
    const projectJson = this.getAiIntakeProjectJson(aiIntake);
    const rawOutput = this.getAiIntakeRawOutput(aiIntake);
    const safety =
      (projectJson?.safetyAssessment && typeof projectJson.safetyAssessment === 'object'
        ? (projectJson.safetyAssessment as Record<string, unknown>)
        : null) ||
      (rawOutput?.safetyAssessment && typeof rawOutput.safetyAssessment === 'object'
        ? (rawOutput.safetyAssessment as Record<string, unknown>)
        : null);

    const summary =
      this.toAiString(aiIntake?.summary) ||
      this.toAiString(aiIntake?.scope) ||
      this.toAiString(projectJson?.scopeText);
    const keyFacts = this.toAiStringArray(rawOutput?.keyFacts).slice(0, 2);
    const emergencyReason = this.toAiString(safety?.emergencyReason);
    const concerns = this.toAiStringArray(safety?.concerns).slice(0, 2);
    const mitigations = this.toAiStringArray(safety?.temporaryMitigations).slice(0, 1);
    const requiresImmediateHumanContact = safety?.requiresImmediateHumanContact === true;

    const inAppLines: string[] = [];
    if (summary) {
      inAppLines.push(`AI brief: ${summary}`);
    }

    const safetyBits = [
      requiresImmediateHumanContact ? 'Immediate human contact recommended.' : null,
      emergencyReason,
      ...concerns,
      mitigations.length > 0 ? `Temporary steps: ${mitigations.join('; ')}` : null,
    ].filter((value): value is string => Boolean(value));

    if (safetyBits.length > 0) {
      inAppLines.push(`Safety: ${safetyBits.join(' | ')}`);
    }

    if (keyFacts.length > 0) {
      inAppLines.push(`Key facts: ${keyFacts.join('; ')}`);
    }

    const emailParts = [summary, ...keyFacts, ...safetyBits].filter((value): value is string => Boolean(value));
    return {
      inAppLines,
      emailDescription: emailParts.length > 0 ? emailParts.join('\n\n') : null,
      directMessageSuffix: summary ? ` AI brief: ${summary}` : null,
    };
  }

  private betterStatus(
    a?: string | null,
    b?: string | null,
  ): string | null | undefined {
    if (!a) return b;
    if (!b) return a;
    const ia = this.STATUS_ORDER.indexOf(a);
    const ib = this.STATUS_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a;
    if (ia === -1) return b;
    if (ib === -1) return a;
    return ia <= ib ? a : b;
  }

  private dedupeProfessionals(list: any[] | undefined | null): any[] {
    if (!Array.isArray(list) || list.length === 0) return [];
    const map = new Map<string, unknown>();
    for (const entry of list) {
      const e = entry;
      const key = (e?.professional?.id ||
        e?.professional?.email ||
        e?.id) as string;
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...e });
      } else {
        const merged: any = { ...(existing as any) };
        merged.status =
          this.betterStatus((existing as any)?.status, e?.status) ??
          e?.status ??
          (existing as any)?.status;
        if (merged.quoteAmount == null && e?.quoteAmount != null) {
          merged.quoteAmount = e.quoteAmount;
        }
        if (!merged.quoteBreakdown && e?.quoteBreakdown) {
          merged.quoteBreakdown = e.quoteBreakdown;
        }
        if (!merged.quoteNotes && e?.quoteNotes) {
          merged.quoteNotes = e.quoteNotes;
        }
        if (!merged.quoteEstimatedStartAt && e?.quoteEstimatedStartAt) {
          merged.quoteEstimatedStartAt = e.quoteEstimatedStartAt;
        }
        if (
          merged.quoteEstimatedDurationMinutes == null &&
          e?.quoteEstimatedDurationMinutes != null
        ) {
          merged.quoteEstimatedDurationMinutes = e.quoteEstimatedDurationMinutes;
        }
        if (!merged.quotedAt && e?.quotedAt) {
          merged.quotedAt = e.quotedAt;
        }
        if (!merged.quoteReminderSentAt && e?.quoteReminderSentAt) {
          merged.quoteReminderSentAt = e.quoteReminderSentAt;
        }
        if (!merged.quoteExtendedUntil && e?.quoteExtendedUntil) {
          merged.quoteExtendedUntil = e.quoteExtendedUntil;
        }
        if (!merged.respondedAt && e?.respondedAt) {
          merged.respondedAt = e.respondedAt;
        }
        map.set(key, merged);
      }
    }
    return Array.from(map.values());
  }

  private canon(s?: string | null): string {
    return (s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private formatDateTime(value?: Date | string | null): string {
    if (!value) return 'TBD';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return 'TBD';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private isMissingProjectProfessionalTradeScopeFieldError(error: any): boolean {
    const message = String(error?.message || '');
    return (
      message.includes('quoteRequestedTrades') ||
      message.includes('projectTradesSnapshot') ||
      (error?.code === 'P2022' &&
        (message.includes('ProjectProfessional') || message.includes('projectprofessional')))
    );
  }

  private throwProjectProfessionalTradeScopeSchemaError(error: any): never {
    const details = String(error?.message || 'Unknown schema mismatch');
    throw new ServiceUnavailableException(
      `ProjectProfessional trade scope columns are unavailable. Run DB migration for quoteRequestedTrades/projectTradesSnapshot. Details: ${details}`,
    );
  }

  private isMissingProjectActivityColumnError(error: any): boolean {
    const message = String(error?.message || '');
    const missingColumn = String(error?.meta?.column || '');
    return (
      error?.code === 'P2022' &&
      (message.includes('Project.lastActivityAt') ||
        message.includes('Project.lastClientActivityAt') ||
        message.includes('Project.lastProfessionalActivityAt') ||
        message.includes('Project.lastAdminActivityAt') ||
        message.includes('Project.lastSystemActivityAt') ||
        /Project\.last\w+ActivityAt/.test(message) ||
        missingColumn.startsWith('Project.last') && missingColumn.endsWith('ActivityAt'))
    );
  }

  private async ensureProjectActivityColumns(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3)',
    );
    await this.prisma.$executeRawUnsafe(
      'ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lastClientActivityAt" TIMESTAMP(3)',
    );
    await this.prisma.$executeRawUnsafe(
      'ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lastProfessionalActivityAt" TIMESTAMP(3)',
    );
    await this.prisma.$executeRawUnsafe(
      'ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lastAdminActivityAt" TIMESTAMP(3)',
    );
    await this.prisma.$executeRawUnsafe(
      'ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lastSystemActivityAt" TIMESTAMP(3)',
    );
  }

  private buildProjectProfessionalTradeScopeWrite(input: {
    status: 'pending' | 'selected';
    requestedTrades: string[];
    projectTrades: string[];
    includeTradeScope: boolean;
  }) {
    if (!input.includeTradeScope) {
      return { status: input.status };
    }
    return {
      status: input.status,
      quoteRequestedTrades: input.requestedTrades,
      projectTradesSnapshot: input.projectTrades,
    };
  }

  private async addProjectChatMessage(
    projectId: string,
    senderType: 'client' | 'professional',
    senderUserId: string | null,
    senderProId: string | null,
    content: string,
  ): Promise<void> {
    const thread = await this.chatService.getOrCreateProjectThread(projectId);
    await this.chatService.addProjectMessage(
      thread.id,
      senderType,
      senderUserId,
      senderProId,
      content,
    );
  }

  private async addProjectProfessionalMessage(
    projectProfessionalId: string,
    senderType: 'client' | 'professional',
    senderClientId: string | null,
    senderProfessionalId: string | null,
    content: string,
  ): Promise<void> {
    await this.prisma.message.create({
      data: {
        projectProfessionalId,
        senderType,
        senderClientId,
        senderProfessionalId,
        content,
      },
    });
  }

  private normalizeQuoteSchedule(
    input: {
      quoteEstimatedStartAt?: string | Date | null;
      quoteEstimatedDurationMinutes?: number | string | null;
      quoteEstimatedDurationUnit?: string | null;
    },
    options?: { required?: boolean },
  ) {
    const rawStart = input.quoteEstimatedStartAt;
    const rawDuration = input.quoteEstimatedDurationMinutes;
    const rawUnit = input.quoteEstimatedDurationUnit || 'hours';
    const hasStart =
      rawStart !== undefined &&
      rawStart !== null &&
      String(rawStart).trim().length > 0;
    const hasDuration =
      rawDuration !== undefined &&
      rawDuration !== null &&
      String(rawDuration).trim().length > 0;

    if (!hasStart && !hasDuration) {
      if (options?.required) {
        throw new BadRequestException(
          'Estimated start date and duration are required when submitting a quote',
        );
      }

      return {
        quoteEstimatedStartAt: null,
        quoteEstimatedDurationMinutes: null,
        quoteEstimatedDurationUnit: 'hours',
      };
    }

    if (!hasStart || !hasDuration) {
      throw new BadRequestException(
        'Estimated start date and duration must be provided together',
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

  private normalizeProjectScale(value?: string | null): 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | null {
    if (!value) return null;
    const normalized = String(value).trim().toUpperCase();
    if (normalized === 'SCALE_1' || normalized === 'SCALE_2' || normalized === 'SCALE_3') {
      return normalized;
    }
    return null;
  }

  private inferProjectScaleFromContext(input: {
    explicitScale?: string | null;
    quoteEstimatedDurationMinutes?: number | null;
    tradesRequired?: string[] | null;
    isEmergency?: boolean | null;
  }): 'SCALE_1' | 'SCALE_2' | 'SCALE_3' {
    const explicit = this.normalizeProjectScale(input.explicitScale);
    if (explicit) return explicit;

    const duration = Number(input.quoteEstimatedDurationMinutes || 0);
    const trades = Array.isArray(input.tradesRequired)
      ? input.tradesRequired.filter(Boolean).length
      : 0;

    if (duration > 0) {
      if (duration <= 24 * 60 && trades <= 1) return 'SCALE_1';
      if (duration <= 14 * 24 * 60 && trades <= 3) return 'SCALE_2';
      return 'SCALE_3';
    }

    if (input.isEmergency && trades <= 1) return 'SCALE_1';
    if (trades <= 1) return 'SCALE_1';
    if (trades <= 3) return 'SCALE_2';
    return 'SCALE_3';
  }

  private escrowPolicyForScale(scale: 'SCALE_1' | 'SCALE_2' | 'SCALE_3'): 'FULL_UPFRONT' | 'ROLLING_TWO_MILESTONES' {
    return scale === 'SCALE_3' ? 'ROLLING_TWO_MILESTONES' : 'FULL_UPFRONT';
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private buildScaleMilestones(input: {
    scale: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
    totalAmount: number;
    startAt?: Date | null;
    durationMinutes?: number | null;
  }) {
    const { scale, totalAmount } = input;
    const safeTotal = this.roundMoney(Math.max(0, Number(totalAmount) || 0));

    const percentages =
      scale === 'SCALE_1'
        ? [30, 70]
        : scale === 'SCALE_2'
          ? [20, 50, 30]
          : [10, 20, 20, 20, 30];

    const titles =
      scale === 'SCALE_1'
        ? ['Site Preparation', 'Final Handover']
        : scale === 'SCALE_2'
          ? ['Site Preparation', 'Milestone 1', 'Final Handover']
          : [
              'Site Preparation',
              'Milestone 1',
              'Milestone 2',
              'Milestone 3',
              'Final Handover',
            ];

    const types =
      scale === 'SCALE_1'
        ? ['deposit', 'final']
        : scale === 'SCALE_2'
          ? ['deposit', 'progress', 'final']
          : ['deposit', 'progress', 'progress', 'progress', 'final'];

    const count = percentages.length;
    const startAt = input.startAt && !Number.isNaN(input.startAt.getTime()) ? input.startAt : null;
    const safeDurationMinutes = Math.max(0, Number(input.durationMinutes) || 0);

    const baseRows = percentages.map((percent, index) => {
      const amount = this.roundMoney((safeTotal * percent) / 100);
      let plannedDueAt: Date | null = null;

      if (startAt) {
        if (index === 0) {
          plannedDueAt = new Date(startAt);
        } else if (safeDurationMinutes > 0 && count > 1) {
          const offset = Math.round((safeDurationMinutes * index) / (count - 1));
          plannedDueAt = new Date(startAt.getTime() + offset * 60 * 1000);
        }
      }

      return {
        sequence: index + 1,
        title: titles[index],
        type: types[index] as 'deposit' | 'progress' | 'final',
        percentOfTotal: percent,
        amount,
        plannedDueAt,
      };
    });

    const sumBeforeLast = this.roundMoney(
      baseRows.slice(0, -1).reduce((acc, row) => acc + row.amount, 0),
    );
    const lastAmount = this.roundMoney(Math.max(0, safeTotal - sumBeforeLast));
    if (baseRows.length > 0) {
      baseRows[baseRows.length - 1].amount = lastAmount;
    }

    return baseRows;
  }

  private addMonths(source: Date, months: number): Date {
    const date = new Date(source);
    date.setMonth(date.getMonth() + months);
    return date;
  }

  private toValidDate(input?: Date | string | null): Date | null {
    if (!input) return null;
    const value = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }

  private async ensureFinancialProjectMilestoneLinks(tx: any, input: {
    projectId: string;
    projectProfessionalId?: string | null;
    paymentMilestones: Array<{
      id: string;
      sequence: number;
      title: string;
      plannedDueAt?: Date | null;
      projectMilestoneId?: string | null;
    }>;
  }) {
    const existingFinancialRows = await tx.projectMilestone.findMany({
      where: {
        projectId: input.projectId,
        projectProfessionalId: input.projectProfessionalId || null,
        isFinancial: true,
      },
      orderBy: { sequence: 'asc' },
    });
    const financialBySequence = new Map<number, any>(
      existingFinancialRows.map((row: any) => [row.sequence, row]),
    );

    const orderedPaymentMilestones = [...input.paymentMilestones].sort(
      (a, b) => (a.sequence || 0) - (b.sequence || 0),
    );

    let previousPlannedDueAt: Date | null = null;

    for (const paymentMilestone of orderedPaymentMilestones) {
      let linkedProjectMilestone: any = null;
      const sequence = Number(paymentMilestone.sequence) || 0;
      const plannedEndDate = paymentMilestone.plannedDueAt || null;
      const computedPlannedStartDate =
        sequence <= 1 ? plannedEndDate : previousPlannedDueAt;

      if (paymentMilestone.projectMilestoneId) {
        linkedProjectMilestone = await tx.projectMilestone.findFirst({
          where: {
            id: paymentMilestone.projectMilestoneId,
            projectId: input.projectId,
          },
        });
      }

      if (!linkedProjectMilestone) {
        const existingBySequence = financialBySequence.get(paymentMilestone.sequence);
        if (existingBySequence) {
          linkedProjectMilestone = await tx.projectMilestone.update({
            where: { id: existingBySequence.id },
            data: {
              title: paymentMilestone.title,
              plannedStartDate:
                computedPlannedStartDate || existingBySequence.plannedStartDate || null,
              plannedEndDate: plannedEndDate || existingBySequence.plannedEndDate || null,
              isFinancial: true,
            },
          });
        } else {
          linkedProjectMilestone = await tx.projectMilestone.create({
            data: {
              projectId: input.projectId,
              projectProfessionalId: input.projectProfessionalId || null,
              title: paymentMilestone.title,
              sequence: paymentMilestone.sequence,
              status: 'not_started',
              percentComplete: 0,
              plannedStartDate: computedPlannedStartDate,
              plannedEndDate,
              isFinancial: true,
            },
          });
        }
      } else if (!linkedProjectMilestone.isFinancial) {
        linkedProjectMilestone = await tx.projectMilestone.update({
          where: { id: linkedProjectMilestone.id },
          data: {
            isFinancial: true,
            plannedStartDate:
              computedPlannedStartDate || linkedProjectMilestone.plannedStartDate || null,
            plannedEndDate: plannedEndDate || linkedProjectMilestone.plannedEndDate || null,
          },
        });
      } else {
        linkedProjectMilestone = await tx.projectMilestone.update({
          where: { id: linkedProjectMilestone.id },
          data: {
            plannedStartDate:
              linkedProjectMilestone.plannedStartDate || computedPlannedStartDate || null,
            plannedEndDate: plannedEndDate || linkedProjectMilestone.plannedEndDate || null,
          },
        });
      }

      if (!linkedProjectMilestone) {
        throw new BadRequestException('Unable to link payment milestone to project milestone');
      }

      await tx.paymentMilestone.update({
        where: { id: paymentMilestone.id },
        data: {
          projectMilestoneId: linkedProjectMilestone.id,
          plannedDueAt:
            paymentMilestone.plannedDueAt ||
            linkedProjectMilestone.plannedEndDate ||
            null,
        },
      });

      previousPlannedDueAt = plannedEndDate || previousPlannedDueAt;
    }
  }

  private async ensureProjectPaymentPlan(tx: any, input: {
    projectId: string;
    projectProfessionalId?: string | null;
    totalAmount: number;
    explicitScale?: string | null;
    quoteEstimatedDurationMinutes?: number | null;
    quoteEstimatedStartAt?: Date | string | null;
    tradesRequired?: string[] | null;
    isEmergency?: boolean | null;
  }) {
    const scale = this.inferProjectScaleFromContext({
      explicitScale: input.explicitScale,
      quoteEstimatedDurationMinutes: input.quoteEstimatedDurationMinutes,
      tradesRequired: input.tradesRequired,
      isEmergency: input.isEmergency,
    });
    const escrowPolicy = this.escrowPolicyForScale(scale);
    const totalAmount = this.roundMoney(input.totalAmount);
    const quoteStart =
      input.quoteEstimatedStartAt instanceof Date
        ? input.quoteEstimatedStartAt
        : input.quoteEstimatedStartAt
          ? new Date(input.quoteEstimatedStartAt)
          : null;
    const safeDurationMinutes = Math.max(0, Number(input.quoteEstimatedDurationMinutes) || 0);
    const completionAt =
      quoteStart && safeDurationMinutes > 0
        ? new Date(quoteStart.getTime() + safeDurationMinutes * 60 * 1000)
        : null;
    const defaultRetentionReleaseAt = completionAt ? this.addMonths(completionAt, 1) : null;

    const milestoneRows = this.buildScaleMilestones({
      scale,
      totalAmount,
      startAt: quoteStart,
      durationMinutes: input.quoteEstimatedDurationMinutes || null,
    });

    const existing = await tx.projectPaymentPlan.findUnique({
      where: { projectId: input.projectId },
      include: { milestones: true },
    });

    if (existing?.lockedAt) {
      return existing;
    }

    const baseData = {
      projectProfessionalId: input.projectProfessionalId || null,
      projectScale: scale,
      escrowFundingPolicy: escrowPolicy,
      totalAmount: new Decimal(totalAmount),
      depositCapPercent: scale === 'SCALE_1' ? 30 : scale === 'SCALE_2' ? 20 : 10,
      fundingBufferMilestones: scale === 'SCALE_3' ? 2 : null,
      retentionEnabled: existing?.retentionEnabled ?? false,
      retentionPercent:
        scale === 'SCALE_3'
          ? new Decimal(existing?.retentionPercent ?? 5)
          : null,
      retentionAmount:
        scale === 'SCALE_3' && existing?.retentionEnabled
          ? new Decimal(this.roundMoney((totalAmount * Number(existing?.retentionPercent ?? 5)) / 100))
          : null,
      retentionReleaseAt:
        scale === 'SCALE_3'
          ? existing?.retentionReleaseAt || defaultRetentionReleaseAt
          : null,
      status: 'draft',
    };

    const plan = existing
      ? await tx.projectPaymentPlan.update({
          where: { id: existing.id },
          data: baseData,
        })
      : await tx.projectPaymentPlan.create({
          data: {
            projectId: input.projectId,
            ...baseData,
          },
        });

    await tx.paymentMilestone.deleteMany({ where: { paymentPlanId: plan.id } });
    const createdMilestones: any[] = [];
    if (milestoneRows.length > 0) {
      for (const row of milestoneRows) {
        const created = await tx.paymentMilestone.create({
          data: {
          paymentPlanId: plan.id,
          sequence: row.sequence,
          title: row.title,
          type: row.type,
          amount: new Decimal(row.amount),
          percentOfTotal: row.percentOfTotal,
          plannedDueAt: row.plannedDueAt,
          },
        });
        createdMilestones.push(created);
      }
      await this.ensureFinancialProjectMilestoneLinks(tx, {
        projectId: input.projectId,
        projectProfessionalId: input.projectProfessionalId || null,
        paymentMilestones: createdMilestones,
      });
    }

    await tx.project.update({
      where: { id: input.projectId },
      data: {
        projectScale: scale,
        escrowFundingPolicy: escrowPolicy,
      } as any,
    });

    return tx.projectPaymentPlan.findUnique({
      where: { id: plan.id },
      include: {
        milestones: {
          orderBy: { sequence: 'asc' },
        },
      },
    });
  }

  async getProjectPaymentPlan(
    projectId: string,
    actorId: string,
    role: 'client' | 'professional' | 'admin',
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        clientId: true,
        professionals: {
          select: {
            professionalId: true,
          },
        },
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (role === 'client') {
      const isOwner = project.userId === actorId || project.clientId === actorId;
      if (!isOwner) {
        throw new BadRequestException('You do not have access to this project');
      }
    }

    if (role === 'professional') {
      const hasAccess = project.professionals.some((pp: any) => pp.professionalId === actorId);
      if (!hasAccess) {
        throw new BadRequestException('You do not have access to this project');
      }
    }

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      include: {
        milestones: {
          orderBy: { sequence: 'asc' },
          include: {
            projectMilestone: {
              select: {
                id: true,
                title: true,
                sequence: true,
                plannedStartDate: true,
                plannedEndDate: true,
                status: true,
                isFinancial: true,
              },
            },
          },
        },
      },
    });

    if (!plan) return null;

    // B.2: Compute timeline risk — count milestones past their planned due date
    // that have not yet been released or cancelled.
    const now = new Date();
    const overdueCount: number = ((plan.milestones || []) as any[]).filter((m: any) => {
      if (!m.plannedDueAt) return false;
      if (['released', 'cancelled'].includes(m.status)) return false;
      return new Date(m.plannedDueAt) < now;
    }).length;

    const risk: 'none' | 'moderate' | 'high' =
      overdueCount === 0 ? 'none' : overdueCount <= 2 ? 'moderate' : 'high';

    return {
      ...plan,
      timelineRisk: { overdueCount, risk },
    };
  }

  async updateScaleFinancialMilestones(
    projectId: string,
    actorId: string,
    role: 'client' | 'professional' | 'admin',
    body: {
      scale2Milestone2?: {
        title?: string;
        plannedDueAt?: string | null;
        projectMilestoneId?: string | null;
      };
      scale3IntermediateMilestones?: Array<{
        title: string;
        amount: number;
        plannedDueAt?: string | null;
        projectMilestoneId: string;
      }>;
    },
  ) {
    if (!['professional', 'admin'].includes(role)) {
      throw new BadRequestException('Only professionals or admins can edit financial milestones');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        clientId: true,
        professionals: { select: { professionalId: true } },
      },
    });
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (role === 'professional') {
      const hasAccess = project.professionals.some((pp: any) => pp.professionalId === actorId);
      if (!hasAccess) {
        throw new BadRequestException('You do not have access to this project');
      }
    }

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      include: { milestones: { orderBy: { sequence: 'asc' } } },
    });
    if (!plan) {
      throw new BadRequestException('Payment plan not found for this project');
    }
    if (role === 'professional' && plan.lockedAt) {
      throw new BadRequestException('Locked plans cannot be edited by professionals');
    }

    return this.prisma.$transaction(async (tx) => {
      if (plan.projectScale === 'SCALE_2' && body.scale2Milestone2) {
        const milestone2 = plan.milestones.find((item: any) => item.sequence === 2);
        if (!milestone2) {
          throw new BadRequestException('Scale 2 payment milestone 2 was not found');
        }

        let linkedProjectMilestoneId =
          body.scale2Milestone2.projectMilestoneId !== undefined
            ? body.scale2Milestone2.projectMilestoneId
            : milestone2.projectMilestoneId;

        if (linkedProjectMilestoneId) {
          const linked = await tx.projectMilestone.findFirst({
            where: {
              id: linkedProjectMilestoneId,
              projectId,
            },
          });
          if (!linked) {
            throw new BadRequestException('Linked project milestone not found on this project');
          }
          await tx.projectMilestone.update({
            where: { id: linked.id },
            data: {
              isFinancial: true,
              plannedEndDate:
                this.toValidDate(body.scale2Milestone2.plannedDueAt) || linked.plannedEndDate || null,
            },
          });
        }

        await tx.paymentMilestone.update({
          where: { id: milestone2.id },
          data: {
            title: body.scale2Milestone2.title?.trim() || milestone2.title,
            plannedDueAt:
              this.toValidDate(body.scale2Milestone2.plannedDueAt) ||
              milestone2.plannedDueAt ||
              null,
            projectMilestoneId: linkedProjectMilestoneId || null,
          },
        });
      }

      if (plan.projectScale === 'SCALE_3' && Array.isArray(body.scale3IntermediateMilestones)) {
        const statuses = (plan.milestones || []).map((row: any) => row.status);
        if (statuses.some((value: string) => value !== 'scheduled')) {
          throw new BadRequestException(
            'Scale 3 milestone structure can only be edited before funding/release starts',
          );
        }

        const first = plan.milestones.find((row: any) => row.sequence === 1);
        const last = plan.milestones[plan.milestones.length - 1];
        if (!first || !last) {
          throw new BadRequestException('Scale 3 plan is missing required first/last milestones');
        }

        const intermediateRows = body.scale3IntermediateMilestones.map((entry, index) => {
          const title = String(entry.title || '').trim();
          const amount = this.roundMoney(Number(entry.amount) || 0);
          if (!title) {
            throw new BadRequestException(`Intermediate milestone ${index + 1} requires a title`);
          }
          if (amount <= 0) {
            throw new BadRequestException(`Intermediate milestone ${index + 1} requires amount > 0`);
          }
          if (!entry.projectMilestoneId) {
            throw new BadRequestException(`Intermediate milestone ${index + 1} requires projectMilestoneId`);
          }
          return {
            ...entry,
            title,
            amount,
            plannedDueAt: this.toValidDate(entry.plannedDueAt) || null,
          };
        });

        const linkedIds = new Set<string>();
        for (const row of intermediateRows) {
          if (linkedIds.has(row.projectMilestoneId)) {
            throw new BadRequestException('Each intermediate payment milestone must link to a unique project milestone');
          }
          linkedIds.add(row.projectMilestoneId);

          const linked = await tx.projectMilestone.findFirst({
            where: {
              id: row.projectMilestoneId,
              projectId,
            },
          });
          if (!linked) {
            throw new BadRequestException(`Project milestone ${row.projectMilestoneId} not found on this project`);
          }
          await tx.projectMilestone.update({
            where: { id: linked.id },
            data: {
              isFinancial: true,
              plannedEndDate: row.plannedDueAt || linked.plannedEndDate || null,
            },
          });
        }

        const totalAmount = Number(plan.totalAmount || 0);
        const depositAmount = Number(first.amount || 0);
        const intermediateTotal = this.roundMoney(
          intermediateRows.reduce((sum, item) => sum + item.amount, 0),
        );
        const finalAmount = this.roundMoney(totalAmount - depositAmount - intermediateTotal);
        if (finalAmount < 0) {
          throw new BadRequestException('Intermediate milestone totals exceed available plan amount');
        }

        const rebuiltRows: Array<any> = [
          {
            sequence: 1,
            title: first.title,
            type: 'deposit',
            amount: this.roundMoney(depositAmount),
            percentOfTotal: totalAmount > 0 ? this.roundMoney((depositAmount / totalAmount) * 100) : null,
            plannedDueAt: first.plannedDueAt,
            projectMilestoneId: first.projectMilestoneId || null,
          },
          ...intermediateRows.map((row, index) => ({
            sequence: index + 2,
            title: row.title,
            type: 'progress',
            amount: row.amount,
            percentOfTotal: totalAmount > 0 ? this.roundMoney((row.amount / totalAmount) * 100) : null,
            plannedDueAt: row.plannedDueAt,
            projectMilestoneId: row.projectMilestoneId,
          })),
          {
            sequence: intermediateRows.length + 2,
            title: last.title,
            type: 'final',
            amount: finalAmount,
            percentOfTotal: totalAmount > 0 ? this.roundMoney((finalAmount / totalAmount) * 100) : null,
            plannedDueAt: last.plannedDueAt,
            projectMilestoneId: last.projectMilestoneId || null,
          },
        ];

        await tx.paymentMilestone.deleteMany({
          where: { paymentPlanId: plan.id },
        });

        for (const row of rebuiltRows) {
          await tx.paymentMilestone.create({
            data: {
              paymentPlanId: plan.id,
              sequence: row.sequence,
              title: row.title,
              type: row.type,
              amount: new Decimal(row.amount),
              percentOfTotal: row.percentOfTotal,
              plannedDueAt: row.plannedDueAt,
              projectMilestoneId: row.projectMilestoneId,
            },
          });
        }
      }

      return (tx as any).projectPaymentPlan.findUnique({
        where: { id: plan.id },
        include: {
          milestones: {
            orderBy: { sequence: 'asc' },
            include: {
              projectMilestone: {
                select: {
                  id: true,
                  title: true,
                  sequence: true,
                  plannedStartDate: true,
                  plannedEndDate: true,
                  status: true,
                  isFinancial: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async configurePaymentPlanRetention(
    projectId: string,
    actorId: string,
    role: 'client' | 'professional' | 'admin',
    body: {
      retentionEnabled: boolean;
      retentionPercent?: number;
      retentionReleaseAt?: string | null;
    },
  ) {
    if (role !== 'admin') {
      throw new BadRequestException('Only admins can configure retention settings');
    }

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
      include: {
        project: {
          select: {
            quoteEstimatedStartAt: true,
            quoteEstimatedDurationMinutes: true,
          },
        },
      },
    });
    if (!plan) {
      throw new BadRequestException('Payment plan not found for this project');
    }
    if (plan.projectScale !== 'SCALE_3') {
      throw new BadRequestException('Retention settings are only supported for Scale 3 plans');
    }

    const percent = this.roundMoney(
      Math.max(0, Math.min(100, Number(body.retentionPercent ?? plan.retentionPercent ?? 5))),
    );
    const totalAmount = Number(plan.totalAmount || 0);

    const startAt = this.toValidDate(plan.project?.quoteEstimatedStartAt || null);
    const durationMinutes = Math.max(0, Number(plan.project?.quoteEstimatedDurationMinutes || 0));
    const completionAt =
      startAt && durationMinutes > 0
        ? new Date(startAt.getTime() + durationMinutes * 60 * 1000)
        : null;
    const defaultReleaseAt = completionAt ? this.addMonths(completionAt, 1) : null;
    const releaseAt =
      this.toValidDate(body.retentionReleaseAt) ||
      this.toValidDate(plan.retentionReleaseAt) ||
      defaultReleaseAt;

    return (this.prisma as any).projectPaymentPlan.update({
      where: { id: plan.id },
      data: {
        retentionEnabled: !!body.retentionEnabled,
        retentionPercent: new Decimal(percent),
        retentionAmount: body.retentionEnabled
          ? new Decimal(this.roundMoney((totalAmount * percent) / 100))
          : null,
        retentionReleaseAt: body.retentionEnabled ? releaseAt : null,
      },
      include: {
        milestones: {
          orderBy: { sequence: 'asc' },
          include: {
            projectMilestone: {
              select: {
                id: true,
                title: true,
                sequence: true,
                plannedStartDate: true,
                plannedEndDate: true,
                status: true,
                isFinancial: true,
              },
            },
          },
        },
      },
    });
  }

  async reviewProjectPaymentPlan(
    projectId: string,
    actorId: string,
    role: 'client' | 'professional' | 'admin',
    body: {
      clientComment?: string;
      adminComment?: string;
      adminOverrideApplied?: boolean;
      lockPlan?: boolean;
    },
  ) {
    if (role === 'professional') {
      throw new BadRequestException('Professionals cannot edit the payment plan review state');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, clientId: true },
    });
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (role === 'client') {
      const isOwner = project.userId === actorId || project.clientId === actorId;
      if (!isOwner) {
        throw new BadRequestException('You do not have access to this project');
      }
    }

    const plan = await (this.prisma as any).projectPaymentPlan.findUnique({
      where: { projectId },
    });
    if (!plan) {
      throw new BadRequestException('Payment plan not found for this project');
    }

    const isLocked = !!plan.lockedAt;
    const updateData: any = {};

    if (role === 'client' && body.clientComment !== undefined) {
      updateData.clientComment = String(body.clientComment || '').trim() || null;
      if (!isLocked) {
        updateData.status = 'client_review';
      }
    }

    if (role === 'admin') {
      if (body.adminComment !== undefined) {
        updateData.adminComment = String(body.adminComment || '').trim() || null;
      }
      if (typeof body.adminOverrideApplied === 'boolean') {
        updateData.adminOverrideApplied = body.adminOverrideApplied;
      }
      if (!isLocked && body.lockPlan) {
        updateData.lockedAt = new Date();
        updateData.status = 'locked';
      } else if (!isLocked && Object.keys(updateData).length > 0 && !updateData.status) {
        updateData.status = 'admin_review';
      }
    }

    if (Object.keys(updateData).length === 0) {
      return (this.prisma as any).projectPaymentPlan.findUnique({
        where: { projectId },
        include: {
          milestones: { orderBy: { sequence: 'asc' } },
        },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextPlan = await (tx as any).projectPaymentPlan.update({
        where: { projectId },
        data: updateData,
      });

      if (updateData.lockedAt) {
        await (tx as any).project.update({
          where: { id: projectId },
          data: {
            paymentPlanLockedAt: updateData.lockedAt,
          },
        });
      }

      return (tx as any).projectPaymentPlan.findUnique({
        where: { id: nextPlan.id },
        include: {
          milestones: { orderBy: { sequence: 'asc' } },
        },
      });
    });

    return updated;
  }

  private normalizePhotos(
    photos?: Array<{ url?: string; note?: string }> | null,
    legacyUrls?: string[] | null,
  ): Array<{ url: string; note?: string }> {
    const result: Array<{ url: string; note?: string }> = [];
    if (Array.isArray(photos)) {
      for (const p of photos) {
        if (!p) continue;
        const url = typeof p.url === 'string' ? p.url.trim() : '';
        if (!url) continue;
        result.push({ url, note: typeof p.note === 'string' ? p.note : undefined });
      }
    }
    if (Array.isArray(legacyUrls)) {
      for (const u of legacyUrls) {
        const url = typeof u === 'string' ? u.trim() : '';
        if (!url) continue;
        // Avoid duplicates
        if (!result.some((p) => p.url === url)) {
          result.push({ url });
        }
      }
    }
    return result;
  }

  private resolveProjectPhotos(photos: any[]): any[] {
    if (!Array.isArray(photos)) return photos;
    return photos.map((p) => ({ ...p, url: buildPublicAssetUrl(p.url) }));
  }

  async findCanonical(userId?: string) {
    try {
      const projects = (await this.prisma.project.findMany({
        // Frontend passes the authenticated user's id
        // Only check userId (clientId is legacy)
        where: userId
          ? {
              userId: userId,
              status: { not: this.ARCHIVED_STATUS },
            }
          : {
              status: { not: this.ARCHIVED_STATUS },
            },
        include: {

          professionals: {
            include: { professional: true },
          },
          aiIntake: {
            select: {
              id: true,
              assumptions: true,
              risks: true,
              project: true,
            },
          },
          photos: true,
        },
      })) as any[];

      const byKey = new Map<string, unknown>();
      for (const p of projects) {
        const proj = p;
        const key = userId
          ? `${userId}|${this.canon(proj.projectName)}`
          : `${this.canon(proj.clientName)}|${this.canon(proj.projectName)}`;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, {
            ...proj,
            canonicalKey: key,
            sourceIds: [String(proj.id)],
            professionals: this.dedupeProfessionals(proj.professionals),
            photos: this.resolveProjectPhotos(proj.photos),
          });
        } else {
          const existing_proj = existing as any;
          const mergedPros = [
            ...(existing_proj.professionals ?? []),
            ...(proj.professionals ?? []),
          ];
          existing_proj.professionals = this.dedupeProfessionals(mergedPros);
          existing_proj.sourceIds = Array.from(
            new Set([...(existing_proj.sourceIds ?? []), String(proj.id)]),
          );
          // Prefer the most recently updated record for primary fields
          if ((proj.updatedAt || '') > (existing_proj.updatedAt || '')) {
            existing_proj.id = proj.id;
            existing_proj.region = proj.region;
            existing_proj.status = proj.status;
            existing_proj.contractorName = proj.contractorName;
            existing_proj.budget = proj.budget;
            existing_proj.notes = proj.notes;
            existing_proj.updatedAt = proj.updatedAt;
          }
        }
      }
      return Array.from(byKey.values());
    } catch (error) {
      console.error('[ProjectsService.findCanonical] Database error:', {
        message: error?.message,
        code: error?.code,
        meta: error?.meta,
      });
      return [];
    }
  }

  async findAll() {
    try {
      const projects = await this.prisma.project.findMany({
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          aiIntake: true,
          photos: true,
        },
      });
      // Consolidate duplicate professionals per project
      return projects.map((p: any) => ({
        ...p,
        professionals: this.dedupeProfessionals(p.professionals),
        photos: this.resolveProjectPhotos(p.photos),
      }));
    } catch (error) {
      console.error('[ProjectsService.findAll] Database error:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
      });
      return [];
    }
  }
  
  async findAllForClient(userId: string) {
    try {
      // Step 1: Basic query without includes (to check if data exists)
      // NOTE: Only checking userId now (clientId is legacy and never set for new projects)
      const basicProjects = await this.prisma.project.findMany({
        where: {
          userId: userId,
          status: { not: this.ARCHIVED_STATUS },
        },
        select: {
          id: true,
          projectName: true,
          clientId: true,
          userId: true,
          status: true,
        },
      });

      if (basicProjects.length === 0) {
        return [];
      }

      // Step 2: Now fetch full projects with includes
      let projects;
      try {
        projects = await this.prisma.project.findMany({
          where: {
            id: { in: basicProjects.map(p => p.id) },
          },
          include: {

            professionals: {
              include: {
                professional: true,
              },
            },
            aiIntake: {
              select: {
                id: true,
                assumptions: true,
                risks: true,
                project: true,
              },
            },
            photos: true,
          },
        });
      } catch (includesError) {
        // Fallback to basic projects if includes fail (handles schema mismatch issues)
        console.error('[ProjectsService.findAllForClient] Warning: includes query failed, returning basic projects:', includesError?.message);
        projects = basicProjects;
      }

      try {
        const mapped = projects.map((p: any) => {
          try {
            return {
              ...p,
              professionals: this.dedupeProfessionals(p.professionals),
              photos: this.resolveProjectPhotos(p.photos),
            };
          } catch (mapError) {
            return {
              ...p,
              professionals: [],
              photos: this.resolveProjectPhotos(p.photos),
            };
          }
        });
        return mapped;
      } catch (mapError) {
        console.error('[ProjectsService.findAllForClient] Error in map operation:', mapError?.message);
        return (projects as any[]).map((p: any) => ({
          ...p,
          photos: this.resolveProjectPhotos(p?.photos),
        }));
      }
    } catch (error) {
      console.error('[ProjectsService.findAllForClient] Database error:', error?.message);
      return [];
    }
  }

  async findAllForSurveyOps() {
    try {
      const rows = await this.prisma.$queryRaw<SurveyOpsQueueRow[]>`
        SELECT
          p.id AS "projectId",
          p."projectName" AS "projectName",
          p."clientName" AS "clientName",
          p.region AS "region",
          p.status AS "projectStatus",
          mpe.id AS "surveyExtraId",
          mpe.status AS "surveyStatus",
          msa.status AS "assignmentStatus",
          msa."assignedSurveyorUserId" AS "assignedSurveyorUserId",
          su."firstName" AS "assignedSurveyorFirstName",
          su.surname AS "assignedSurveyorSurname",
          su.email AS "assignedSurveyorEmail",
          mce.id AS "calendarEventId",
          mce.status AS "calendarEventStatus",
          mpe."requestedAt" AS "requestedAt",
          mpe."scheduledAt" AS "scheduledAt",
          mpe.metadata AS "metadata",
          mpe."updatedAt" AS "updatedAt"
        FROM mimo_project_extras mpe
        JOIN "Project" p ON p.id = mpe."projectId"
        LEFT JOIN mimo_survey_assignments msa
          ON msa."projectId" = p.id
         AND (
           msa."surveyExtraId" = mpe.id
           OR msa."surveyExtraId" IS NULL
         )
        LEFT JOIN "User" su
          ON su.id = msa."assignedSurveyorUserId"
        LEFT JOIN LATERAL (
          SELECT e.id, e.status
          FROM mimo_calendar_events e
          WHERE e."projectId" = p.id
            AND e."surveyExtraId" = mpe.id
            AND e."eventType" = 'survey_visit'
          ORDER BY e."createdAt" DESC
          LIMIT 1
        ) mce ON TRUE
        WHERE
          mpe."extraType" = 'survey'
          AND p.status <> ${this.ARCHIVED_STATUS}
          AND COALESCE(LOWER(mpe.status), '') NOT IN ('cancelled', 'declined', 'completed')
        ORDER BY
          COALESCE(mpe."scheduledAt", mpe."requestedAt") ASC,
          mpe."updatedAt" DESC
      `;

      const mappedRows = rows.map((row) => ({
        projectId: row.projectId,
        projectName: row.projectName,
        clientName: row.clientName,
        region: row.region,
        projectStatus: row.projectStatus,
        survey: {
          id: row.surveyExtraId,
          status: row.surveyStatus,
          assignmentStatus: row.assignmentStatus,
          assignedSurveyor: row.assignedSurveyorUserId
            ? {
                id: row.assignedSurveyorUserId,
                firstName: row.assignedSurveyorFirstName,
                surname: row.assignedSurveyorSurname,
                email: row.assignedSurveyorEmail,
              }
            : null,
          calendarEventId: row.calendarEventId,
          calendarEventStatus: row.calendarEventStatus,
          requestedAt: row.requestedAt,
          scheduledAt: row.scheduledAt,
          metadata: row.metadata || {},
          updatedAt: row.updatedAt,
        },
      }));

      const scoreSurveyStatus = (status?: string | null) => {
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'in_progress') return 100;
        if (normalized === 'assigned' || normalized === 'scheduled') return 80;
        if (normalized === 'requested' || normalized === 'pending' || normalized === 'unassigned') return 60;
        return 10;
      };

      const pickPreferredQueueItem = (
        current: (typeof mappedRows)[number] | undefined,
        candidate: (typeof mappedRows)[number],
      ) => {
        if (!current) return candidate;

        const currentScore = scoreSurveyStatus(current.survey.status);
        const candidateScore = scoreSurveyStatus(candidate.survey.status);
        if (candidateScore > currentScore) return candidate;
        if (candidateScore < currentScore) return current;

        const currentUpdated = new Date(current.survey.updatedAt || 0).getTime();
        const candidateUpdated = new Date(candidate.survey.updatedAt || 0).getTime();
        return candidateUpdated >= currentUpdated ? candidate : current;
      };

      const byProject = new Map<string, (typeof mappedRows)[number]>();
      for (const item of mappedRows) {
        byProject.set(item.projectId, pickPreferredQueueItem(byProject.get(item.projectId), item));
      }

      return Array.from(byProject.values()).sort((a, b) => {
        const aTime = new Date(a.survey.scheduledAt || a.survey.requestedAt || 0).getTime();
        const bTime = new Date(b.survey.scheduledAt || b.survey.requestedAt || 0).getTime();
        return aTime - bTime;
      });
    } catch (error) {
      const err = error as any;
      console.error('[ProjectsService.findAllForSurveyOps] Error:', err?.message || err);
      return [];
    }
  }

  async findSurveyProjectContext(projectId: string) {
    try {
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          status: { not: this.ARCHIVED_STATUS },
        },
        select: {
          id: true,
          projectName: true,
          clientName: true,
          region: true,
          projectScale: true,
          status: true,
          startDate: true,
          endDate: true,
          siteInspectionAvailableOn: true,
          notes: true,
          updatedAt: true,
        },
      });

      if (!project) return null;

      const extras = await this.listProjectExtras(project.id);
      const surveyExtra = extras.find((extra) => String(extra.extraType || '').toLowerCase() === 'survey') || null;

      return {
        ...project,
        surveyExtra,
      };
    } catch (error) {
      const err = error as any;
      console.error('[ProjectsService.findSurveyProjectContext] Error:', err?.message || err);
      return null;
    }
  }

  async listSurveyOpsSurveyors() {
    const users = await this.prisma.user.findMany({
      where: {
        role: 'surveyor',
      },
      select: {
        id: true,
        firstName: true,
        surname: true,
        email: true,
        role: true,
      },
      orderBy: [
        { firstName: 'asc' },
        { surname: 'asc' },
        { email: 'asc' },
      ],
    });

    return (users as SurveyorRow[]).map((user) => ({
      id: user.id,
      label:
        `${String(user.firstName || '').trim()} ${String(user.surname || '').trim()}`.trim() ||
        user.email,
      email: user.email,
      role: user.role,
    }));
  }

  async assignSurveyOpsSurveyor(
    projectId: string,
    payload: {
      surveyExtraId: string;
      surveyorUserId: string;
      assignedByUserId: string;
    },
  ) {
    const surveyor = await this.prisma.user.findFirst({
      where: {
        id: payload.surveyorUserId,
        role: 'surveyor',
      },
      select: { id: true, firstName: true, surname: true, email: true },
    });

    if (!surveyor) {
      throw new BadRequestException('Surveyor not found');
    }

    const extras = await this.prisma.$queryRaw<
      Array<{
        id: string;
        status: string;
        metadata: Record<string, unknown> | null;
        scheduledAt: Date | null;
      }>
    >`
      SELECT
        id,
        status,
        metadata,
        "scheduledAt" as "scheduledAt"
      FROM mimo_project_extras
      WHERE id = ${payload.surveyExtraId}
        AND "projectId" = ${projectId}
        AND "extraType" = 'survey'
      LIMIT 1
    `;

    const surveyExtra = extras[0];
    if (!surveyExtra) {
      throw new BadRequestException('Survey record not found');
    }

    const normalizedStatus = String(surveyExtra.status || '').toLowerCase();
    if (['cancelled', 'declined', 'completed'].includes(normalizedStatus)) {
      throw new BadRequestException('Survey is not assignable in its current state');
    }

    const rooms = Number(surveyExtra.metadata?.rooms || 1);
    const durationMinutes = this.getMimoSurveyDurationMinutes(
      Number.isFinite(rooms) && rooms > 0 ? Math.floor(rooms) : 1,
    );
    const startsAt = surveyExtra.scheduledAt
      ? new Date(surveyExtra.scheduledAt)
      : new Date(String(surveyExtra.metadata?.proposedDate || ''));

    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Survey slot has no valid scheduled date/time to assign');
    }

    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    const conflicts = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT e.id
      FROM mimo_calendar_events e
      JOIN mimo_calendar_event_participants p ON p."eventId" = e.id
      WHERE p."userId" = ${surveyor.id}
        AND e.status <> 'cancelled'
        AND e."eventType" = 'survey_visit'
        AND COALESCE(e."endsAt", e."startsAt" + interval '30 minutes') > ${startsAt}
        AND e."startsAt" < ${endsAt}
      LIMIT 1
    `;

    if (conflicts.length > 0) {
      throw new BadRequestException('Selected surveyor is already booked for this timeslot');
    }

    const hasCalendarLink = await this.supportsSurveyAssignmentCalendarLink();
    let calendarEventId: string | null = null;

    if (hasCalendarLink) {
      const rows = await this.prisma.$queryRaw<Array<{ calendarEventId: string | null }>>`
        SELECT "calendarEventId" as "calendarEventId"
        FROM mimo_survey_assignments
        WHERE "projectId" = ${projectId}
        LIMIT 1
      `;
      calendarEventId = rows[0]?.calendarEventId || null;
    }

    if (!calendarEventId) {
      const eventRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM mimo_calendar_events
        WHERE "projectId" = ${projectId}
          AND "surveyExtraId" = ${payload.surveyExtraId}
          AND "eventType" = 'survey_visit'
        ORDER BY "createdAt" DESC
        LIMIT 1
      `;
      calendarEventId = eventRows[0]?.id || null;
    }

    if (!calendarEventId) {
      calendarEventId = `mce_${createId()}`;
      await this.prisma.$executeRaw`
        INSERT INTO mimo_calendar_events (
          id,
          "projectId",
          "surveyExtraId",
          "eventType",
          title,
          description,
          status,
          timezone,
          "startsAt",
          "endsAt",
          metadata,
          "createdByUserId",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${calendarEventId},
          ${projectId},
          ${payload.surveyExtraId},
          'survey_visit',
          'Survey visit',
          'Survey assignment scheduled via Survey Ops',
          'scheduled',
          'Asia/Hong_Kong',
          ${startsAt.toISOString()}::timestamptz,
          ${endsAt.toISOString()}::timestamptz,
          ${JSON.stringify({ assignedVia: 'survey_ops' })}::jsonb,
          ${payload.assignedByUserId},
          now(),
          now()
        )
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE mimo_calendar_events
        SET
          "startsAt" = ${startsAt.toISOString()}::timestamptz,
          "endsAt" = ${endsAt.toISOString()}::timestamptz,
          status = 'scheduled',
          "updatedAt" = now()
        WHERE id = ${calendarEventId}
      `;
    }

    await this.prisma.$executeRaw`
      DELETE FROM mimo_calendar_event_participants
      WHERE "eventId" = ${calendarEventId}
        AND role = 'surveyor'
    `;

    await this.prisma.$executeRaw`
      INSERT INTO mimo_calendar_event_participants (
        id,
        "eventId",
        "userId",
        role,
        response,
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${`mcep_${createId()}`},
        ${calendarEventId},
        ${surveyor.id},
        'surveyor',
        'accepted',
        now(),
        now()
      )
      ON CONFLICT ("eventId", "userId") WHERE "userId" IS NOT NULL
      DO UPDATE SET
        role = EXCLUDED.role,
        response = EXCLUDED.response,
        "updatedAt" = now()
    `;

    if (hasCalendarLink) {
      await this.prisma.$executeRaw`
        INSERT INTO mimo_survey_assignments (
          id,
          "projectId",
          "surveyExtraId",
          "calendarEventId",
          "assignedSurveyorUserId",
          "assignedByUserId",
          status,
          "scheduledAt",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${`msa_${createId()}`},
          ${projectId},
          ${payload.surveyExtraId},
          ${calendarEventId},
          ${surveyor.id},
          ${payload.assignedByUserId},
          'assigned',
          ${startsAt.toISOString()}::timestamptz,
          now(),
          now()
        )
        ON CONFLICT ("projectId") DO UPDATE
        SET
          "surveyExtraId" = EXCLUDED."surveyExtraId",
          "calendarEventId" = EXCLUDED."calendarEventId",
          "assignedSurveyorUserId" = EXCLUDED."assignedSurveyorUserId",
          "assignedByUserId" = EXCLUDED."assignedByUserId",
          status = 'assigned',
          "scheduledAt" = EXCLUDED."scheduledAt",
          "updatedAt" = now()
      `;
    } else {
      await this.prisma.$executeRaw`
        INSERT INTO mimo_survey_assignments (
          id,
          "projectId",
          "surveyExtraId",
          "assignedSurveyorUserId",
          "assignedByUserId",
          status,
          "scheduledAt",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${`msa_${createId()}`},
          ${projectId},
          ${payload.surveyExtraId},
          ${surveyor.id},
          ${payload.assignedByUserId},
          'assigned',
          ${startsAt.toISOString()}::timestamptz,
          now(),
          now()
        )
        ON CONFLICT ("projectId") DO UPDATE
        SET
          "surveyExtraId" = EXCLUDED."surveyExtraId",
          "assignedSurveyorUserId" = EXCLUDED."assignedSurveyorUserId",
          "assignedByUserId" = EXCLUDED."assignedByUserId",
          status = 'assigned',
          "scheduledAt" = EXCLUDED."scheduledAt",
          "updatedAt" = now()
      `;
    }

    await this.prisma.$executeRaw`
      UPDATE mimo_project_extras
      SET
        status = 'assigned',
        "updatedAt" = now()
      WHERE id = ${payload.surveyExtraId}
    `;

    return {
      projectId,
      surveyExtraId: payload.surveyExtraId,
      assignedSurveyor: {
        id: surveyor.id,
        firstName: surveyor.firstName,
        surname: surveyor.surname,
        email: surveyor.email,
      },
      calendarEventId,
      scheduledAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };
  }

  async updateSurveyOpsSurveyStatus(
    projectId: string,
    payload: {
      surveyExtraId: string;
      action: 'start' | 'cancel';
      actorUserId: string;
    },
  ) {
    const extras = await this.prisma.$queryRaw<
      Array<{
        id: string;
        status: string;
        metadata: Record<string, unknown> | null;
      }>
    >`
      SELECT id, status, metadata
      FROM mimo_project_extras
      WHERE id = ${payload.surveyExtraId}
        AND "projectId" = ${projectId}
        AND "extraType" = 'survey'
      LIMIT 1
    `;

    const surveyExtra = extras[0];
    if (!surveyExtra) {
      throw new BadRequestException('Survey record not found');
    }

    const hasCalendarLink = await this.supportsSurveyAssignmentCalendarLink();

    let assignmentRows: Array<{ id: string; calendarEventId: string | null; assignedSurveyorUserId: string | null }> = [];
    if (hasCalendarLink) {
      assignmentRows = await this.prisma.$queryRaw<
        Array<{ id: string; calendarEventId: string | null; assignedSurveyorUserId: string | null }>
      >`
        SELECT id, "calendarEventId" as "calendarEventId", "assignedSurveyorUserId" as "assignedSurveyorUserId"
        FROM mimo_survey_assignments
        WHERE "projectId" = ${projectId}
        LIMIT 1
      `;
    } else {
      assignmentRows = await this.prisma.$queryRaw<
        Array<{ id: string; calendarEventId: string | null; assignedSurveyorUserId: string | null }>
      >`
        SELECT id, NULL::text as "calendarEventId", "assignedSurveyorUserId" as "assignedSurveyorUserId"
        FROM mimo_survey_assignments
        WHERE "projectId" = ${projectId}
        LIMIT 1
      `;
    }

    const assignment = assignmentRows[0];

    if (payload.action === 'start') {
      if (!assignment?.assignedSurveyorUserId) {
        throw new BadRequestException('Please assign a surveyor before starting the survey');
      }

      const requestedRooms = Number(surveyExtra.metadata?.rooms || 1);
      const roomCount = Number.isFinite(requestedRooms) && requestedRooms > 0 ? Math.floor(requestedRooms) : 1;
      const seededRooms = normalizeSurveyWorkspaceRooms([], [], roomCount);
      const seededPhotos = flattenSurveyWorkspaceRoomPhotos(seededRooms);

      await this.prisma.$executeRaw`
        INSERT INTO mimo_survey_workspace_reports (
          id,
          "projectId",
          "surveyExtraId",
          "createdByUserId",
          status,
          rooms,
          photos,
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${`mswr_${createId()}`},
          ${projectId},
          ${payload.surveyExtraId},
          ${payload.actorUserId},
          'draft',
          ${JSON.stringify(seededRooms)}::jsonb,
          ${JSON.stringify(seededPhotos)}::jsonb,
          now(),
          now()
        )
        ON CONFLICT ("projectId", "surveyExtraId") DO UPDATE
        SET
          rooms = CASE
            WHEN COALESCE(jsonb_array_length(mimo_survey_workspace_reports.rooms), 0) = 0
              THEN EXCLUDED.rooms
            ELSE mimo_survey_workspace_reports.rooms
          END,
          photos = CASE
            WHEN COALESCE(jsonb_array_length(mimo_survey_workspace_reports.photos), 0) = 0
              THEN EXCLUDED.photos
            ELSE mimo_survey_workspace_reports.photos
          END,
          "updatedAt" = now()
      `;

      await this.prisma.$executeRaw`
        UPDATE mimo_survey_assignments
        SET
          status = 'in_progress',
          "updatedAt" = now()
        WHERE "projectId" = ${projectId}
      `;

      await this.prisma.$executeRaw`
        UPDATE mimo_project_extras
        SET
          status = 'in_progress',
          "updatedAt" = now()
        WHERE id = ${payload.surveyExtraId}
      `;

      return {
        projectId,
        surveyExtraId: payload.surveyExtraId,
        status: 'in_progress',
      };
    }

    let calendarEventId = assignment?.calendarEventId || null;
    if (!calendarEventId) {
      const eventRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM mimo_calendar_events
        WHERE "projectId" = ${projectId}
          AND "surveyExtraId" = ${payload.surveyExtraId}
          AND "eventType" = 'survey_visit'
        ORDER BY "createdAt" DESC
        LIMIT 1
      `;
      calendarEventId = eventRows[0]?.id || null;
    }

    if (calendarEventId) {
      await this.prisma.$executeRaw`
        UPDATE mimo_calendar_events
        SET
          status = 'cancelled',
          "updatedAt" = now(),
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            cancelledByUserId: payload.actorUserId,
            cancelledAt: new Date().toISOString(),
            cancelledFrom: 'survey_ops',
          })}::jsonb
        WHERE id = ${calendarEventId}
      `;
    }

    await this.prisma.$executeRaw`
      UPDATE mimo_survey_assignments
      SET
        status = 'unassigned',
        "assignedSurveyorUserId" = NULL,
        "assignedByUserId" = NULL,
        "updatedAt" = now()
      WHERE "projectId" = ${projectId}
    `;

    await this.prisma.$executeRaw`
      UPDATE mimo_project_extras
      SET
        status = 'requested',
        "updatedAt" = now()
      WHERE id = ${payload.surveyExtraId}
    `;

    return {
      projectId,
      surveyExtraId: payload.surveyExtraId,
      status: 'requested',
      calendarEventId,
    };
  }

  private async assertSurveyWorkspaceAccess(
    projectId: string,
    surveyExtraId: string,
    actorUserId: string,
    actorRole: string,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        status: string;
        assignedSurveyorUserId: string | null;
      }>
    >`
      SELECT
        mpe.id,
        mpe.status,
        msa."assignedSurveyorUserId" as "assignedSurveyorUserId"
      FROM mimo_project_extras mpe
      LEFT JOIN mimo_survey_assignments msa ON msa."projectId" = mpe."projectId"
      WHERE mpe.id = ${surveyExtraId}
        AND mpe."projectId" = ${projectId}
        AND mpe."extraType" = 'survey'
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      throw new BadRequestException('Survey record not found for this project');
    }

    if (
      String(actorRole || '').toLowerCase() === 'surveyor' &&
      row.assignedSurveyorUserId &&
      row.assignedSurveyorUserId !== actorUserId
    ) {
      throw new BadRequestException('You are not assigned to this survey task');
    }

    return row;
  }

  async getSurveyWorkspace(
    projectId: string,
    surveyExtraId: string,
    actorUserId: string,
    actorRole: string,
  ) {
    const surveyAccess = await this.assertSurveyWorkspaceAccess(projectId, surveyExtraId, actorUserId, actorRole);

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          status: string;
          title: string | null;
          summary: string | null;
          accessNotes: string | null;
          recommendations: string | null;
          rooms: Prisma.JsonValue | null;
          photos: Prisma.JsonValue | null;
          submittedAt: Date | null;
          updatedAt: Date;
        }>
      >`
        SELECT
          id,
          status,
          title,
          summary,
          "accessNotes" as "accessNotes",
          recommendations,
          rooms,
          photos,
          "submittedAt" as "submittedAt",
          "updatedAt" as "updatedAt"
        FROM mimo_survey_workspace_reports
        WHERE "projectId" = ${projectId}
          AND "surveyExtraId" = ${surveyExtraId}
        LIMIT 1
      `;

      const report = rows[0] || null;

      const reportRooms = coerceJsonArray<SurveyWorkspaceRoom>(report?.rooms);
      const reportPhotos = coerceJsonArray<SurveyWorkspacePhoto>(report?.photos);

      return {
        success: true,
        projectId,
        surveyExtraId,
        surveyStatus: surveyAccess.status,
        report: report
          ? {
              id: report.id,
              status: report.status,
              title: report.title || '',
              summary: report.summary || '',
              accessNotes: report.accessNotes || '',
              recommendations: report.recommendations || '',
              rooms: normalizeSurveyWorkspaceRooms(reportRooms, reportPhotos),
              photos: normalizeSurveyWorkspacePhotos(reportPhotos),
              submittedAt: report.submittedAt,
              updatedAt: report.updatedAt,
            }
          : {
              id: null,
              status: 'draft',
              title: '',
              summary: '',
              accessNotes: '',
              recommendations: '',
              rooms: normalizeSurveyWorkspaceRooms([], [], 1),
              photos: [],
              submittedAt: null,
              updatedAt: null,
            },
      };
    } catch (error) {
      const err = error as any;
      throw new ServiceUnavailableException(
        err?.message?.includes('mimo_survey_workspace_reports')
          ? 'Survey workspace storage is not initialized. Run MANUAL_SQL_ADD_SURVEY_WORKSPACE_AND_MARKUP.sql first.'
          : 'Failed to load survey workspace',
      );
    }
  }

  async saveSurveyWorkspaceDraft(
    projectId: string,
    surveyExtraId: string,
    actorUserId: string,
    actorRole: string,
    payload: {
      title?: string;
      summary?: string;
      accessNotes?: string;
      recommendations?: string;
      rooms?: SurveyWorkspaceRoom[];
      photos?: SurveyWorkspacePhoto[];
    },
  ) {
    await this.assertSurveyWorkspaceAccess(projectId, surveyExtraId, actorUserId, actorRole);

    const cleanRooms = normalizeSurveyWorkspaceRooms(payload.rooms, payload.photos, 1);
    const cleanPhotos = flattenSurveyWorkspaceRoomPhotos(cleanRooms);

    try {
      await this.prisma.$executeRaw`
        INSERT INTO mimo_survey_workspace_reports (
          id,
          "projectId",
          "surveyExtraId",
          "createdByUserId",
          status,
          title,
          summary,
          "accessNotes",
          recommendations,
          rooms,
          photos,
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${`mswr_${createId()}`},
          ${projectId},
          ${surveyExtraId},
          ${actorUserId},
          'draft',
          ${String(payload.title || '').trim() || null},
          ${String(payload.summary || '').trim() || null},
          ${String(payload.accessNotes || '').trim() || null},
          ${String(payload.recommendations || '').trim() || null},
          ${JSON.stringify(cleanRooms)}::jsonb,
          ${JSON.stringify(cleanPhotos)}::jsonb,
          now(),
          now()
        )
        ON CONFLICT ("projectId", "surveyExtraId") DO UPDATE
        SET
          status = 'draft',
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          "accessNotes" = EXCLUDED."accessNotes",
          recommendations = EXCLUDED.recommendations,
            rooms = EXCLUDED.rooms,
          photos = EXCLUDED.photos,
          "updatedAt" = now()
      `;
    } catch (error) {
      const err = error as any;
      throw new ServiceUnavailableException(
        err?.message?.includes('mimo_survey_workspace_reports')
          ? 'Survey workspace storage is not initialized. Run MANUAL_SQL_ADD_SURVEY_WORKSPACE_AND_MARKUP.sql first.'
          : 'Failed to save survey draft',
      );
    }

    return this.getSurveyWorkspace(projectId, surveyExtraId, actorUserId, actorRole);
  }

  async submitSurveyWorkspace(
    projectId: string,
    surveyExtraId: string,
    actorUserId: string,
    actorRole: string,
  ) {
    await this.assertSurveyWorkspaceAccess(projectId, surveyExtraId, actorUserId, actorRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectName: true,
        clientName: true,
        userId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            mobile: true,
            email: true,
          },
        },
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    try {
      await this.prisma.$executeRaw`
        INSERT INTO mimo_survey_workspace_reports (
          id,
          "projectId",
          "surveyExtraId",
          "createdByUserId",
          status,
          "submittedAt",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${`mswr_${createId()}`},
          ${projectId},
          ${surveyExtraId},
          ${actorUserId},
          'submitted_for_client_approval',
          now(),
          now(),
          now()
        )
        ON CONFLICT ("projectId", "surveyExtraId") DO UPDATE
        SET
          status = 'submitted_for_client_approval',
          "submittedAt" = now(),
          "updatedAt" = now()
      `;

      await this.prisma.$executeRaw`
        UPDATE mimo_project_extras
        SET
          status = 'awaiting_client_approval',
          "updatedAt" = now()
        WHERE id = ${surveyExtraId}
          AND "projectId" = ${projectId}
          AND "extraType" = 'survey'
      `;

      const clientMobile = String(project.user?.mobile || '').trim();
      if (clientMobile) {
        const clientLabel =
          `${String(project.user?.firstName || '').trim()} ${String(project.user?.surname || '').trim()}`.trim() ||
          project.clientName ||
          'Client';
        try {
          await this.notificationService.send({
            userId: project.userId || undefined,
            phoneNumber: clientMobile,
            eventType: 'survey_awaiting_client_approval',
            message: `Your survey for ${project.projectName} is ready for client approval. Open Mimo to review the submitted findings.`,
            metadata: {
              projectId,
              surveyExtraId,
              projectName: project.projectName,
              clientLabel,
              surveyStatus: 'awaiting_client_approval',
            },
          });
        } catch (notificationError) {
          const err = notificationError as any;
          console.warn('[ProjectsService.submitSurveyWorkspace] Client notification skipped:', err?.message || err);
        }
      } else {
        console.warn('[ProjectsService.submitSurveyWorkspace] Client mobile missing; notification skipped for project', projectId);
      }
    } catch (error) {
      const err = error as any;
      throw new ServiceUnavailableException(
        err?.message?.includes('mimo_survey_workspace_reports')
          ? 'Survey workspace storage is not initialized. Run MANUAL_SQL_ADD_SURVEY_WORKSPACE_AND_MARKUP.sql first.'
          : 'Failed to submit survey workspace',
      );
    }

    return {
      success: true,
      projectId,
      surveyExtraId,
      status: 'awaiting_client_approval',
    };
  }

  private async getWalletTransferTimeline(projectId: string) {
    // "Wallet transfer" in the Class 1/2 flow = the client authorizing the milestone 1
    // cap allocation (milestone_foh_allocation_cap). This makes the nominal sum
    // available to the professional but not yet withdrawable. A separate evidence-
    // approval step then moves the proven amount to the withdrawable wallet.
    const firstCapTx = await this.prisma.financialTransaction.findFirst({
      where: {
        projectId,
        status: 'confirmed',
        type: 'milestone_foh_allocation_cap',
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        createdAt: true,
      },
    });

    return {
      walletTransferStatus: firstCapTx ? 'completed' : 'pending',
      walletTransferCompletedAt: firstCapTx?.createdAt ?? null,
    };
  }

  async findOne(id: string) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id },
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          paymentPlan: {
            include: {
              milestones: {
                orderBy: {
                  sequence: 'asc',
                },
              },
            },
          },
          startProposals: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 10,
          },
          aiIntake: true,
          photos: true,
        },
      });
      if (!project) return null;
      const walletTransferTimeline = await this.getWalletTransferTimeline(project.id);
      return {
        ...project,
        ...walletTransferTimeline,
        professionals: this.dedupeProfessionals((project as any).professionals),
        photos: this.resolveProjectPhotos((project as any).photos),
      } as any;
    } catch (error) {
      console.error('[ProjectsService.findOne] Error:', error?.message, error?.stack);
      return null;
    }
  }

  async findOneForClient(id: string, userId: string) {
    try {
      console.log('[ProjectsService.findOneForClient] Fetching project:', id, 'for userId:', userId);
      const project = await this.prisma.project.findFirst({
        where: {
          id,
          userId: userId,
          status: { not: this.ARCHIVED_STATUS },
        },
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          paymentPlan: {
            include: {
              milestones: {
                orderBy: {
                  sequence: 'asc',
                },
              },
            },
          },
          startProposals: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 10,
          },
          aiIntake: {
            select: {
              id: true,
              assumptions: true,
              risks: true,
              project: true,
            },
          },
          photos: true,
        },
      });
      console.log('[ProjectsService.findOneForClient] Project found:', !!project);
      if (!project) return null;
      const mimoProjectExtras = await this.listProjectExtras(project.id);
      const walletTransferTimeline = await this.getWalletTransferTimeline(project.id);
      return {
        ...project,
        mimoProjectExtras,
        ...walletTransferTimeline,
        professionals: this.dedupeProfessionals((project as any).professionals),
        photos: this.resolveProjectPhotos((project as any).photos),
      } as any;
    } catch (error) {
      console.error('[ProjectsService.findOneForClient] Primary query failed, retrying with explicit project select:', error);

      try {
        const project = await this.prisma.project.findFirst({
          where: {
            id,
            userId,
            status: { not: this.ARCHIVED_STATUS },
          },
          select: {
            id: true,
            status: true,
            budget: true,
            approvedBudget: true,
            clientName: true,
            contractorContactEmail: true,
            contractorContactName: true,
            contractorContactPhone: true,
            createdAt: true,
            currentStage: true,
            endDate: true,
            isEmergency: true,
            locationDetailsProvidedAt: true,
            locationDetailsRequiredAt: true,
            locationDetailsStatus: true,
            notes: true,
            projectName: true,
            projectScale: true,
            region: true,
            siteAccessDataCollected: true,
            siteAccessDataCollectedAt: true,
            siteInspectionAvailableOn: true,
            startDate: true,
            tradesRequired: true,
            updatedAt: true,
            professionals: {
              include: {
                professional: true,
              },
            },
            paymentPlan: {
              include: {
                milestones: {
                  orderBy: {
                    sequence: 'asc',
                  },
                },
              },
            },
            startProposals: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 10,
            },
            aiIntake: {
              select: {
                id: true,
                assumptions: true,
                risks: true,
                project: true,
              },
            },
            photos: true,
          },
        });

        console.log('[ProjectsService.findOneForClient] Fallback project found:', !!project);
        if (!project) return null;

        const mimoProjectExtras = await this.listProjectExtras(project.id);
        const walletTransferTimeline = await this.getWalletTransferTimeline(project.id);
        return {
          ...project,
          mimoProjectExtras,
          ...walletTransferTimeline,
          professionals: this.dedupeProfessionals((project as any).professionals),
          photos: this.resolveProjectPhotos((project as any).photos),
        } as any;
      } catch (fallbackError) {
        console.error('[ProjectsService.findOneForClient] Fallback query failed:', fallbackError);
        return null;
      }
    }
  }

  async getEmailTokens(projectId: string) {
    return this.prisma.emailToken.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            email: true,
            fullName: true,
            businessName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getProjectProfessionals(projectId: string) {
    const pros = await this.prisma.projectProfessional.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            email: true,
            fullName: true,
            businessName: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return this.dedupeProfessionals(pros);
  }

  async countMatchingProfessionals(params: {
    trades: string[];
    location?: string;
    isEmergency?: boolean;
  }) {
    const { trades, location, isEmergency } = params;
    try {
      const where: any = {
        professionType: { in: [...this.PROJECT_SELECTABLE_PROFESSION_TYPES] },
        status: 'approved',
      };

      if (isEmergency) {
        where.emergencyCalloutAvailable = true;
      }

      if (trades.length > 0) {
        where.OR = trades.flatMap((trade) => [
          { primaryTrade: { equals: trade, mode: 'insensitive' } },
          { tradesOffered: { has: trade } },
        ]);
      }

      if (location) {
        const locFilters = [
          { locationPrimary: { contains: location, mode: 'insensitive' } },
          { locationSecondary: { contains: location, mode: 'insensitive' } },
          { servicePrimaries: { has: location } },
        ];
        where.AND = [...(where.AND || []), { OR: locFilters }];
      }

      const count = await (this.prisma as any).professional.count({ where });
      return { count };
    } catch (error) {
      console.error('[countMatchingProfessionals] Query failed:', error?.message || error);
      // Fallback: count by simple trade match only
      try {
        const simpleWhere: any = {
          professionType: { in: [...this.PROJECT_SELECTABLE_PROFESSION_TYPES] },
          status: 'approved',
        };
        if (trades.length > 0) {
          simpleWhere.primaryTrade = { in: trades, mode: 'insensitive' };
        }
        const count = await (this.prisma as any).professional.count({ where: simpleWhere });
        return { count };
      } catch {
        return { count: 0 };
      }
    }
  }

  async inviteAllMatchingProfessionals(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        tradesRequired: true,
        region: true,
        isEmergency: true,
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    const where: any = {
      professionType: { in: [...this.PROJECT_SELECTABLE_PROFESSION_TYPES] },
      status: 'approved',
    };

    if (project.isEmergency) {
      where.emergencyCalloutAvailable = true;
    }

    const projectTrades = (project.tradesRequired || []) as string[];
    if (projectTrades.length > 0) {
      where.OR = [
        { primaryTrade: { in: projectTrades, mode: 'insensitive' } },
        { tradesOffered: { hasSome: projectTrades } },
      ];
    }

    const loc = project.region;
    if (loc) {
      const parts = loc.split(',').map(s => s.trim()).filter(Boolean);
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            ...parts.flatMap(part => [
              { locationPrimary: { contains: part, mode: 'insensitive' } },
              { locationSecondary: { contains: part, mode: 'insensitive' } },
            ]),
            { servicePrimaries: { hasSome: parts } },
          ],
        },
      ];
    }

    const professionals = await (this.prisma as any).professional.findMany({
      where,
      select: { id: true },
    });

    const professionalIds: string[] = professionals.map((p: any) => p.id);

    if (professionalIds.length === 0) {
      throw new BadRequestException('No matching professionals found for open tender');
    }

    const result = await this.inviteProfessionals(projectId, professionalIds);

    // Transition project to BIDDING_ACTIVE now that professionals are invited
    await this.prisma.project.update({
      where: { id: projectId },
      data: { currentStage: ProjectStage.BIDDING_ACTIVE },
    });

    return result;
  }

  async inviteProfessionals(projectId: string, professionalIds: string[]) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const ids = Array.isArray(professionalIds)
      ? Array.from(new Set(professionalIds.filter(Boolean)))
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('At least one professionalId is required');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    const professionals = await this.getProjectSelectableProfessionals(ids, {
      requireEmergencyCallout: !!project.isEmergency,
    });
    if (professionals.length === 0) {
      throw new BadRequestException('No professionals found for given ids');
    }

    const invitationScopeByProfessionalId = new Map(
      professionals.map((professional) => [
        professional.id,
        this.deriveInvitationTradeScope(project.tradesRequired || [], professional),
      ]),
    );

    const buildJunctionPromises = (includeTradeScope: boolean) =>
      professionals.map((pro) =>
        (this.prisma as any).projectProfessional.upsert({
          where: {
            projectId_professionalId: {
              projectId,
              professionalId: pro.id,
            },
          },
          update: this.buildProjectProfessionalTradeScopeWrite({
            status: 'pending',
            requestedTrades:
              invitationScopeByProfessionalId.get(pro.id)?.requestedTrades || [],
            projectTrades:
              invitationScopeByProfessionalId.get(pro.id)?.projectTrades || [],
            includeTradeScope,
          }),
          create: {
            projectId,
            professionalId: pro.id,
            ...this.buildProjectProfessionalTradeScopeWrite({
              status: 'pending',
              requestedTrades:
                invitationScopeByProfessionalId.get(pro.id)?.requestedTrades || [],
              projectTrades:
                invitationScopeByProfessionalId.get(pro.id)?.projectTrades || [],
              includeTradeScope,
            }),
          },
        }),
      );

    let junctionResults: any[] = [];
    try {
      junctionResults = await Promise.all(buildJunctionPromises(true));
    } catch (error) {
      if (!this.isMissingProjectProfessionalTradeScopeFieldError(error)) {
        throw error;
      }
      this.throwProjectProfessionalTradeScopeSchemaError(error);
    }

    // Create invitation messages for each professional
    const messagePromises = junctionResults.map(async (projectProfessional) => {
      const professional = professionals.find(p => p.id === projectProfessional.professionalId);
      if (!professional) return;
      const tradeCopy = this.buildInvitationTradeCopy(
        invitationScopeByProfessionalId.get(projectProfessional.professionalId) || {
          requestedTrades: [],
          otherRequiredTrades: [],
          projectTrades: this.normalizeTradeLabels(project.tradesRequired || []),
        },
      );

      const timelineText = project.endDate 
        ? `Timeline: Needed by ${new Date(project.endDate).toLocaleDateString()}`
        : 'Timeline: Flexible';

      const invitationTitle = tradeCopy.requestedTradesLine
        ? `${project.projectName} - ${tradeCopy.requestedTradesLine.replace('Trade required from you: ', '')}`
        : project.projectName;

      const invitationMessage = `📋 New Project Invitation

You've been invited to submit a quote for this project.

    ${invitationTitle}
    ${tradeCopy.requestedTradesLine ? `${tradeCopy.requestedTradesLine}
    ` : ''}${tradeCopy.otherRequiredTradesLine ? `${tradeCopy.otherRequiredTradesLine}
    ` : ''}${tradeCopy.projectTradesLine}
Region: ${project.region}
${timelineText}

Please review the project details and respond with your quote or decline the invitation.`;

      return this.prisma.message.create({
        data: {
          projectProfessionalId: projectProfessional.id,
          senderType: 'client',
          senderClientId: project.userId || project.clientId,
          content: invitationMessage,
        },
      });
    });

    await Promise.all(messagePromises);

    // Generate tokens for all professionals in parallel (no rate limit concern)
    const tokenData: Array<{ professional: typeof professionals[0]; acceptToken: string; declineToken: string; authToken: string }> = [];
    const tokenPromises: any[] = [];

    for (const professional of professionals) {
      const acceptToken = createId();
      const declineToken = createId();
      const authToken = createId();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const authExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      tokenData.push({ professional, acceptToken, declineToken, authToken });

      tokenPromises.push(
        this.prisma.emailToken.create({ data: { token: acceptToken, projectId, professionalId: professional.id, action: 'accept', expiresAt } }),
        this.prisma.emailToken.create({ data: { token: declineToken, projectId, professionalId: professional.id, action: 'decline', expiresAt } }),
        this.prisma.emailToken.create({ data: { token: authToken, projectId, professionalId: professional.id, action: 'auth', expiresAt: authExpiresAt } }),
      );
    }

    await Promise.all(tokenPromises);

    // Send notifications sequentially — 1.1s gap between emails to respect Resend free-tier rate limit (1 req/s)
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const notificationAudit = this.createNotificationAudit(
      'project_invitation_notifications',
      projectId,
      { invitedCount: tokenData.length },
    );

    for (let i = 0; i < tokenData.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }

      const { professional, acceptToken, declineToken, authToken } = tokenData[i];
      const professionalName = professional.fullName || professional.businessName || 'Professional';
      const quoteWindowLabel = project.isEmergency ? '1 hour' : '3 days';
      const tradeScope = invitationScopeByProfessionalId.get(professional.id) || {
        requestedTrades: [],
        otherRequiredTrades: [],
        projectTrades: this.normalizeTradeLabels(project.tradesRequired || []),
      };
      const tradeCopy = this.buildInvitationTradeCopy(tradeScope);
      const recipientAudit: NotificationAuditRecipient = {
        actorType: 'professional',
        actorId: professional.id,
        role: 'invitee',
        email: { status: 'skipped' },
        direct: { status: 'skipped' },
      };

      // Always send email (carries accept/decline token links)
      try {
        await this.emailService.sendProjectInvitation({
          to: professional.email,
          professionalName,
          projectName: project.projectName,
          projectDescription: project.notes || 'No description provided',
          location: project.region,
          requestedTradesText: tradeScope.requestedTrades.join(', '),
          otherRequiredTradesText: tradeScope.otherRequiredTrades.join(', '),
          projectTradesText: tradeScope.projectTrades.join(', '),
          acceptToken,
          declineToken,
          authToken,
          projectId,
          baseUrl,
          quoteWindowLabel,
        });
        recipientAudit.email.status = 'sent';
      } catch (err) {
        recipientAudit.email.status = 'failed';
        recipientAudit.email.error = err?.message;
        console.error('[ProjectsService.inviteProfessionals] email failed', { to: professional.email, error: err?.message });
      }

      // Also send WhatsApp/SMS if professional has a non-email primary channel and a phone number
      if (professional.phone) {
        try {
          const preference = await this.prisma.notificationPreference.findUnique({
            where: { professionalId: professional.id },
            select: {
              primaryChannel: true,
              fallbackChannel: true,
              enableWhatsApp: true,
              enableSMS: true,
            },
          });
          const preferredChannel = preference?.primaryChannel;
          const fallbackChannel = preference?.fallbackChannel;

          const isMessagingChannel = (channel?: NotificationChannel | null) =>
            channel === NotificationChannel.WHATSAPP ||
            channel === NotificationChannel.SMS;

          const isChannelEnabled = (channel?: NotificationChannel | null) => {
            if (!channel) return false;
            if (channel === NotificationChannel.WHATSAPP) {
              return preference?.enableWhatsApp ?? true;
            }
            if (channel === NotificationChannel.SMS) {
              return preference?.enableSMS ?? true;
            }
            return false;
          };

          let directChannel: NotificationChannel | null = null;
          if (
            isMessagingChannel(preferredChannel) &&
            isChannelEnabled(preferredChannel)
          ) {
            directChannel = preferredChannel as NotificationChannel;
          } else if (
            isMessagingChannel(fallbackChannel) &&
            isChannelEnabled(fallbackChannel)
          ) {
            directChannel = fallbackChannel as NotificationChannel;
          } else if (!preference) {
            directChannel = NotificationChannel.WHATSAPP;
          }

          recipientAudit.direct.preferredChannel = preferredChannel;
          recipientAudit.direct.channel = directChannel;

          if (directChannel) {
            const shortMsg = `📋 New project invitation: "${project.projectName}" in ${project.region}. ${tradeCopy.directMessage} Check your email or log in to respond.`;
            const sendResult = await this.notificationService.send({
              professionalId: professional.id,
              phoneNumber: professional.phone,
              channel: directChannel,
              eventType: 'project_invitation',
              message: shortMsg,
            });

            if (sendResult.success) {
              recipientAudit.direct.status = 'sent';
            } else {
              recipientAudit.direct.status = 'failed';
              recipientAudit.direct.error =
                sendResult.error || 'Direct invitation notification failed';
            }
          } else {
            recipientAudit.direct.status = 'skipped';
            recipientAudit.direct.reason = preference
              ? 'no_enabled_messaging_channel'
              : 'missing_notification_preference';
          }

          // Push notification for new project match (independent of SMS/WhatsApp channel)
          void this.pushService.sendToProfessional(professional.id, {
            title: 'New Project Match',
            body: `You've been matched to "${project.projectName}" in ${project.region}. Review and submit your quote.`,
            url: `/professional-projects?projectId=${projectId}`,
            tag: `project-invite-${projectId}-${professional.id}`,
          });
        } catch (err) {
          recipientAudit.direct.status = 'failed';
          recipientAudit.direct.error = err?.message;
          console.error('[ProjectsService.inviteProfessionals] WhatsApp/SMS failed', { professionalId: professional.id, error: err?.message });
        }
      } else {
        recipientAudit.direct.status = 'skipped';
        recipientAudit.direct.reason = 'missing_phone';
      }

      // Push notification for new project match (fires regardless of phone/SMS channel)
      try {
        void this.pushService.sendToProfessional(professional.id, {
          title: 'New Project Match',
          body: `You've been matched to "${project.projectName}" in ${project.region}. Review and submit your quote.`,
          url: `/professional-projects?projectId=${projectId}`,
          tag: `project-invite-${projectId}-${professional.id}`,
        });
      } catch { /* push is fire-and-forget */ }

      this.pushNotificationAuditRecipient(notificationAudit, recipientAudit);
    }

    await this.finalizeNotificationAudit(notificationAudit);

    return { success: true, invitedCount: professionals.length };
  }

  // Mark professionals as selected for a project without invitations
  async selectProfessionals(projectId: string, professionalIds: string[]) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const ids = Array.isArray(professionalIds)
      ? Array.from(new Set(professionalIds.filter(Boolean)))
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('At least one professionalId is required');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException('Project not found');

    const professionals = await this.getProjectSelectableProfessionals(ids, {
      requireEmergencyCallout: !!project.isEmergency,
    });

    const invitationScopeByProfessionalId = new Map(
      professionals.map((professional) => [
        professional.id,
        this.deriveInvitationTradeScope(project.tradesRequired || [], professional),
      ]),
    );

    const results: any[] = [];
    for (const proId of ids) {
      const existing = await this.prisma.projectProfessional
        .findUnique({
          where: {
            projectId_professionalId: { projectId, professionalId: proId },
          },
        })
        .catch(() => null);

      if (!existing) {
        let created: any;
        try {
          created = await (this.prisma as any).projectProfessional.create({
            data: {
              projectId,
              professionalId: proId,
              ...this.buildProjectProfessionalTradeScopeWrite({
                status: 'selected',
                requestedTrades:
                  invitationScopeByProfessionalId.get(proId)?.requestedTrades || [],
                projectTrades:
                  invitationScopeByProfessionalId.get(proId)?.projectTrades || [],
                includeTradeScope: true,
              }),
            },
          });
        } catch (error) {
          if (!this.isMissingProjectProfessionalTradeScopeFieldError(error)) {
            throw error;
          }
          this.throwProjectProfessionalTradeScopeSchemaError(error);
        }
        results.push(created);
      } else {
        try {
          await (this.prisma as any).projectProfessional.update({
            where: { id: existing.id },
            data: {
              quoteRequestedTrades:
                invitationScopeByProfessionalId.get(proId)?.requestedTrades || [],
              projectTradesSnapshot:
                invitationScopeByProfessionalId.get(proId)?.projectTrades || [],
            },
          });
        } catch (error) {
          if (!this.isMissingProjectProfessionalTradeScopeFieldError(error)) {
            throw error;
          }
          this.throwProjectProfessionalTradeScopeSchemaError(error);
        }
        // Preserve existing lifecycle status for already-linked professionals.
        // Do not downgrade active invitations back to `selected`, otherwise they
        // disappear from the bidding board even though bidding is still live.
        results.push({
          ...existing,
          quoteRequestedTrades:
            invitationScopeByProfessionalId.get(proId)?.requestedTrades || [],
          projectTradesSnapshot:
            invitationScopeByProfessionalId.get(proId)?.projectTrades || [],
        });
      }
    }

    return {
      ok: true,
      count: results.length,
      items: this.dedupeProfessionals(results),
    } as any;
  }

  async create(createProjectDto: CreateProjectDto) {
    const {
      professionalIds,
      professionalTradeScopes,
      userId,
      photos,
      photoUrls,
      aiIntakeId,
      requiresSurveyService,
      requiresDesignService,
      ...rest
    } = createProjectDto;
    // Strip legacy professionalId from the data object so Prisma does not see an unknown field

    const { professionalId: _legacyField, ...projectData } = rest as any;

    const normalizedPhotos = this.normalizePhotos(photos, photoUrls);
    let aiIntakeContext: any = null;

    if (aiIntakeId) {
      try {
        aiIntakeContext = await (this.prisma as any).aiIntake.findUnique({
          where: { id: aiIntakeId },
          select: {
            id: true,
            title: true,
            summary: true,
            scope: true,
            project: true,
            rawOutput: true,
            overallConfidence: true,
          },
        });
      } catch (error) {
        console.warn('[ProjectsService.create] Failed to load AI intake context:', {
          aiIntakeId,
          error: (error as Error)?.message,
        });
      }
    }

    // Backward compatibility: allow single professionalId in payload
    const ids: string[] = Array.isArray(professionalIds)
      ? Array.from(new Set(professionalIds.filter(Boolean)))
      : [];

    const legacyId = (createProjectDto as any).professionalId;
    if (legacyId && !ids.includes(legacyId)) ids.push(legacyId);

    // Professional IDs are optional - projects can be created without selecting professionals yet
    // Professionals can be invited after project creation

    // Debug: log invitation targets (safe for troubleshooting)
    if (ids.length > 0) {
      console.log('[ProjectsService.create] inviting professionals:', ids);
    }

    // Fetch professionals for email (if any)
    let professionals: any[] = [];
    if (ids.length > 0) {
      professionals = await this.getProjectSelectableProfessionals(ids, {
        requireEmergencyCallout: !!createProjectDto.isEmergency,
      });
    }

    // Transform userId into user relation for Prisma
    // Normalize date fields. Date-only inputs are treated as Hong Kong local date and stored in UTC.
    const normalized: any = { ...projectData };
    normalized.startDate = this.normalizeDateInput(normalized.startDate);
    normalized.endDate = this.normalizeDateInput(normalized.endDate);
    normalized.siteInspectionAvailableOn = this.normalizeDateInput(normalized.siteInspectionAvailableOn);
    if (!normalized.projectScale && aiIntakeContext) {
      normalized.projectScale = this.getAiIntakeProjectScale(aiIntakeContext) || undefined;
    }

    const normalizedProjectTrades = this.normalizeTradeLabels(
      Array.isArray(normalized.tradesRequired) ? normalized.tradesRequired : [],
    );
    const explicitScopePairs = (professionalTradeScopes || [])
      .filter((scope) => scope?.professionalId)
      .map((scope) => [String(scope.professionalId).trim(), this.normalizeTradeLabels(scope.requestedTrades || [])] as const);
    const explicitScopeByProfessionalId = new Map(explicitScopePairs);
    const explicitScopeList = explicitScopePairs.map(([, requestedTrades]) => requestedTrades);
    const invitationScopeByProfessionalId = new Map(
      professionals.map((professional, index) => {
        const professionalId = String(professional.id || '').trim();
        const explicitRequestedTrades =
          explicitScopeByProfessionalId.get(professionalId) || explicitScopeList[index] || [];

        return [
          professional.id,
          this.resolveInvitationTradeScope(
            normalizedProjectTrades,
            professional,
            explicitRequestedTrades,
          ),
        ] as const;
      }),
    );

    const resolvedScale = this.inferProjectScaleFromContext({
      explicitScale: (createProjectDto as any).projectScale,
      tradesRequired: normalizedProjectTrades,
      isEmergency: Boolean(normalized.isEmergency),
    });
    normalized.projectScale = resolvedScale;
    normalized.escrowFundingPolicy = this.escrowPolicyForScale(resolvedScale);

    const buildCreateData = (includeTradeScope: boolean) => ({
      ...normalized,
      currentStage: ids.length > 0 ? ProjectStage.BIDDING_ACTIVE : ProjectStage.CREATED,
      professionals: {
        create: ids.map((id) => ({
          professionalId: id,
          ...this.buildProjectProfessionalTradeScopeWrite({
            status: 'pending',
            requestedTrades:
              invitationScopeByProfessionalId.get(id)?.requestedTrades || [],
            projectTrades:
              invitationScopeByProfessionalId.get(id)?.projectTrades || [],
            includeTradeScope,
          }),
        })),
      },
    });

    const createData: any = buildCreateData(true);

    // Link to AI intake if provided
    if (aiIntakeId) {
      createData.aiIntakeId = aiIntakeId;
    }

    if (normalizedPhotos.length > 0) {
      createData.photos = {
        create: normalizedPhotos.map((p) => ({ url: p.url, note: p.note })),
      };
    }

    if (userId) {
      createData.user = { connect: { id: userId } };
    }

    const enrichCreateData = (data: any) => {
      const enriched = { ...data };

      if (aiIntakeId) {
        enriched.aiIntakeId = aiIntakeId;
      }

      if (normalizedPhotos.length > 0) {
        enriched.photos = {
          create: normalizedPhotos.map((p) => ({ url: p.url, note: p.note })),
        };
      }

      if (userId) {
        enriched.user = { connect: { id: userId } };
      }

      return enriched;
    };

    const createProjectRecord = async (data: any) => {
      return this.prisma.project.create({
        data,
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          photos: true,
        },
      });
    };

    // Create project with all ProjectProfessional junctions
    let project: any;
    try {
      project = await createProjectRecord(createData);
    } catch (error) {
      let retryError: any = error;

      if (this.isMissingProjectActivityColumnError(retryError)) {
        console.warn('[ProjectsService.create] Missing Project activity column detected, applying hotfix DDL and retrying');
        try {
          await this.ensureProjectActivityColumns();
          project = await createProjectRecord(createData);
          retryError = null;
        } catch (ddlRetryError) {
          retryError = ddlRetryError;
        }
      }

      if (!project && this.isMissingProjectProfessionalTradeScopeFieldError(retryError)) {
        this.throwProjectProfessionalTradeScopeSchemaError(retryError);
      }

      if (!project) {
        throw retryError;
      }
    }

    // Create invitation messages for each professional
    const requestedExtras: Array<'survey' | 'design'> = [];
    if (requiresSurveyService === true) {
      try {
        await this.persistProjectExtraRequest(project.id, 'survey', {
          title: 'Mimo Surveying+',
          summary: 'Client requested Mimo Surveying+ service from AI wizard/project flow.',
          source: 'project_create',
          price: 500,
        });
        requestedExtras.push('survey');
      } catch (error) {
        console.warn('[ProjectsService.create] Failed to persist survey extra request:', {
          projectId: project.id,
          error: (error as Error)?.message,
        });
      }
    }

    if (requiresDesignService === true) {
      try {
        await this.persistProjectExtraRequest(project.id, 'design', {
          title: 'Mimo Interior Design',
          summary: 'Client requested Mimo Interior Design service from AI wizard/project flow.',
          source: 'project_create',
        });
        requestedExtras.push('design');
      } catch (error) {
        console.warn('[ProjectsService.create] Failed to persist design extra request:', {
          projectId: project.id,
          error: (error as Error)?.message,
        });
      }
    }

    if (requestedExtras.length > 0) {
      try {
        await this.signalAdminFeedForProjectExtras(
          {
            id: project.id,
            projectName: project.projectName,
            clientName: project.clientName,
            region: project.region,
            userId: project.userId,
          },
          requestedExtras,
        );
      } catch (error) {
        console.warn('[ProjectsService.create] Failed to signal admin feed for requested extras:', {
          projectId: project.id,
          error: (error as Error)?.message,
        });
      }
    }

    if (professionals.length > 0 && project.professionals.length > 0) {
      const messagePromises = project.professionals.map(async (projectProfessional) => {
        const professional = professionals.find(p => p.id === projectProfessional.professionalId);
        if (!professional) return;
        const tradeScope = invitationScopeByProfessionalId.get(projectProfessional.professionalId) || {
          requestedTrades: [],
          otherRequiredTrades: [],
          projectTrades: normalizedProjectTrades,
        };
        const tradeCopy = this.buildInvitationTradeCopy(tradeScope);
        const emergencyAiInvite = project.isEmergency
          ? this.buildEmergencyAiInviteSnippet(aiIntakeContext)
          : null;

        const budgetText = project.budget 
          ? `Budget: HK$${project.budget.toLocaleString()}`
          : 'Budget: TBD';

        const timelineText = project.endDate 
          ? `Timeline: Needed by ${new Date(project.endDate).toLocaleDateString()}`
          : 'Timeline: Flexible';

        const invitationTitle = tradeCopy.requestedTradesLine
          ? `${project.projectName} - ${tradeCopy.requestedTradesLine.replace('Trade required from you: ', '')}`
          : project.projectName;

        const invitationMessage = project.isEmergency
          ? `🚨 EMERGENCY PROJECT: ${project.projectName}

This is an urgent request requiring immediate attention.
⏱ Response needed within 1 hour.

${tradeCopy.requestedTradesLine ? `${tradeCopy.requestedTradesLine}\n` : ''}${tradeCopy.otherRequiredTradesLine ? `${tradeCopy.otherRequiredTradesLine}\n` : ''}${tradeCopy.projectTradesLine}
${emergencyAiInvite?.inAppLines.length ? `${emergencyAiInvite.inAppLines.join('\n')}\n` : ''}Region: ${project.region}

Please review the project details and respond immediately with your availability or decline. Emergency callout rates apply.`
          : `📋 New Project Invitation

You've been invited to submit a quote for this project.

${invitationTitle}
${budgetText}
${tradeCopy.requestedTradesLine ? `${tradeCopy.requestedTradesLine}
` : ''}${tradeCopy.otherRequiredTradesLine ? `${tradeCopy.otherRequiredTradesLine}
` : ''}${tradeCopy.projectTradesLine}
Region: ${project.region}
${timelineText}

Please review the project details and respond with your quote or decline the invitation.`;

        return this.prisma.message.create({
          data: {
            projectProfessionalId: projectProfessional.id,
            senderType: 'client',
            senderClientId: project.userId || project.clientId,
            content: invitationMessage,
          },
        });
      });

      await Promise.all(messagePromises);
    }

    // Generate secure tokens and send invitation emails for each professional
    const tokenPromises: any[] = [];
    const emailPromises: any[] = [];
    const directNotificationPromises: any[] = [];

    for (const professional of professionals) {
      const acceptToken = createId();
      const declineToken = createId();
      const authToken = createId();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      const authExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for auth token

      // Store tokens in database
      tokenPromises.push(
        this.prisma.emailToken.create({
          data: {
            token: acceptToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'accept',
            expiresAt,
          },
        }),
        this.prisma.emailToken.create({
          data: {
            token: declineToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'decline',
            expiresAt,
          },
        }),
        this.prisma.emailToken.create({
          data: {
            token: authToken,
            projectId: project.id,
            professionalId: professional.id,
            action: 'auth',
            expiresAt: authExpiresAt,
          },
        }),
      );

      // Send invitation email
      const professionalName =
        professional.fullName || professional.businessName || 'Professional';
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const quoteWindowLabel = project.isEmergency ? '1 hour' : '3 days';
      const tradeScope = invitationScopeByProfessionalId.get(professional.id) || {
        requestedTrades: [],
        otherRequiredTrades: [],
        projectTrades: normalizedProjectTrades,
      };
      const tradeCopy = this.buildInvitationTradeCopy(tradeScope);
      const emergencyAiInvite = project.isEmergency
        ? this.buildEmergencyAiInviteSnippet(aiIntakeContext)
        : null;

      emailPromises.push(
        this.emailService
          .sendProjectInvitation({
            to: professional.email,
            professionalName,
            projectName: project.projectName,
            projectDescription:
              (project.isEmergency && emergencyAiInvite?.emailDescription) ||
              project.notes ||
              'No description provided',
            location: project.region,
            requestedTradesText: tradeScope.requestedTrades.join(', '),
            otherRequiredTradesText: tradeScope.otherRequiredTrades.join(', '),
            projectTradesText: tradeScope.projectTrades.join(', '),
            acceptToken,
            declineToken,
            authToken,
            projectId: project.id,
            baseUrl,
            quoteWindowLabel,
          })
          .catch((err) => {
            console.error('[ProjectsService.create] failed to send invite', {
              to: professional.email,
              error: err?.message,
            });
            return null;
          }),
      );

      // Send direct notification via preferred communication channel (if configured)
      if (professional.phone) {
        directNotificationPromises.push(
          (async () => {
            try {
              const preference = await this.prisma.notificationPreference.findUnique({
                where: { professionalId: professional.id },
                select: {
                  primaryChannel: true,
                  fallbackChannel: true,
                  enableWhatsApp: true,
                  enableSMS: true,
                },
              });

              const preferredChannel = preference?.primaryChannel;
              const fallbackChannel = preference?.fallbackChannel;

              const isMessagingChannel = (channel?: NotificationChannel | null) =>
                channel === NotificationChannel.WHATSAPP ||
                channel === NotificationChannel.SMS;

              const isChannelEnabled = (channel?: NotificationChannel | null) => {
                if (!channel) return false;
                if (channel === NotificationChannel.WHATSAPP) {
                  return preference?.enableWhatsApp ?? true;
                }
                if (channel === NotificationChannel.SMS) {
                  return preference?.enableSMS ?? true;
                }
                return false;
              };

              let directChannel: NotificationChannel | null = null;
              if (
                isMessagingChannel(preferredChannel) &&
                isChannelEnabled(preferredChannel)
              ) {
                directChannel = preferredChannel as NotificationChannel;
              } else if (
                isMessagingChannel(fallbackChannel) &&
                isChannelEnabled(fallbackChannel)
              ) {
                directChannel = fallbackChannel as NotificationChannel;
              } else if (!preference) {
                directChannel = NotificationChannel.WHATSAPP;
              }

              if (!directChannel) {
                return;
              }

              const shortMsg = `📋 New project invitation: "${project.projectName}" in ${project.region}. ${tradeCopy.directMessage}${project.isEmergency && emergencyAiInvite?.directMessageSuffix ? emergencyAiInvite.directMessageSuffix : ''} Check your email or log in to respond.`;
              const sendResult = await this.notificationService.send({
                professionalId: professional.id,
                phoneNumber: professional.phone,
                channel: directChannel,
                eventType: 'project_invitation',
                message: shortMsg,
              });

              if (!sendResult.success) {
                console.error(
                  '[ProjectsService.create] preferred direct invitation failed',
                  {
                    professionalId: professional.id,
                    channel: directChannel,
                    error: sendResult.error,
                  },
                );
              }
            } catch (err) {
              console.error(
                '[ProjectsService.create] preferred direct invitation failed',
                {
                  professionalId: professional.id,
                  error: err?.message,
                },
              );
            }
          })(),
        );
      }
    }

    // Execute all token creations and email sends in parallel
    await Promise.all([...tokenPromises, ...emailPromises, ...directNotificationPromises]);

    // Link the AI intake to the project if provided
    if (aiIntakeId && userId) {
      try {
        await this.prisma.aiIntake.update({
          where: { id: aiIntakeId },
          data: {
            projectId: project.id,
            status: 'converted',
          },
        });
      } catch (err) {
        // Silently fail AI intake linking - project was already created successfully
        console.warn('[ProjectsService.create] Failed to link AI intake:', {
          aiIntakeId,
          projectId: project.id,
          error: (err as Error)?.message,
        });
      }
    }

    // Fire-and-forget: auto-generate initial AI scope for the new project.
    // Runs non-blocking so project creation is never delayed or blocked.
    this.aiService
      .generateProjectScope(
        project.id,
        { actorId: project.userId || project.clientId || 'system', role: 'admin' },
        {},
      )
      .catch((err) => {
        console.warn('[ProjectsService.create] Auto scope generation failed (non-fatal):', {
          projectId: project.id,
          error: (err as Error)?.message,
        });
      });

    return {
      ...project,
      photos: this.resolveProjectPhotos((project as any).photos),
    } as any;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    const { photos, photoUrls, ...rest } = updateProjectDto;
    const hasPhotoUpdate = photos !== undefined || photoUrls !== undefined;
    const normalizedPhotos = hasPhotoUpdate
      ? this.normalizePhotos(photos, photoUrls)
      : [];

    // Normalize dates if provided
    if (typeof (rest as any).startDate === 'string' && (rest as any).startDate) {
      (rest as any).startDate = new Date((rest as any).startDate);
    }
    if (typeof (rest as any).endDate === 'string' && (rest as any).endDate) {
      (rest as any).endDate = new Date((rest as any).endDate);
    }

    return this.prisma.$transaction(async (tx) => {
      if (hasPhotoUpdate) {
        await tx.projectPhoto.deleteMany({ where: { projectId: id } });
        if (normalizedPhotos.length > 0) {
          await tx.projectPhoto.createMany({
            data: normalizedPhotos.map((p) => ({ projectId: id, url: p.url, note: p.note })),
          });
        }
      }

      const project = await tx.project.update({
        where: { id },
        data: rest,
        include: {

          professionals: {
            include: {
              professional: true,
            },
          },
          photos: true,
        },
      });

      return {
        ...project,
        professionals: this.dedupeProfessionals((project as any).professionals),
        photos: this.resolveProjectPhotos((project as any).photos),
      } as any;
    });
  }

  /**
   * Get S3 client for Cloudflare R2
   */
  private getS3Client() {
    try {
      const { S3Client } = require('@aws-sdk/client-s3');
      
      const accountId = process.env.STORAGE_ACCOUNT_ID;
      const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
      const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

      if (!accountId || !accessKeyId || !secretAccessKey) {
        console.warn('Storage credentials not configured');
        return null;
      }

      return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } catch (error) {
      console.error('Failed to initialize S3 client:', error);
      return null;
    }
  }

  /**
   * Delete a specific photo and remove it from Cloudflare R2
   */
  async deletePhoto(projectId: string, photoId: string) {
    // Get photo to extract filename
    const photo = await this.prisma.projectPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new BadRequestException('Photo not found');
    }

    if (photo.projectId !== projectId) {
      throw new BadRequestException('Photo does not belong to this project');
    }

    try {
      // Extract object key from stored URL/key
      const filename = extractObjectKeyFromValue(photo.url);
      
      if (filename) {
        // Delete from Cloudflare R2
        const s3 = this.getS3Client();
        if (s3) {
          try {
            const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
            const bucket = process.env.STORAGE_BUCKET;
            
            if (bucket) {
              await s3.send(
                new DeleteObjectCommand({
                  Bucket: bucket,
                  Key: filename,
                }),
              );
            }
          } catch (s3Error) {
            console.error('Failed to delete from R2:', s3Error);
            // Continue - delete from DB even if R2 delete fails
          }
        }
      }

      // Delete from database
      await this.prisma.projectPhoto.delete({
        where: { id: photoId },
      });

      return { success: true, photoId };
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw new BadRequestException('Failed to delete photo');
    }
  }

  /**
   * Update a photo's note
   */
  async updatePhoto(projectId: string, photoId: string, note?: string) {
    const photo = await this.prisma.projectPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new BadRequestException('Photo not found');
    }

    if (photo.projectId !== projectId) {
      throw new BadRequestException('Photo does not belong to this project');
    }

    return this.prisma.projectPhoto.update({
      where: { id: photoId },
      data: { note: note || null },
    });
  }

  /**
   * Create a financial transaction for a project
   */
  async createFinancialTransaction(
    projectId: string,
    data: {
      type: string;
      description: string;
      amount: string;
      status: string;
      requestedBy?: string;
      requestedByRole?: string;
      actionBy?: string;
      actionByRole?: string;
      projectProfessionalId?: string;
    },
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const amount = new Decimal(data.amount);

    return this.prisma.financialTransaction.create({
      data: {
        projectId,
        projectProfessionalId: data.projectProfessionalId || null,
        type: data.type,
        description: data.description,
        amount,
        status: data.status,
        requestedBy: data.requestedBy,
        requestedByRole: data.requestedByRole,
        actionBy: data.actionBy,
        actionByRole: data.actionByRole,
      },
    });
  }

  async respondToInvitation(token: string, action: 'accept' | 'decline') {
    // Validate token
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
    });

    if (!emailToken) {
      throw new Error('Invalid or expired token');
    }

    if (emailToken.usedAt) {
      throw new Error('This link has already been used');
    }

    if (new Date() > emailToken.expiresAt) {
      throw new Error('This invitation has expired');
    }

    if (emailToken.action !== action) {
      throw new Error('Invalid action for this token');
    }

    // Fetch professional and project separately
    const [professional, project] = await Promise.all([
      this.prisma.professional.findUnique({
        where: { id: emailToken.professionalId },
      }),
      this.prisma.project.findUnique({
        where: { id: emailToken.projectId },
        include: {

        },
      }),
    ]);

    if (!professional || !project) {
      throw new Error('Professional or project not found');
    }

    // Mark token as used
    await this.prisma.emailToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    // Update ProjectProfessional status
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    await this.prisma.projectProfessional.updateMany({
      where: {
        projectId: emailToken.projectId,
        professionalId: emailToken.professionalId,
      },
      data: {
        status: newStatus,
        respondedAt: new Date(),
      },
    });

    const projectProfessional = await this.prisma.projectProfessional.findUnique({
      where: {
        projectId_professionalId: {
          projectId: emailToken.projectId,
          professionalId: emailToken.professionalId,
        },
      },
      select: { id: true },
    });

    // Send follow-up email if accepted
    if (action === 'accept') {
      const professionalName =
        professional.fullName || professional.businessName || 'Professional';
      const quoteWindowLabel = project.isEmergency ? '1 hour' : '3 days';
      const webBaseUrl =
        process.env.WEB_BASE_URL ||
        process.env.FRONTEND_BASE_URL ||
        process.env.APP_WEB_URL ||
        'https://fitouthub-web.vercel.app';

      await this.emailService.sendProjectAccepted({
        to: professional.email,
        professionalName,
        projectName: project.projectName,
        projectId: emailToken.projectId,
        professionalId: emailToken.professionalId,
        baseUrl: webBaseUrl,
        quoteWindowLabel,
      });
    }

    return {
      success: true,
      message:
        action === 'accept'
          ? `Thank you for accepting! Please submit your quote within ${project.isEmergency ? '1 hour' : '3 days'} from invitation.`
          : 'Project declined. Thank you for your response.',
      projectId: emailToken.projectId,
      professionalId: emailToken.professionalId,
      projectProfessionalId: projectProfessional?.id,
    };
  }

  async validateMagicAuthToken(token: string) {
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
    });

    if (!emailToken) {
      throw new Error('Invalid or expired token');
    }

    if (emailToken.action !== 'auth') {
      throw new Error('Invalid token type');
    }

    if (new Date() > emailToken.expiresAt) {
      throw new Error('This link has expired');
    }

    const professional = await this.prisma.professional.findUnique({
      where: { id: emailToken.professionalId },
    });

    if (!professional) {
      throw new Error('Professional not found');
    }

    return {
      professional,
      projectId: emailToken.projectId,
      professionalId: emailToken.professionalId,
    };
  }

  async getAcceptTokenForMagicLink(magicToken: string) {
    // Find the auth token to get projectId and professionalId
    const authToken = await this.prisma.emailToken.findUnique({
      where: { token: magicToken },
    });

    if (!authToken) {
      return null;
    }

    // Find the corresponding accept token for same project/professional
    const acceptToken = await this.prisma.emailToken.findFirst({
      where: {
        projectId: authToken.projectId,
        professionalId: authToken.professionalId,
        action: 'accept',
      },
    });

    return acceptToken || null;
  }

  async submitQuote(
    projectId: string,
    professionalId: string,
    quoteAmount: number,
    quoteNotes?: string,
    quoteEstimatedStartAt?: string,
    quoteEstimatedDurationMinutes?: number,
  ) {
    // Verify professional has accepted this project
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          project: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
          },
          professional: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('You are not invited to this project');
    }

    if (projectProfessional.status !== 'accepted') {
      throw new Error('You must accept the project before submitting a quote');
    }

    if (projectProfessional.quotedAt) {
      throw new Error('You have already submitted a quote for this project');
    }

    const inviteCreatedAt = projectProfessional.createdAt
      ? new Date(projectProfessional.createdAt)
      : null;
    const quoteWindowMs = projectProfessional.project?.isEmergency
      ? 1 * 60 * 60 * 1000
      : 3 * 24 * 60 * 60 * 1000;

    if (inviteCreatedAt) {
      const extendedUntil = (projectProfessional as any).quoteExtendedUntil
        ? new Date((projectProfessional as any).quoteExtendedUntil)
        : null;
      const quoteDeadline = extendedUntil ?? new Date(inviteCreatedAt.getTime() + quoteWindowMs);
      if (new Date() > quoteDeadline) {
        throw new Error(
          projectProfessional.project?.isEmergency
            ? 'Initial quote window closed (1 hour from invitation)'
            : 'Initial quote window closed (3 days from invitation)',
        );
      }
    }

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const hasApprovedAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);
    const isVisitScheduled =
      latestAccessRequest?.status === 'approved_visit_scheduled';
    const hasVisited =
      !!latestAccessRequest?.visitedAt || latestAccessRequest?.status === 'visited';
    const isRemoteQuote = !hasApprovedAccess || (isVisitScheduled && !hasVisited);
    const visitApprovedButNotDone = isVisitScheduled && !hasVisited;
    const quoteSchedule = this.normalizeQuoteSchedule(
      {
        quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes,
      },
      { required: true },
    );

    // Update ProjectProfessional with quote
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        status: 'quoted',
        quoteAmount,
        quoteNotes,
        quoteEstimatedStartAt: quoteSchedule.quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes:
          quoteSchedule.quoteEstimatedDurationMinutes,
        quotedAt: new Date(),
        visitApprovedButNotDone,
      },
    });

    if (latestAccessRequest) {
      await this.prisma.siteAccessRequest.update({
        where: { id: latestAccessRequest.id },
        data: {
          quoteCreatedAfterAccess: true,
          quoteIsRemote: isRemoteQuote,
        },
      });
    }

    // Notify client
    const clientActorId =
      projectProfessional.project.user?.id ||
      projectProfessional.project.userId ||
      projectProfessional.project.clientId ||
      'unknown-client';
    const clientEmail = projectProfessional.project.user?.email || 'client@example.com';
    const professionalName =
      projectProfessional.professional.fullName ||
      projectProfessional.professional.businessName ||
      'Professional';
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const notificationAudit = this.createNotificationAudit(
      'quote_submitted_notifications',
      projectId,
      {
        professionalId,
        projectProfessionalId: projectProfessional.id,
      },
    );

    const clientAudit: NotificationAuditRecipient = {
      actorType: 'client',
      actorId: clientActorId,
      role: 'quote_submit_recipient',
      email: { status: 'skipped' },
      direct: {
        status: 'skipped',
        reason: 'not_implemented_client_direct_notification',
      },
    };

    try {
      await this.emailService.sendQuoteSubmitted({
        to: clientEmail,
        clientName: projectProfessional.project.clientName,
        professionalName,
        projectName: projectProfessional.project.projectName,
        quoteAmount,
        projectId,
        baseUrl,
      });
      clientAudit.email.status = 'sent';

      // Push notification for new quote
      const clientUserId = projectProfessional.project.user?.id;
      if (clientUserId) {
        void this.pushService.sendToUser(clientUserId, {
          title: 'New Quote Received',
          body: `${professionalName} submitted a quote of HK$${quoteAmount.toLocaleString()} for "${projectProfessional.project.projectName}".`,
          url: `/projects/${projectId}?tab=quotes`,
          tag: `quote-submitted-${projectProfessional.id}`,
        });
      }
    } catch (error) {
      clientAudit.email.status = 'failed';
      clientAudit.email.error = error?.message;
      this.pushNotificationAuditRecipient(notificationAudit, clientAudit);
      await this.finalizeNotificationAudit(notificationAudit);
      throw error;
    }

    this.pushNotificationAuditRecipient(notificationAudit, clientAudit);
    await this.finalizeNotificationAudit(notificationAudit);

    return {
      success: true,
      message: 'Quote submitted successfully',
      quoteAmount,
      quoteIsRemote: isRemoteQuote,
    };
  }

  async remindQuote(projectId: string, ppId: string, clientUserId: string) {
    const pp = await this.prisma.projectProfessional.findFirst({
      where: { id: ppId, projectId },
      include: {
        project: { include: { user: true } },
        professional: true,
      },
    });

    if (!pp) throw new BadRequestException('Professional record not found on this project');

    // Verify client ownership
    const project = pp.project as any;
    const isOwner =
      (project.userId && project.userId === clientUserId) ||
      (project.clientId && project.clientId === clientUserId) ||
      (!project.userId && !project.clientId);
    if (!isOwner) throw new BadRequestException('You do not have access to this project');

    const remindableStatuses = ['selected', 'pending', 'accepted'];
    if (!remindableStatuses.includes(pp.status)) {
      throw new BadRequestException('Cannot send reminder: professional is not in an active bidding state');
    }

    if (pp.quotedAt) throw new BadRequestException('Professional has already submitted a quote');

    if ((pp as any).quoteReminderSentAt) {
      throw new BadRequestException('A reminder has already been sent to this professional (one-shot only)');
    }

    const quoteExtendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nextStatus = pp.status === 'selected' ? 'pending' : pp.status;

    const updated = await this.prisma.projectProfessional.update({
      where: { id: ppId },
      data: {
        status: nextStatus,
        quoteReminderSentAt: new Date(),
        quoteExtendedUntil,
      } as any,
    });

    // Send email notification
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const professionalName = pp.professional.fullName || pp.professional.businessName || 'Professional';
    try {
      await this.emailService.sendQuoteExtensionReminder({
        to: pp.professional.email,
        professionalName,
        projectName: project.projectName,
        projectId,
        professionalId: pp.professionalId,
        baseUrl,
        newDeadline: quoteExtendedUntil,
      });
    } catch (err) {
      console.error('[ProjectsService.remindQuote] email failed:', err?.message);
    }

    // Also send WhatsApp/SMS if professional has a phone and messaging preference
    if (pp.professional.phone) {
      try {
        const preference = await this.prisma.notificationPreference.findUnique({
          where: { professionalId: pp.professionalId },
          select: { primaryChannel: true, fallbackChannel: true, enableWhatsApp: true, enableSMS: true },
        });
        const preferredChannel = preference?.primaryChannel;
        const isWhatsApp = preferredChannel === NotificationChannel.WHATSAPP && (preference?.enableWhatsApp ?? true);
        const isSms = preferredChannel === NotificationChannel.SMS && (preference?.enableSMS ?? true);
        const directChannel = isWhatsApp
          ? NotificationChannel.WHATSAPP
          : isSms
          ? NotificationChannel.SMS
          : !preference
          ? NotificationChannel.WHATSAPP
          : null;

        if (directChannel) {
          const msg = `\u23f0 Your quote deadline for \"${project.projectName}\" has been extended by 24 hours by the client. Log in to submit now.`;
          await this.notificationService.send({
            professionalId: pp.professionalId,
            phoneNumber: pp.professional.phone,
            channel: directChannel,
            eventType: 'quote_extension_reminder',
            message: msg,
          });
        }
      } catch (err) {
        console.error('[ProjectsService.remindQuote] WhatsApp/SMS failed:', err?.message);
      }
    }

    return {
      success: true,
      status: (updated as any).status,
      quoteReminderSentAt: (updated as any).quoteReminderSentAt,
      quoteExtendedUntil: (updated as any).quoteExtendedUntil,
    };
  }

  private async assertClientProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        clientId: true,
        projectName: true,
        status: true,
        escrowRequired: true,
        escrowHeld: true,
        locationDetailsRequiredAt: true,
        siteInspectionAvailableOn: true,
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const isOwner =
      (project.userId && project.userId === userId) ||
      (project.clientId && project.clientId === userId) ||
      (!project.userId && !project.clientId);

    if (!isOwner) {
      throw new BadRequestException('You do not have access to this project');
    }

    return project;
  }

  private normalizeDateInput(value: unknown): Date | undefined {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }

    const trimmed = value.trim();
    const hkDateOnly = this.parseHongKongDateOnlyToUtc(trimmed);
    if (hkDateOnly) {
      return hkDateOnly;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private parseHongKongDateOnlyToUtc(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);

    // Interpret entered date as 00:00 in Hong Kong (UTC+8), then store UTC instant.
    const utcMillis = Date.UTC(year, monthIndex, day, -HK_TIMEZONE_OFFSET_HOURS, 0, 0, 0);
    return new Date(utcMillis);
  }

  private formatHongKongDateInput(value?: Date | string | null): string | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const shifted = new Date(parsed.getTime() + HK_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatHongKongShortDateLabel(value?: Date | string | null): string | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(parsed);
  }

  private isValidInspectionHour(value?: string | null): boolean {
    if (!value) return false;
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return false;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return minute === 0 && hour >= 8 && hour <= 18;
  }

  private combineHongKongDateAndTimeToUtc(dateValue: string, timeValue: string): Date | null {
    const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = timeValue.match(/^(\d{2}):(\d{2})$/);
    if (!dateMatch || !timeMatch) return null;

    const year = Number(dateMatch[1]);
    const monthIndex = Number(dateMatch[2]) - 1;
    const day = Number(dateMatch[3]);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);

    const utcMillis = Date.UTC(year, monthIndex, day, hour - HK_TIMEZONE_OFFSET_HOURS, minute, 0, 0);
    return new Date(utcMillis);
  }

  private formatHongKongDateTimeLabel(value?: Date | string | null): string {
    if (!value) return 'unspecified time';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'unspecified time';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
  }

  private buildSiteAvailabilityChangeReason(nextDateLabel: string, reason: string): string {
    return `Site availability changed to ${nextDateLabel}. Previous visit slot is no longer valid. Reason: ${reason}`;
  }

  private async findConflictingSiteAccessSlot(projectId: string, visitScheduledAt: Date, excludeRequestId?: string) {
    return this.prisma.siteAccessRequest.findFirst({
      where: {
        projectId,
        visitScheduledAt,
        status: {
          in: ['pending', 'approved_visit_scheduled'],
        },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
      select: {
        id: true,
        professionalId: true,
        visitScheduledAt: true,
      },
    });
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

  private calculateProposalEndDate(startAt: Date, durationMinutes: number) {
    return new Date(startAt.getTime() + durationMinutes * 60 * 1000);
  }

  private getStartProposalActorRole(isProfessional: boolean): 'professional' | 'client' {
    return isProfessional ? 'professional' : 'client';
  }

  private getStartProposalActorLabel(role: 'professional' | 'client') {
    return role === 'professional' ? 'Professional' : 'Client';
  }

  private isProjectInContractWorkflowStage(stage?: string | null) {
    const contractWorkflowStages = new Set([
      'CONTRACT_PHASE',
      'PRE_WORK',
      'WORK_IN_PROGRESS',
      'MILESTONE_PENDING',
      'PAYMENT_RELEASED',
      'NEAR_COMPLETION',
      'FINAL_INSPECTION',
      'COMPLETE',
      'WARRANTY_PERIOD',
      'CLOSED',
    ]);

    const normalizedStage = String(stage || '').toUpperCase();
    return contractWorkflowStages.has(normalizedStage);
  }

  async requestProjectStartProposal(
    projectId: string,
    professionalId: string,
    body: { scheduledAt: string; durationMinutes: number; notes?: string },
  ) {
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is required');
    }

    const durationMinutes = Number(body.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 30) {
      throw new BadRequestException('durationMinutes must be at least 30');
    }
    if (durationMinutes > 60 * 24 * 30) {
      throw new BadRequestException('durationMinutes is too large');
    }

    const projectProfessional = await this.prisma.projectProfessional.findUnique({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      include: {
        professional: true,
        project: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    const isAwardedStatus = String(projectProfessional.status || '').toLowerCase() === 'awarded';
    const isContractWorkflowStage = this.isProjectInContractWorkflowStage(
      projectProfessional.project?.currentStage,
    );

    if (!isAwardedStatus && !isContractWorkflowStage) {
      throw new BadRequestException('Start details can only be proposed for awarded projects');
    }

    const latestProposal = await this.prisma.projectStartProposal.findFirst({
      where: {
        projectId,
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestProposal?.status === 'accepted') {
      throw new BadRequestException('Start details have already been agreed for this project');
    }

    if (latestProposal?.status === 'proposed') {
      throw new BadRequestException(
        latestProposal.proposedByRole === 'professional'
          ? 'Wait for the client to accept or update your proposed start first'
          : 'Use the response action on the latest client update instead of sending a new proposal',
      );
    }

    const proposal = await this.prisma.projectStartProposal.create({
      data: {
        projectId,
        projectProfessionalId: projectProfessional.id,
        professionalId,
        proposedByRole: 'professional',
        proposedByUserId: professionalId,
        proposedStartAt: scheduledAt,
        durationMinutes,
        notes: body.notes?.trim() || undefined,
        status: 'proposed',
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    const professionalName =
      projectProfessional.professional?.businessName ||
      projectProfessional.professional?.fullName ||
      'Professional';
    const durationLabel = this.formatDurationMinutes(durationMinutes);
    await this.addProjectChatMessage(
      projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} proposed starting on ${this.formatDateTime(scheduledAt)} for an estimated ${durationLabel}.${body.notes ? ` Notes: ${body.notes}` : ''}`,
    );

    try {
      const client = projectProfessional.project?.user;
      if (client?.id && client?.mobile) {
        await this.notificationService.send({
          userId: client.id,
          phoneNumber: client.mobile,
          eventType: 'project_start_proposed',
          message: `${professionalName} proposed a project start on ${this.formatDateTime(scheduledAt)} for "${projectProfessional.project.projectName}" (${durationLabel}).`,
        });
      }
    } catch (error) {
      console.error('Failed to send start proposal notification:', error);
    }

    return {
      success: true,
      proposal: {
        ...proposal,
        projectedEndAt: this.calculateProposalEndDate(scheduledAt, durationMinutes),
      },
    };
  }

  async respondToProjectStartProposal(
    proposalId: string,
    actorId: string,
    isProfessional: boolean,
    body: {
      status: 'accepted' | 'declined' | 'updated';
      updatedScheduledAt?: string;
      responseNotes?: string;
    },
  ) {
    const proposal = await this.prisma.projectStartProposal.findUnique({
      where: { id: proposalId },
      include: {
        project: {
          include: { user: true },
        },
        professional: true,
        projectProfessional: true,
      },
    });

    if (!proposal) {
      throw new BadRequestException('Start proposal not found');
    }

    if (proposal.status !== 'proposed') {
      throw new BadRequestException('This start proposal has already been responded to');
    }

    const actorRole = this.getStartProposalActorRole(isProfessional);
    const actorLabel = this.getStartProposalActorLabel(actorRole);
    const recipientRole = actorRole === 'professional' ? 'client' : 'professional';

    if (proposal.proposedByRole === actorRole) {
      throw new BadRequestException(
        actorRole === 'professional'
          ? 'Wait for the client to accept or update your proposed start first'
          : 'Wait for the professional to respond before updating the start again',
      );
    }

    if (isProfessional) {
      const projectProfessional = await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId: proposal.projectId,
            professionalId: actorId,
          },
        },
      });

      if (!projectProfessional || projectProfessional.id !== proposal.projectProfessionalId) {
        throw new BadRequestException('You do not have access to this start proposal');
      }
    } else {
      await this.assertClientProjectAccess(proposal.projectId, actorId);
    }

    const responseNotes = body.responseNotes?.trim() || undefined;
    const updatedScheduledAt = body.updatedScheduledAt
      ? new Date(body.updatedScheduledAt)
      : null;

    if (body.status === 'updated') {
      if (!updatedScheduledAt || Number.isNaN(updatedScheduledAt.getTime())) {
        throw new BadRequestException('updatedScheduledAt is required when status is updated');
      }
    }

    const projectedEndAt = this.calculateProposalEndDate(proposal.proposedStartAt, proposal.durationMinutes);
    const updatedProjectedEndAt =
      updatedScheduledAt && !Number.isNaN(updatedScheduledAt.getTime())
        ? this.calculateProposalEndDate(updatedScheduledAt, proposal.durationMinutes)
        : null;

    const updated = await this.prisma.$transaction(async (prisma) => {
      const updatedProposal = await prisma.projectStartProposal.update({
        where: { id: proposalId },
        data: {
          status: body.status === 'updated' ? 'declined' : body.status,
          respondedAt: new Date(),
          respondedBy: actorId,
          responseNotes,
        },
      });

      if (body.status === 'accepted') {
        await prisma.projectStartProposal.updateMany({
          where: {
            projectId: proposal.projectId,
            projectProfessionalId: proposal.projectProfessionalId,
            status: 'accepted',
            id: { not: proposalId },
          },
          data: {
            status: 'superseded',
            respondedAt: new Date(),
          },
        });

        await prisma.project.update({
          where: { id: proposal.projectId },
          data: {
            startDate: proposal.proposedStartAt,
            endDate: projectedEndAt,
          },
        });
      }

      if (body.status === 'updated' && updatedScheduledAt) {
        const replacementProposal = await prisma.projectStartProposal.create({
          data: {
            projectId: proposal.projectId,
            projectProfessionalId: proposal.projectProfessionalId,
            professionalId: proposal.professionalId,
            proposedByRole: actorRole,
            proposedByUserId: actorId,
            status: 'proposed',
            proposedStartAt: updatedScheduledAt,
            durationMinutes: proposal.durationMinutes,
            notes: responseNotes || proposal.notes || undefined,
          },
          include: {
            project: true,
            professional: true,
            projectProfessional: true,
          },
        });

        return {
          ...replacementProposal,
          __previousProposalId: updatedProposal.id,
        } as any;
      }

      return updatedProposal as any;
    });

    const professionalName =
      proposal.professional?.businessName || proposal.professional?.fullName || 'Professional';
    const durationLabel = this.formatDurationMinutes(proposal.durationMinutes);

    await this.addProjectChatMessage(
      proposal.projectId,
      actorRole,
      isProfessional ? null : actorId,
      isProfessional ? actorId : null,
      body.status === 'accepted'
        ? `${actorLabel} accepted the proposed start of ${this.formatDateTime(proposal.proposedStartAt)} (${durationLabel}).`
        : body.status === 'updated' && updatedScheduledAt
          ? `${actorLabel} proposed an updated start: ${this.formatDateTime(updatedScheduledAt)} (${durationLabel}).${responseNotes ? ` Note: ${responseNotes}` : ''}`
          : `${actorLabel} declined the proposed start of ${this.formatDateTime(proposal.proposedStartAt)}${responseNotes ? `: ${responseNotes}` : '.'}`,
    );

    try {
      const client = proposal.project?.user;
      const clientPhone = client?.mobile || null;
      const notifyClient = recipientRole === 'client' && client?.id && clientPhone;
      const notifyProfessional =
        recipientRole === 'professional' && proposal.professional?.id && proposal.professional?.phone;

      if (notifyClient || notifyProfessional) {
        await this.notificationService.send({
          ...(notifyClient
            ? { userId: client!.id, phoneNumber: clientPhone! }
            : {
                professionalId: proposal.professional!.id,
                phoneNumber: proposal.professional!.phone,
              }),
          eventType:
            body.status === 'accepted'
              ? 'project_start_accepted'
              : 'project_start_declined',
          message:
            body.status === 'accepted'
              ? `${actorLabel} accepted the proposed start for "${proposal.project.projectName}". Agreed start: ${this.formatDateTime(proposal.proposedStartAt)}.`
              : body.status === 'updated' && updatedScheduledAt
                ? `${actorLabel} proposed an updated start for "${proposal.project.projectName}": ${this.formatDateTime(updatedScheduledAt)}${responseNotes ? ` (${responseNotes})` : ''}.`
                : `${actorLabel} declined the proposed start for "${proposal.project.projectName}"${responseNotes ? `: ${responseNotes}` : '.'}`,
        });
      }
    } catch (error) {
      console.error('Failed to send start proposal response notification:', error);
    }

    return {
      success: true,
      proposal: {
        ...updated,
        projectedEndAt:
          body.status === 'updated' && updatedProjectedEndAt
            ? updatedProjectedEndAt
            : projectedEndAt,
      },
    };
  }

  async getProjectStartProposals(projectId: string, actorId: string, isProfessional: boolean) {
    if (isProfessional) {
      await this.prisma.projectProfessional.findFirst({
        where: {
          projectId,
          professionalId: actorId,
        },
      }).then((projectProfessional) => {
        if (!projectProfessional) {
          throw new BadRequestException('You do not have access to this project');
        }
      });
    } else {
      await this.assertClientProjectAccess(projectId, actorId);
    }

    const proposals = await this.prisma.projectStartProposal.findMany({
      where: { projectId },
      include: {
        professional: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return proposals.map((proposal) => ({
      ...proposal,
      projectedEndAt: this.calculateProposalEndDate(proposal.proposedStartAt, proposal.durationMinutes),
    }));
  }

  async requestSiteAccess(
    projectId: string,
    professionalId: string,
    body?: {
      visitScheduledFor?: string;
      visitScheduledAt?: string;
    },
  ) {
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
        },
      });

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, siteInspectionAvailableOn: true },
    });

    if (!projectProfessional || !project) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    if (!['pending', 'accepted', 'quoted', 'awarded'].includes(projectProfessional.status)) {
      throw new BadRequestException('Professional must be invited to request site access');
    }

    const existingRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: {
          in: ['pending', 'approved_visit_scheduled'],
        },
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    if (existingRequest) {
      // If the existing request was voided by a date change (visitDetails has the reschedule note),
      // allow the professional to create a fresh request for the new date.
      const needsRebook = Boolean(
        existingRequest.visitDetails && existingRequest.visitDetails.includes('Site availability changed to'),
      );
      if (!needsRebook) {
        return {
          success: true,
          request: existingRequest,
          message: 'A site access request is already pending',
        };
      }
      // Cancel the stale pending request so the new one can take its place.
      await this.prisma.siteAccessRequest.update({
        where: { id: existingRequest.id },
        data: { status: 'denied', reasonDenied: existingRequest.visitDetails },
      });
    }

    const offeredInspectionDate = this.formatHongKongDateInput(project.siteInspectionAvailableOn);
    const visitDate = body?.visitScheduledFor?.trim();
    const visitTime = body?.visitScheduledAt?.trim();

    const requestedDate = offeredInspectionDate || visitDate || '';

    if (!requestedDate || !visitTime) {
      throw new BadRequestException('Both visit date and visit time are required');
    }

    if (offeredInspectionDate && visitDate && visitDate !== offeredInspectionDate) {
      throw new BadRequestException('Site inspection must be requested on the client offered date');
    }

    if (!this.isValidInspectionHour(visitTime)) {
      throw new BadRequestException('Visit time must be between 08:00 and 18:00 in hourly intervals');
    }

    let requestedVisitAt: Date | null = null;
    let requestedVisitFor: Date | null = null;

    if (requestedDate && visitTime) {
      const parsed = this.combineHongKongDateAndTimeToUtc(requestedDate, visitTime);
      const requestedDateUtc = this.parseHongKongDateOnlyToUtc(requestedDate);
      if (!parsed || !requestedDateUtc || Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid requested visit date/time');
      }
      const conflictingSlot = await this.findConflictingSiteAccessSlot(projectId, parsed);
      if (conflictingSlot) {
        throw new BadRequestException('That inspection time has already been selected by another professional');
      }
      requestedVisitAt = parsed;
      requestedVisitFor = requestedDateUtc;
    }

    const request = await this.prisma.siteAccessRequest.create({
      data: {
        projectId,
        projectProfessionalId: projectProfessional.id,
        professionalId,
        status: 'pending',
        visitScheduledFor: requestedVisitFor,
        visitScheduledAt: requestedVisitAt,
      },
    });

    const professionalName =
      projectProfessional.professional?.businessName ||
      projectProfessional.professional?.fullName ||
      'Professional';
    await this.addProjectChatMessage(
      projectId,
      'professional',
      null,
      professionalId,
      requestedVisitAt
        ? `${professionalName} would like to visit site on ${this.formatHongKongDateTimeLabel(requestedVisitAt)}. Check your address details and accept request.`
        : `${professionalName} requested site access on ${this.formatDateTime(new Date())}.`,
    );

    return {
      success: true,
      request,
    };
  }

  async submitSiteAccessData(
    projectId: string,
    userId: string,
    body: {
      addressFull: string;
      unitNumber?: string;
      floorLevel?: string;
      accessDetails?: string;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
    },
  ) {
    await this.assertClientProjectAccess(projectId, userId);

    if (!body.addressFull) {
      throw new BadRequestException('Address is required');
    }

    const data = await this.prisma.siteAccessData.upsert({
      where: { projectId },
      create: {
        projectId,
        addressFull: body.addressFull,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        accessDetails: body.accessDetails,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        submittedBy: userId,
      },
      update: {
        addressFull: body.addressFull,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        accessDetails: body.accessDetails,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        lastUpdatedBy: userId,
      },
    });

    await this.upsertClientAddressBookAndProjectSite(projectId, userId, body);

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        siteAccessDataCollected: true,
        siteAccessDataCollectedAt: new Date(),
      },
    });

    return {
      success: true,
      data,
    };
  }

  async respondToSiteAccessRequest(
    requestId: string,
    userId: string,
    body: {
      status: 'approved_no_visit' | 'approved_visit_scheduled' | 'denied';
      visitScheduledFor?: string;
      visitScheduledAt?: string;
      reasonDenied?: string;
      addressFull?: string;
      unitNumber?: string;
      floorLevel?: string;
      accessDetails?: string;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
    },
  ) {
    const request = await this.prisma.siteAccessRequest.findUnique({
      where: { id: requestId },
      include: { project: true },
    });

    if (!request) {
      throw new BadRequestException('Site access request not found');
    }

    await this.assertClientProjectAccess(request.projectId, userId);

    if (body.status === 'approved_visit_scheduled' && !body.visitScheduledFor) {
      if (!body.visitScheduledAt) {
        throw new BadRequestException('visitScheduledAt or visitScheduledFor is required for scheduled visits');
      }
    }

    // Fetch location details to get project timezone
    const locationDetails = await this.prisma.projectLocationDetails.findUnique({
      where: { projectId: request.projectId },
    });

    const projectTimezone = locationDetails?.timezone || 'Asia/Hong_Kong';

    const parseOptionalDate = (value?: string) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    };

    // Convert local time string in a timezone to UTC
    // Example: "2024-03-01T13:00" in "Asia/Hong_Kong" timezone
    const convertLocalToUTC = (localDateTime: string, timezone: string): Date | null => {
      try {
        // Create formatter for the target timezone to get offset
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });

        // Parse the local datetime
        const localDate = new Date(localDateTime);
        if (Number.isNaN(localDate.getTime())) {
          return null;
        }

        // Get the formatted string in the target timezone
        const parts = formatter.formatToParts(localDate);
        const partsObj: Record<string, string> = {};
        parts.forEach((part) => {
          partsObj[part.type] = part.value;
        });

        // Create a date from the formatted parts
        const tzDate = new Date(
          parseInt(partsObj.year),
          parseInt(partsObj.month) - 1,
          parseInt(partsObj.day),
          parseInt(partsObj.hour),
          parseInt(partsObj.minute),
          parseInt(partsObj.second)
        );

        // Calculate offset between local and target timezone
        const offsetMs = localDate.getTime() - tzDate.getTime();
        
        // Return UTC time (add offset to get back to UTC)
        return new Date(localDate.getTime() + offsetMs);
      } catch {
        return null;
      }
    };

    if (body.status === 'denied') {
      const denied = await this.prisma.siteAccessRequest.update({
        where: { id: requestId },
        data: {
          status: 'denied',
          respondedAt: new Date(),
          clientApprovedBy: userId,
          reasonDenied: body.reasonDenied,
        },
      });

      await this.addProjectChatMessage(
        request.projectId,
        'client',
        userId,
        null,
        `Client denied site access${body.reasonDenied ? `: ${body.reasonDenied}` : '.'}`,
      );

      return {
        success: true,
        request: denied,
      };
    }

    const existingData = await this.prisma.siteAccessData.findUnique({
      where: { projectId: request.projectId },
    });

    if (!existingData && !body.addressFull) {
      throw new BadRequestException('Address is required to approve site access');
    }

    if (body.addressFull) {
      await this.prisma.siteAccessData.upsert({
        where: { projectId: request.projectId },
        create: {
          projectId: request.projectId,
          addressFull: body.addressFull,
          unitNumber: body.unitNumber,
          floorLevel: body.floorLevel,
          accessDetails: body.accessDetails,
          onSiteContactName: body.onSiteContactName,
          onSiteContactPhone: body.onSiteContactPhone,
          submittedBy: userId,
        },
        update: {
          addressFull: body.addressFull,
          unitNumber: body.unitNumber,
          floorLevel: body.floorLevel,
          accessDetails: body.accessDetails,
          onSiteContactName: body.onSiteContactName,
          onSiteContactPhone: body.onSiteContactPhone,
          lastUpdatedBy: userId,
        },
      });

      await this.upsertClientAddressBookAndProjectSite(request.projectId, userId, {
        addressFull: body.addressFull,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        accessDetails: body.accessDetails,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
      });

      await this.prisma.project.update({
        where: { id: request.projectId },
        data: {
          siteAccessDataCollected: true,
          siteAccessDataCollectedAt: new Date(),
        },
      });
    }

    const scheduledForInput = body.visitScheduledFor?.trim();
    const scheduledAtInput = body.visitScheduledAt?.trim();

    let scheduledAt: Date | null = null;
    if (scheduledForInput || scheduledAtInput) {
      let localDateTime: string | null = null;
      
      if (scheduledForInput && scheduledAtInput) {
        const isTimeOnly = /^\d{2}:\d{2}(:\d{2})?$/.test(scheduledAtInput);
        if (isTimeOnly) {
          localDateTime = `${scheduledForInput}T${scheduledAtInput}`;
        } else {
          scheduledAt = parseOptionalDate(scheduledAtInput);
        }
      } else if (scheduledForInput) {
        localDateTime = scheduledForInput;
      } else if (scheduledAtInput) {
        const isTimeOnly = /^\d{2}:\d{2}(:\d{2})?$/.test(scheduledAtInput);
        if (isTimeOnly && !scheduledForInput) {
          throw new BadRequestException('Date is required when time is provided');
        }
        localDateTime = scheduledAtInput;
      }

      if (localDateTime && !scheduledAt) {
        scheduledAt = convertLocalToUTC(localDateTime, projectTimezone);
      }
    }

    const isValidDate = (value: Date | null) =>
      !!value && !Number.isNaN(value.getTime());

    const existingScheduledAt = request.visitScheduledAt
      ? new Date(request.visitScheduledAt)
      : null;
    const existingScheduledFor = request.visitScheduledFor
      ? new Date(request.visitScheduledFor)
      : null;

    const requestedSlotWasProvided = Boolean(request.visitScheduledAt || request.visitScheduledFor);
    const shouldPreserveRequestedSlot =
      body.status === 'approved_visit_scheduled' ||
      (!scheduledForInput && !scheduledAtInput && requestedSlotWasProvided);

    const effectiveScheduledAt = isValidDate(scheduledAt)
      ? scheduledAt
      : shouldPreserveRequestedSlot && isValidDate(existingScheduledAt)
        ? existingScheduledAt
        : null;

    const effectiveScheduledFor = effectiveScheduledAt
      ? new Date(
          effectiveScheduledAt.getFullYear(),
          effectiveScheduledAt.getMonth(),
          effectiveScheduledAt.getDate(),
        )
      : shouldPreserveRequestedSlot && isValidDate(existingScheduledFor)
        ? existingScheduledFor
        : null;

    const approvedStatus =
      shouldPreserveRequestedSlot && effectiveScheduledAt
        ? 'approved_visit_scheduled'
        : body.status;

    if (approvedStatus === 'approved_visit_scheduled' && !effectiveScheduledAt) {
      throw new BadRequestException('A valid visit date/time is required for scheduled visits');
    }

    if (approvedStatus === 'approved_visit_scheduled' && effectiveScheduledAt) {
      const conflictingSlot = await this.findConflictingSiteAccessSlot(request.projectId, effectiveScheduledAt, requestId);
      if (conflictingSlot) {
        throw new BadRequestException('That inspection time has already been selected by another professional');
      }
    }

    const approved = await this.prisma.siteAccessRequest.update({
      where: { id: requestId },
      data: {
        status: approvedStatus,
        respondedAt: new Date(),
        clientApprovedBy: userId,
        reasonDenied: body.reasonDenied,
        visitScheduledFor: effectiveScheduledFor,
        visitScheduledAt: effectiveScheduledAt,
      },
    });

    if (approvedStatus === 'approved_visit_scheduled' && effectiveScheduledAt) {
      await this.prisma.siteAccessVisit.create({
        data: {
          projectId: request.projectId,
          projectProfessionalId: request.projectProfessionalId,
          professionalId: request.professionalId,
          proposedAt: effectiveScheduledAt,
          proposedByRole: 'client',
          status: 'proposed',
        },
      });
    }

    const siteAccessApprovalMessage =
      approvedStatus === 'approved_no_visit'
        ? 'Client approved site access (no visit required).'
        : `Client approved site access with a proposed visit on ${this.formatHongKongDateTimeLabel(effectiveScheduledAt)}.`;
    const requestProjectStatus = (request.project?.status || '').toLowerCase();
    const routeApprovalToPrivate = requestProjectStatus === 'pending' || requestProjectStatus === 'approved';

    if (routeApprovalToPrivate) {
      await this.addProjectProfessionalMessage(
        request.projectProfessionalId,
        'client',
        userId,
        null,
        siteAccessApprovalMessage,
      );
    } else {
      await this.addProjectChatMessage(
        request.projectId,
        'client',
        userId,
        null,
        siteAccessApprovalMessage,
      );
    }

    // Send notification to professional
    try {
      const professional = await this.prisma.professional.findUnique({
        where: { id: request.professionalId },
      });

      if (professional?.phone) {
        const project = await this.prisma.project.findUnique({
          where: { id: request.projectId },
          select: { projectName: true },
        });

        const notificationMessage = approvedStatus === 'approved_no_visit'
          ? `Good news! Your site access request for "${project?.projectName}" has been approved. No site visit required.`
          : `Good news! Your site access request for "${project?.projectName}" has been approved with a scheduled visit on ${this.formatHongKongDateTimeLabel(effectiveScheduledAt)}.`;

        await this.notificationService.send({
          professionalId: professional.id,
          phoneNumber: professional.phone,
          eventType: 'site_access_approved',
          message: notificationMessage,
        });
      }
    } catch (error) {
      // Log but don't fail the request if notification fails
      console.error('Failed to send site access approval notification:', error);
    }

    return {
      success: true,
      request: approved,
    };
  }

  async confirmSiteVisit(
    requestId: string,
    professionalId: string,
    body: { visitDetails?: string },
  ) {
    const request = await this.prisma.siteAccessRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new BadRequestException('Site access request not found');
    }

    if (request.professionalId !== professionalId) {
      throw new BadRequestException('You do not have access to this request');
    }

    if (!['approved_visit_scheduled', 'approved_no_visit', 'visited'].includes(request.status)) {
      throw new BadRequestException('Site visit cannot be confirmed for this request');
    }

    const updatedRequest = await this.prisma.siteAccessRequest.update({
      where: { id: requestId },
      data: {
        status: 'visited',
        visitedAt: new Date(),
        visitDetails: body.visitDetails,
      },
    });

    await this.prisma.projectProfessional.update({
      where: { id: request.projectProfessionalId },
      data: {
        siteVisitedAt: new Date(),
        visitNotes: body.visitDetails,
        visitApprovedButNotDone: false,
      },
    });

    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
    });
    const professionalName =
      professional?.businessName || professional?.fullName || 'Professional';
    await this.addProjectChatMessage(
      request.projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} confirmed a site visit on ${this.formatDateTime(updatedRequest.visitedAt)}.`,
    );

    return {
      success: true,
      request: updatedRequest,
    };
  }

  async requestSiteVisit(
    projectId: string,
    professionalId: string,
    body: { scheduledAt: string; notes?: string },
  ) {
    const legacySiteVisitRequestEnabled =
      process.env.ENABLE_LEGACY_SITE_VISIT_REQUEST === 'true';
    if (!legacySiteVisitRequestEnabled) {
      throw new BadRequestException(
        'Legacy site visit request flow is disabled. Use site access request instead.',
      );
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is required');
    }

    const projectProfessional = await this.prisma.projectProfessional.findUnique({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      include: {
        professional: true,
      },
    });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    if (!['pending', 'accepted', 'quoted', 'awarded'].includes(projectProfessional.status)) {
      throw new BadRequestException('Professional must be invited to request a site visit');
    }

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const hasAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);

    if (!hasAccess) {
      throw new BadRequestException('Site access must be approved before requesting a visit');
    }

    const existingPending = await this.prisma.siteAccessVisit.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: 'proposed',
        proposedByRole: 'professional',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPending) {
      return {
        success: true,
        visit: existingPending,
        message: 'A site visit proposal is already pending',
      };
    }

    const latestAccepted = await this.prisma.siteAccessVisit.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
        status: 'accepted',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestAccepted) {
      await this.prisma.siteAccessVisit.update({
        where: { id: latestAccepted.id },
        data: {
          status: 'cancelled',
          responseNotes: 'Rescheduled by professional',
        },
      });
    }

    const visit = await this.prisma.siteAccessVisit.create({
      data: {
        projectId,
        projectProfessionalId: projectProfessional.id,
        professionalId,
        proposedAt: scheduledAt,
        proposedByRole: 'professional',
        notes: body.notes,
        status: 'proposed',
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    const professionalName =
      projectProfessional.professional?.businessName ||
      projectProfessional.professional?.fullName ||
      'Professional';

    const siteVisitRequestedEvent = JSON.stringify({
      type: 'generic',
      icon: '🚪',
      title: 'Site Visit Requested',
      summary: `${professionalName} requested a site visit.`,
      fields: [
        { label: 'Requested for', value: this.formatDateTime(scheduledAt) },
        ...(body.notes?.trim()
          ? [{ label: 'Notes', value: body.notes.trim() }]
          : []),
      ],
    });

    await this.addProjectProfessionalMessage(
      projectProfessional.id,
      'professional',
      null,
      professionalId,
      `[[event]] ${siteVisitRequestedEvent}`,
    );

    return {
      success: true,
      visit,
    };
  }

  async respondToSiteVisit(
    visitId: string,
    actorId: string,
    isProfessional: boolean,
    body: { status: 'accepted' | 'declined'; responseNotes?: string },
  ) {
    const visit = await this.prisma.siteAccessVisit.findUnique({
      where: { id: visitId },
      include: {
        project: true,
        professional: true,
      },
    });

    if (!visit) {
      throw new BadRequestException('Site visit not found');
    }

    if (visit.status !== 'proposed') {
      throw new BadRequestException('This site visit has already been responded to');
    }

    if (visit.proposedByRole === 'professional') {
      if (isProfessional) {
        throw new BadRequestException('Only clients can respond to this visit proposal');
      }
      await this.assertClientProjectAccess(visit.projectId, actorId);
    } else {
      if (!isProfessional) {
        throw new BadRequestException('Only professionals can respond to this visit proposal');
      }
      if (visit.professionalId !== actorId) {
        throw new BadRequestException('You do not have access to this visit proposal');
      }
    }

    const updated = await this.prisma.siteAccessVisit.update({
      where: { id: visitId },
      data: {
        status: body.status,
        respondedAt: new Date(),
        respondedBy: !isProfessional ? actorId : null,
        responseNotes: body.responseNotes,
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    if (body.status === 'accepted') {
      await this.prisma.projectProfessional.update({
        where: { id: visit.projectProfessionalId },
        data: {
          visitApprovedButNotDone: true,
        },
      });
    }

    const professionalName =
      visit.professional?.businessName || visit.professional?.fullName || 'Professional';
    const actorLabel = isProfessional ? professionalName : 'Client';
    const visitResponseMessage =
      body.status === 'accepted'
        ? `${actorLabel} accepted the proposed site visit for ${this.formatDateTime(visit.proposedAt)}.`
        : `${actorLabel} declined the proposed site visit for ${this.formatDateTime(visit.proposedAt)}${body.responseNotes ? `: ${body.responseNotes}` : '.'}`;
    const visitProjectStatus = (visit.project?.status || '').toLowerCase();
    const routeVisitAcceptanceToPrivate =
      body.status === 'accepted' && (visitProjectStatus === 'pending' || visitProjectStatus === 'approved');

    if (routeVisitAcceptanceToPrivate) {
      await this.addProjectProfessionalMessage(
        visit.projectProfessionalId,
        isProfessional ? 'professional' : 'client',
        isProfessional ? null : actorId,
        isProfessional ? actorId : null,
        visitResponseMessage,
      );
    } else {
      await this.addProjectChatMessage(
        visit.projectId,
        isProfessional ? 'professional' : 'client',
        isProfessional ? null : actorId,
        isProfessional ? actorId : null,
        visitResponseMessage,
      );
    }

    // Email notification to professional when client accepts their proposed visit
    if (body.status === 'accepted' && !isProfessional && visit.professional?.email) {
      const webBase = process.env.WEB_BASE_URL || 'https://fitouthub-web.vercel.app';
      const projectProfessionalId = visit.projectProfessionalId;
      this.emailService
        .sendSiteVisitConfirmed({
          to: visit.professional.email,
          professionalName,
          projectName: visit.project?.projectName || 'your project',
          visitAt: this.formatDateTime(visit.proposedAt),
          projectUrl: `${webBase}/professional-projects/${projectProfessionalId}?tab=site-access`,
        })
        .catch((err) => console.error('Failed to send site visit confirmed email:', err));
    }

    return {
      success: true,
      visit: updated,
    };
  }

  async completeSiteVisit(
    visitId: string,
    professionalId: string,
    body: { visitDetails?: string },
  ) {
    const visit = await this.prisma.siteAccessVisit.findUnique({
      where: { id: visitId },
    });

    if (!visit) {
      throw new BadRequestException('Site visit not found');
    }

    if (visit.professionalId !== professionalId) {
      throw new BadRequestException('You do not have access to this visit');
    }

    if (visit.status !== 'accepted') {
      throw new BadRequestException('Only accepted visits can be completed');
    }

    const updated = await this.prisma.siteAccessVisit.update({
      where: { id: visitId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        responseNotes: body.visitDetails ?? visit.responseNotes,
      },
      include: {
        project: true,
        professional: true,
        projectProfessional: true,
      },
    });

    await this.prisma.projectProfessional.update({
      where: { id: visit.projectProfessionalId },
      data: {
        siteVisitedAt: new Date(),
        visitNotes: body.visitDetails,
        visitApprovedButNotDone: false,
      },
    });

    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
    });
    const professionalName =
      professional?.businessName || professional?.fullName || 'Professional';
    await this.addProjectChatMessage(
      visit.projectId,
      'professional',
      null,
      professionalId,
      `${professionalName} marked the site visit as completed on ${this.formatDateTime(updated.completedAt)}.`,
    );

    return {
      success: true,
      visit: updated,
    };
  }

  async getSiteVisits(
    projectId: string,
    actorId: string,
    isProfessional: boolean,
  ) {
    if (isProfessional) {
      const projectProfessional = await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId: actorId,
          },
        },
      });

      if (!projectProfessional) {
        throw new BadRequestException('Professional is not linked to this project');
      }

      const visits = await this.prisma.siteAccessVisit.findMany({
        where: { projectProfessionalId: projectProfessional.id },
        include: { professional: true },
        orderBy: { proposedAt: 'desc' },
      });

      return { success: true, visits };
    }

    await this.assertClientProjectAccess(projectId, actorId);
    const visits = await this.prisma.siteAccessVisit.findMany({
      where: { projectId },
      include: { professional: true },
      orderBy: { proposedAt: 'desc' },
    });

    return { success: true, visits };
  }

  async getSiteAccessStatus(projectId: string, professionalId: string) {
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
      });

    if (!projectProfessional) {
      throw new BadRequestException('Professional is not linked to this project');
    }

    const latestAccessRequest = await this.prisma.siteAccessRequest.findFirst({
      where: {
        projectProfessionalId: projectProfessional.id,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    const approvedStatuses = [
      'approved_no_visit',
      'approved_visit_scheduled',
      'visited',
    ];
    const rescheduleRequired = Boolean(
      latestAccessRequest?.visitDetails &&
        latestAccessRequest.visitDetails.includes('Site availability changed to'),
    );
    const hasAccess =
      !!latestAccessRequest && approvedStatuses.includes(latestAccessRequest.status);

    const siteAccessData = hasAccess
      ? await this.prisma.siteAccessData.findUnique({
          where: { projectId },
        })
      : null;

    const projectSiteAddress = hasAccess
      ? await this.getPrimaryProjectSiteAddress(projectId)
      : null;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        siteInspectionAvailableOn: true,
        region: true,
        locationDetails: {
          select: {
            postalCode: true,
          },
        },
      },
    });

    const siteInspectionAvailableOn = this.formatHongKongDateInput(project?.siteInspectionAvailableOn || null);
    const offeredStartUtc = siteInspectionAvailableOn ? this.parseHongKongDateOnlyToUtc(siteInspectionAvailableOn) : null;
    const offeredEndUtc = offeredStartUtc
      ? new Date(offeredStartUtc.getTime() + 24 * 60 * 60 * 1000)
      : null;

    const bookedInspectionTimes = offeredStartUtc && offeredEndUtc
      ? (await this.prisma.siteAccessRequest.findMany({
          where: {
            projectId,
            status: {
              in: ['pending', 'approved_visit_scheduled'],
            },
            visitScheduledAt: {
              gte: offeredStartUtc,
              lt: offeredEndUtc,
            },
          },
          select: {
            visitScheduledAt: true,
          },
          orderBy: {
            visitScheduledAt: 'asc',
          },
        }))
          .map((row) => {
            const shifted = new Date(row.visitScheduledAt!.getTime() + HK_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
            return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
          })
      : [];

    const siteAccessDataPayload = hasAccess
      ? {
          ...(siteAccessData || {}),
          addressFull: projectSiteAddress?.addressFull || siteAccessData?.addressFull || null,
          unitNumber: projectSiteAddress?.unitNumber || siteAccessData?.unitNumber || null,
          floorLevel: projectSiteAddress?.floorLevel || siteAccessData?.floorLevel || null,
          accessDetails: projectSiteAddress?.accessDetails || siteAccessData?.accessDetails || null,
          onSiteContactName: projectSiteAddress?.onSiteContactName || siteAccessData?.onSiteContactName || null,
          onSiteContactPhone: projectSiteAddress?.onSiteContactPhone || siteAccessData?.onSiteContactPhone || null,
          buildingName: projectSiteAddress?.buildingName || null,
          postalCode: project?.locationDetails?.postalCode || null,
        }
      : null;

    return {
      success: true,
      requestId: latestAccessRequest?.id || null,
      requestStatus: latestAccessRequest?.status || 'none',
      rescheduleRequired,
      requiresReschedule: rescheduleRequired,
      visitScheduledFor: latestAccessRequest?.visitScheduledFor || null,
      visitScheduledAt: latestAccessRequest?.visitScheduledAt || null,
      visitDetails: latestAccessRequest?.visitDetails || null,
      visitedAt: latestAccessRequest?.visitedAt || null,
      reasonDenied: latestAccessRequest?.reasonDenied || null,
      hasAccess,
      siteInspectionAvailableOn,
      bookedInspectionTimes,
      siteAccessData: siteAccessDataPayload,
    };
  }

  async submitLocationDetails(
    projectId: string,
    userId: string,
    body: {
      addressFull: string;
      buildingName?: string;
      district?: string;
      postalCode?: string;
      gpsCoordinates?: { lat: number; lng: number };
      unitNumber?: string;
      floorLevel?: string;
      propertyType?: string;
      propertySize?: string;
      propertyAge?: string;
      accessDetails?: string;
      existingConditions?: string;
      specialRequirements?: Array<string> | Record<string, unknown>;
      onSiteContactName?: string;
      onSiteContactPhone?: string;
      accessHoursType?: string;
      workingHoursWindow?: string;
      accessHoursDescription?: string;
      desiredStartDate?: string;
      photoUrls?: string[];
    },
  ) {
    const project = await this.assertClientProjectAccess(projectId, userId);

    const awardedAssignment = await this.prisma.projectProfessional.findFirst({
      where: {
        projectId,
        status: 'awarded',
      },
      select: { id: true },
    });

    const isAwardedStage = project.status === 'awarded' || !!awardedAssignment;
    const surveyRequestedRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(id)::bigint as count
      FROM mimo_project_extras
      WHERE "projectId" = ${projectId}
        AND "extraType" = 'survey'
    `;
    const surveyRequested = Number(surveyRequestedRows[0]?.count || 0n) > 0;

    const missingFields: string[] = [];

    if (!body.addressFull?.trim()) missingFields.push('Full Address');
    if (!body.unitNumber?.trim()) missingFields.push('Unit Number');
    if (!body.floorLevel?.trim()) missingFields.push('Floor Level');
    if (!body.district?.trim()) missingFields.push('District');

    if (isAwardedStage) {
      if (!body.propertyType?.trim()) missingFields.push('Property Type');
      if (!surveyRequested && !body.propertySize?.trim()) missingFields.push('Property Size');
      if (!surveyRequested && !body.propertyAge?.trim()) missingFields.push('Property Age');
      if (!surveyRequested && !body.existingConditions?.trim()) missingFields.push('Existing Conditions');
      if (!body.accessDetails?.trim()) missingFields.push('Access Details');
      if (!body.accessHoursType?.trim()) missingFields.push('Access Hours');
      if (!body.workingHoursWindow?.trim()) missingFields.push('Working Hours');
      if (!body.onSiteContactName?.trim()) missingFields.push('On-site Contact Name');
      if (!body.onSiteContactPhone?.trim()) missingFields.push('On-site Contact Phone');
      if (!body.desiredStartDate?.trim()) missingFields.push('Desired Start Date');
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        isAwardedStage
          ? `Awarded projects require complete location details. Missing: ${missingFields.join(', ')}`
          : `Bidding stage requires basic location details. Missing: ${missingFields.join(', ')}`,
      );
    }

    if (
      project.escrowRequired &&
      project.escrowHeld &&
      new Decimal(project.escrowHeld.toString()).lessThan(
        new Decimal(project.escrowRequired.toString()),
      )
    ) {
      throw new BadRequestException('Escrow must be confirmed before submitting location details');
    }

    const details = await this.prisma.projectLocationDetails.upsert({
      where: { projectId },
      create: {
        projectId,
        addressFull: body.addressFull,
        buildingName: body.buildingName,
        postalCode: body.postalCode,
        gpsCoordinates: body.gpsCoordinates || undefined,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        propertyType: body.propertyType,
        propertySize: body.propertySize,
        propertyAge: body.propertyAge,
        accessDetails: body.accessDetails,
        existingConditions: body.existingConditions,
        specialRequirements: (body.specialRequirements as Prisma.InputJsonValue) || undefined,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        accessHoursDescription: body.accessHoursDescription,
        desiredStartDate: body.desiredStartDate
          ? new Date(body.desiredStartDate)
          : undefined,
        photoUrls: body.photoUrls || [],
        status: 'submitted',
        submittedBy: userId,
      },
      update: {
        addressFull: body.addressFull,
        buildingName: body.buildingName,
        postalCode: body.postalCode,
        gpsCoordinates: body.gpsCoordinates || undefined,
        unitNumber: body.unitNumber,
        floorLevel: body.floorLevel,
        propertyType: body.propertyType,
        propertySize: body.propertySize,
        propertyAge: body.propertyAge,
        accessDetails: body.accessDetails,
        existingConditions: body.existingConditions,
        specialRequirements: (body.specialRequirements as Prisma.InputJsonValue) || undefined,
        onSiteContactName: body.onSiteContactName,
        onSiteContactPhone: body.onSiteContactPhone,
        accessHoursDescription: body.accessHoursDescription,
        desiredStartDate: body.desiredStartDate
          ? new Date(body.desiredStartDate)
          : undefined,
        photoUrls: body.photoUrls || [],
        status: 'submitted',
      },
    });

    try {
      await this.prisma.$executeRaw`
        UPDATE "ProjectLocationDetails"
        SET
          "district" = ${String(body.district || '').trim() || null},
          "accessHoursType" = ${String(body.accessHoursType || '').trim() || null},
          "workingHoursWindow" = ${String(body.workingHoursWindow || '').trim() || null}
        WHERE "projectId" = ${projectId}
      `;
    } catch {
      // Optional Phase B columns might not exist until SQL is applied.
    }

    await this.upsertClientAddressBookAndProjectSite(projectId, userId, {
      addressFull: body.addressFull,
      buildingName: body.buildingName,
      district: body.district,
      postalCode: body.postalCode,
      unitNumber: body.unitNumber,
      floorLevel: body.floorLevel,
      propertyType: body.propertyType,
      propertySize: body.propertySize,
      propertyAge: body.propertyAge,
      accessDetails: body.accessDetails,
      existingConditions: body.existingConditions,
      accessHoursType: body.accessHoursType,
      workingHoursWindow: body.workingHoursWindow,
      onSiteContactName: body.onSiteContactName,
      onSiteContactPhone: body.onSiteContactPhone,
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        locationDetailsStatus: 'submitted',
        locationDetailsProvidedAt: new Date(),
        locationDetailsRequiredAt: project.locationDetailsRequiredAt || new Date(),
      },
    });

    return {
      success: true,
      details,
    };
  }

  async updateSiteInspectionAvailability(
    projectId: string,
    userId: string,
    body: { siteInspectionAvailableOn: string; reason: string },
  ) {
    const project = await this.assertClientProjectAccess(projectId, userId);

    const reason = body.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Reason is required when changing the site inspection date');
    }

    const normalizedDate = this.normalizeDateInput(body.siteInspectionAvailableOn);
    if (!normalizedDate) {
      throw new BadRequestException('A valid site inspection date is required');
    }

    const previousDateLabel = this.formatHongKongShortDateLabel(project.siteInspectionAvailableOn);
    const nextDateLabel = this.formatHongKongShortDateLabel(normalizedDate);

    if (!nextDateLabel) {
      throw new BadRequestException('A valid site inspection date is required');
    }

    if (previousDateLabel === nextDateLabel) {
      throw new BadRequestException('The new site inspection date must be different from the current date');
    }

    const [activeRequests, activeVisits] = await Promise.all([
      this.prisma.siteAccessRequest.findMany({
        where: {
          projectId,
          status: { in: ['pending', 'approved_no_visit', 'approved_visit_scheduled'] },
        },
        include: {
          professional: {
            select: {
              id: true,
              fullName: true,
              businessName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.siteAccessVisit.findMany({
        where: {
          projectId,
          status: { in: ['proposed', 'accepted'] },
        },
        include: {
          professional: {
            select: {
              id: true,
              fullName: true,
              businessName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    const recipients = new Map<string, {
      projectProfessionalId: string;
      professionalId: string;
      professionalName: string;
      phone?: string | null;
      email?: string | null;
      voidedExistingBooking: boolean;
    }>();

    for (const request of activeRequests) {
      const existing = recipients.get(request.projectProfessionalId);
      recipients.set(request.projectProfessionalId, {
        projectProfessionalId: request.projectProfessionalId,
        professionalId: request.professionalId,
        professionalName:
          request.professional.businessName ||
          request.professional.fullName ||
          request.professional.email ||
          'Professional',
        phone: request.professional.phone,
        email: request.professional.email,
        voidedExistingBooking:
          Boolean(existing?.voidedExistingBooking) ||
          request.status === 'approved_visit_scheduled' ||
          Boolean(request.visitScheduledAt || request.visitScheduledFor),
      });
    }

    for (const visit of activeVisits) {
      const existing = recipients.get(visit.projectProfessionalId);
      recipients.set(visit.projectProfessionalId, {
        projectProfessionalId: visit.projectProfessionalId,
        professionalId: visit.professionalId,
        professionalName:
          visit.professional.businessName ||
          visit.professional.fullName ||
          visit.professional.email ||
          'Professional',
        phone: visit.professional.phone,
        email: visit.professional.email,
        voidedExistingBooking: Boolean(existing?.voidedExistingBooking) || true,
      });
    }

    const cancellationNote = this.buildSiteAvailabilityChangeReason(nextDateLabel, reason);

    const [updatedProject, downgradedRequests, , cancelledVisits] = await this.prisma.$transaction([
      this.prisma.project.update({
        where: { id: projectId },
        data: {
          siteInspectionAvailableOn: normalizedDate,
        },
        select: {
          id: true,
          siteInspectionAvailableOn: true,
        },
      }),
      // Downgrade explicitly-scheduled requests and stamp the cancellation note.
      this.prisma.siteAccessRequest.updateMany({
        where: {
          projectId,
          status: 'approved_visit_scheduled',
        },
        data: {
          status: 'approved_no_visit',
          visitScheduledFor: null,
          visitScheduledAt: null,
          visitDetails: cancellationNote,
        },
      }),
      // Also stamp visitDetails on ALL approved_no_visit requests for this project
      // so they show "Reschedule" not "Booked" — this covers professionals whose
      // previously proposed visits were already declined/cancelled before this change.
      this.prisma.siteAccessRequest.updateMany({
        where: {
          projectId,
          status: 'approved_no_visit',
        },
        data: {
          visitDetails: cancellationNote,
        },
      }),
      this.prisma.siteAccessVisit.updateMany({
        where: {
          projectId,
          status: { in: ['proposed', 'accepted'] },
        },
        data: {
          status: 'cancelled',
          respondedAt: new Date(),
          respondedBy: userId,
          responseNotes: cancellationNote,
        },
      }),
      // Void pending requests so professionals know they must rebook for the new date.
      this.prisma.siteAccessRequest.updateMany({
        where: {
          projectId,
          status: 'pending',
        },
        data: {
          visitScheduledFor: null,
          visitScheduledAt: null,
          visitDetails: cancellationNote,
        },
      }),
    ]);

    await this.prisma.projectLocationDetails.updateMany({
      where: { projectId },
      data: {
        desiredStartDate: normalizedDate,
      },
    });

    const webBase = process.env.WEB_BASE_URL || 'https://fitouthub-web.vercel.app';
    const dateChangeSummary = previousDateLabel
      ? `from ${previousDateLabel} to ${nextDateLabel}`
      : `to ${nextDateLabel}`;

    for (const recipient of recipients.values()) {
      const privateMessage = recipient.voidedExistingBooking
        ? `The client changed the site inspection availability for "${project.projectName}" ${dateChangeSummary}. Your previously arranged site visit slot is no longer valid and must be rebooked. Reason: ${reason}`
        : `The client changed the site inspection availability for "${project.projectName}" ${dateChangeSummary}. Reason: ${reason}. Please review the new availability in the site-access tab.`;

      await this.addProjectProfessionalMessage(
        recipient.projectProfessionalId,
        'client',
        userId,
        null,
        privateMessage,
      );

      if (recipient.phone) {
        await this.notificationService.send({
          professionalId: recipient.professionalId,
          phoneNumber: recipient.phone,
          eventType: 'site_availability_changed',
          message: privateMessage,
        }).catch((error) => {
          console.error('Failed to send site availability update notification:', error);
        });
      }

      if (recipient.email) {
        await this.emailService.sendSiteAvailabilityChanged({
          to: recipient.email,
          professionalName: recipient.professionalName,
          projectName: project.projectName,
          previousDateLabel,
          nextDateLabel,
          reason,
          voidedExistingBooking: recipient.voidedExistingBooking,
          projectUrl: `${webBase}/professional-projects/${recipient.projectProfessionalId}?tab=site-access`,
        }).catch((error) => {
          console.error('Failed to send site availability change email:', error);
        });
      }
    }

    return {
      success: true,
      project: updatedProject,
      impacted: {
        professionalsNotified: recipients.size,
        bookingsVoided: Array.from(recipients.values()).filter((recipient) => recipient.voidedExistingBooking).length,
        scheduledRequestsCleared: downgradedRequests.count,
        visitsCancelled: cancelledVisits.count,
      },
    };
  }

  async getSiteAccessRequests(projectId: string, userId: string) {
    await this.assertClientProjectAccess(projectId, userId);

    const requests = await this.prisma.siteAccessRequest.findMany({
      where: { projectId },
      include: {
        professional: {
          select: {
            id: true,
            fullName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
        projectProfessional: {
          select: {
            id: true,
            status: true,
            quoteAmount: true,
            quotedAt: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    // Expose the latest request per professional so the client tab shows a single current row.
    const latestRequestByProjectProfessional = new Map<string, (typeof requests)[number]>();
    for (const request of requests) {
      const existing = latestRequestByProjectProfessional.get(request.projectProfessionalId);
      if (!existing) {
        latestRequestByProjectProfessional.set(request.projectProfessionalId, request);
        continue;
      }
      const requestMs = request.requestedAt ? new Date(request.requestedAt).getTime() : Number.NEGATIVE_INFINITY;
      const existingMs = existing.requestedAt ? new Date(existing.requestedAt).getTime() : Number.NEGATIVE_INFINITY;
      if (requestMs >= existingMs) {
        latestRequestByProjectProfessional.set(request.projectProfessionalId, request);
      }
    }
    const latestRequests = Array.from(latestRequestByProjectProfessional.values()).sort((a, b) => {
      const aMs = a.requestedAt ? new Date(a.requestedAt).getTime() : Number.NEGATIVE_INFINITY;
      const bMs = b.requestedAt ? new Date(b.requestedAt).getTime() : Number.NEGATIVE_INFINITY;
      return bMs - aMs;
    });

    const siteAccessData = await this.prisma.siteAccessData.findUnique({
      where: { projectId },
    });

    // Also fetch projectLocationDetails — this is the table the client's "Save address"
    // button writes to. Prefer its fields over the older siteAccessData record.
    let locationDetailsRows: Array<{
      addressFull: string;
      buildingName: string | null;
      district: string | null;
      unitNumber: string | null;
      floorLevel: string | null;
      postalCode: string | null;
      propertyType: string | null;
      propertySize: string | null;
      propertyAge: string | null;
      accessDetails: string | null;
      existingConditions: string | null;
      accessHoursType: string | null;
      workingHoursWindow: string | null;
      accessHoursDescription: string | null;
      onSiteContactName: string | null;
      onSiteContactPhone: string | null;
      desiredStartDate: Date | null;
    }> = [];

    try {
      locationDetailsRows = await this.prisma.$queryRaw<
        Array<{
          addressFull: string;
          buildingName: string | null;
          district: string | null;
          unitNumber: string | null;
          floorLevel: string | null;
          postalCode: string | null;
          propertyType: string | null;
          propertySize: string | null;
          propertyAge: string | null;
          accessDetails: string | null;
          existingConditions: string | null;
          accessHoursType: string | null;
          workingHoursWindow: string | null;
          accessHoursDescription: string | null;
          onSiteContactName: string | null;
          onSiteContactPhone: string | null;
          desiredStartDate: Date | null;
        }>
      >`
        SELECT
          "addressFull" as "addressFull",
          "buildingName" as "buildingName",
          "district" as "district",
          "unitNumber" as "unitNumber",
          "floorLevel" as "floorLevel",
          "postalCode" as "postalCode",
          "propertyType" as "propertyType",
          "propertySize" as "propertySize",
          "propertyAge" as "propertyAge",
          "accessDetails" as "accessDetails",
          "existingConditions" as "existingConditions",
          "accessHoursType" as "accessHoursType",
          "workingHoursWindow" as "workingHoursWindow",
          "accessHoursDescription" as "accessHoursDescription",
          "onSiteContactName" as "onSiteContactName",
          "onSiteContactPhone" as "onSiteContactPhone",
          "desiredStartDate" as "desiredStartDate"
        FROM "ProjectLocationDetails"
        WHERE "projectId" = ${projectId}
        LIMIT 1
      `;
    } catch {
      locationDetailsRows = await this.prisma.$queryRaw<
        Array<{
          addressFull: string;
          buildingName: string | null;
          district: string | null;
          unitNumber: string | null;
          floorLevel: string | null;
          postalCode: string | null;
          propertyType: string | null;
          propertySize: string | null;
          propertyAge: string | null;
          accessDetails: string | null;
          existingConditions: string | null;
          accessHoursType: string | null;
          workingHoursWindow: string | null;
          accessHoursDescription: string | null;
          onSiteContactName: string | null;
          onSiteContactPhone: string | null;
          desiredStartDate: Date | null;
        }>
      >`
        SELECT
          "addressFull" as "addressFull",
          "buildingName" as "buildingName",
          NULL::text as "district",
          "unitNumber" as "unitNumber",
          "floorLevel" as "floorLevel",
          "postalCode" as "postalCode",
          "propertyType" as "propertyType",
          "propertySize" as "propertySize",
          "propertyAge" as "propertyAge",
          "accessDetails" as "accessDetails",
          "existingConditions" as "existingConditions",
          NULL::text as "accessHoursType",
          NULL::text as "workingHoursWindow",
          "accessHoursDescription" as "accessHoursDescription",
          "onSiteContactName" as "onSiteContactName",
          "onSiteContactPhone" as "onSiteContactPhone",
          "desiredStartDate" as "desiredStartDate"
        FROM "ProjectLocationDetails"
        WHERE "projectId" = ${projectId}
        LIMIT 1
      `;
    }
    const locationDetails: any = locationDetailsRows[0] || null;
    const locationBuildingName = locationDetails?.buildingName ?? null;

    const mergedSiteAccessData = locationDetails
      ? {
          addressFull: locationDetails.addressFull,
          buildingName: locationBuildingName,
          district: locationDetails.district ?? null,
          unitNumber: locationDetails.unitNumber ?? siteAccessData?.unitNumber ?? null,
          floorLevel: locationDetails.floorLevel ?? siteAccessData?.floorLevel ?? null,
          postalCode: locationDetails.postalCode ?? null,
          propertyType: locationDetails.propertyType ?? null,
          propertySize: locationDetails.propertySize ?? null,
          propertyAge: locationDetails.propertyAge ?? null,
          accessDetails: locationDetails.accessDetails ?? siteAccessData?.accessDetails ?? null,
          existingConditions: locationDetails.existingConditions ?? null,
          accessHoursType: locationDetails.accessHoursType ?? null,
          workingHoursWindow: locationDetails.workingHoursWindow ?? null,
          accessHoursDescription: locationDetails.accessHoursDescription ?? null,
          onSiteContactName: locationDetails.onSiteContactName ?? siteAccessData?.onSiteContactName ?? null,
          onSiteContactPhone: locationDetails.onSiteContactPhone ?? siteAccessData?.onSiteContactPhone ?? null,
          desiredStartDate: locationDetails.desiredStartDate
            ? locationDetails.desiredStartDate.toISOString().split('T')[0]
            : null,
        }
      : siteAccessData;

    return {
      success: true,
      requests: latestRequests,
      siteAccessData: mergedSiteAccessData,
    };
  }

  async confirmDepositPaid(transactionId: string, projectId: string) {
    // Verify the transaction exists and is a pending escrow deposit request
    const transaction = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: {
        project: {
          include: {

          },
        },
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.projectId !== projectId) {
      throw new Error('Transaction does not belong to this project');
    }

    if (transaction.type !== 'escrow_deposit_request') {
      throw new Error('This transaction is not an escrow deposit request');
    }

    if ((transaction.status || '').toLowerCase() !== 'pending') {
      throw new Error('This deposit request is not pending');
    }

    // Create a new transaction confirming the payment was made by client
    await this.prisma.financialTransaction.create({
      data: {
        projectId,
        projectProfessionalId: transaction.projectProfessionalId,
        type: 'escrow_deposit_confirmation',
        description: 'Client confirms deposit payment made to Mimo escrow',
        amount: transaction.amount,
        status: 'pending',
        requestedBy: transaction.requestedBy,
        requestedByRole: 'client',
        actionBy: 'foh',  // Action required from FOH/platform admin team
        actionByRole: 'platform',
        actionAt: new Date(),
        actionComplete: false,  // Pending FOH admin confirmation
        notes: `Confirmation for escrow deposit request ${transactionId}`,
      },
    });

    // Update the original transaction status (client confirmed payment)
    await this.prisma.financialTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'paid',
        actionBy: transaction.requestedBy,
        actionByRole: 'client',
        actionAt: new Date(),
        actionComplete: true,
        notes: `${transaction.notes || ''} | Client confirmed payment made`,
      },
    });

    // Move project to PRE_WORK once escrow deposit is confirmed by client
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        currentStage: ProjectStage.PRE_WORK,
        stageStartedAt: new Date(),
      },
    });

    return { success: true };
  }

  async awardQuote(projectId: string, professionalId: string) {
    // Verify ProjectProfessional relationship exists and has a quote
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          project: {
            include: {

              professionals: {
                include: { professional: true },
              },
            },
          },
          professional: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (!projectProfessional.quotedAt) {
      throw new Error('Professional has not submitted a quote yet');
    }

    const quoteStartAt = projectProfessional.quoteEstimatedStartAt
      ? new Date(projectProfessional.quoteEstimatedStartAt)
      : null;
    const hasValidQuoteStartAt =
      !!quoteStartAt && !Number.isNaN(quoteStartAt.getTime());
    const quoteDurationMinutes = Math.max(
      0,
      Number((projectProfessional as any)?.quoteEstimatedDurationMinutes) || 0,
    );
    const quoteEndAt =
      hasValidQuoteStartAt && quoteDurationMinutes > 0
        ? new Date((quoteStartAt as Date).getTime() + quoteDurationMinutes * 60 * 1000)
        : null;

    const { awarded } = await this.prisma.$transaction(async (tx) => {
      // Update this professional's status to "awarded"
      const awardedPP = await tx.projectProfessional.update({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        data: {
          status: 'awarded',
        },
        include: {
          professional: true,
          project: {
            include: {

            },
          },
        },
      });

      // Auto-approve awarded professional's pending site access request (if any)
      await tx.siteAccessRequest.updateMany({
        where: {
          projectProfessionalId: awardedPP.id,
          status: 'pending',
        },
        data: {
          status: 'approved_no_visit',
          respondedAt: new Date(),
        },
      });

      // Mark project as awarded for downstream views
      await tx.project.update({
        where: { id: projectId },
        data: {
          status: 'awarded',
          currentStage: ProjectStage.CONTRACT_PHASE,
          awardedProjectProfessionalId: awardedPP.id,
          startDate: hasValidQuoteStartAt ? (quoteStartAt as Date) : undefined,
          endDate: quoteEndAt || undefined,
        },
      });

      // Create financial transactions mirroring the client acceptance flow
      const quoteAmount = projectProfessional.quoteAmount
        ? new Decimal(projectProfessional.quoteAmount.toString())
        : new Decimal(0);

      if (quoteAmount.greaterThan(0)) {
        const clientId = projectProfessional.project?.clientId || projectProfessional.project?.userId;
        // Informational line: quotation accepted (mark as complete since no action needed)
        const quoteTx = await tx.financialTransaction.create({
          data: {
            projectId,
            projectProfessionalId: awardedPP.id,
            type: 'quotation_accepted',
            description: `Quotation accepted from ${projectProfessional.professional?.businessName || projectProfessional.professional?.fullName || 'Professional'}`,
            amount: quoteAmount,
            status: 'info',
            requestedBy: clientId,
            requestedByRole: 'client',
            actionBy: clientId,
            actionByRole: 'client',
            actionComplete: true,  // Info transactions don't require action
          },
        });

        // Persist approved budget + award pointers on project
        await tx.project.update({
          where: { id: projectId },
          data: {
            approvedBudget: quoteAmount,
            approvedBudgetTxId: quoteTx.id,
            awardedProjectProfessionalId: awardedPP.id,
            escrowRequired: quoteAmount,
          },
        });

        // Escrow deposit request is intentionally created later,
        // after both parties have signed the standard contract.
      }

      await this.ensureProjectPaymentPlan(tx as any, {
        projectId,
        projectProfessionalId: awardedPP.id,
        totalAmount: quoteAmount.toNumber(),
        explicitScale: (projectProfessional.project as any)?.projectScale || null,
        quoteEstimatedDurationMinutes:
          (projectProfessional as any)?.quoteEstimatedDurationMinutes || null,
        quoteEstimatedStartAt:
          (projectProfessional as any)?.quoteEstimatedStartAt || null,
        tradesRequired: (projectProfessional.project as any)?.tradesRequired || [],
        isEmergency: (projectProfessional.project as any)?.isEmergency || false,
      });

      return { awarded: awardedPP };
    });

    const project = projectProfessional.project;
    const professionals = project.professionals;
    const awardedTradeScope = this.normalizeTradeLabels([
      ...(((projectProfessional as any).quoteRequestedTrades as string[] | undefined) || []),
      ...(
        (((projectProfessional as any).quoteRequestedTrades as string[] | undefined)?.length || 0) > 0
          ? []
          : this.deriveInvitationTradeScope(
              this.normalizeTradeLabels((project as any)?.tradesRequired || []),
              projectProfessional.professional,
            ).requestedTrades
      ),
    ]);
    const winnerName =
      projectProfessional.professional.fullName ||
      projectProfessional.professional.businessName ||
      'Professional';
    const clientName = project.clientName;
    const notificationAudit = this.createNotificationAudit(
      'quote_award_notifications',
      projectId,
      {
        awardedProfessionalId: professionalId,
      },
    );
    const winnerAudit: NotificationAuditRecipient = {
      actorType: 'professional',
      actorId: professionalId,
      role: 'winner',
      email: { status: 'skipped' },
      direct: { status: 'skipped' },
    };

    // Send winner notification

    console.log('[ProjectsService.awardQuote] Notifying winner:', {
      projectId,
      professionalId,
      email: projectProfessional.professional.email,
    });

    try {
      await this.emailService.sendWinnerNotification({
        to: projectProfessional.professional.email,
        professionalName: winnerName,
        projectName: project.projectName,
        quoteAmount: projectProfessional.quoteAmount?.toString() || '0',
        awardedTradesText:
          awardedTradeScope.length > 0 ? awardedTradeScope.join(', ') : undefined,
        quoteBreakdownLines: getQuoteBreakdownDisplayLines((projectProfessional as any).quoteBreakdown),
        nextStepsMessage:
          'The client will contact you soon to discuss next steps. You can share your contact details or continue communicating via the platform for transparency and project management.\n\nWhile you are waiting for the client to get in contact with you, please ensure you sign the project contract, available in your project panel. Without a signed, binding contract we will not ask the client to fund the project.',
      });
      winnerAudit.email.status = 'sent';
    } catch (error) {
      winnerAudit.email.status = 'failed';
      winnerAudit.email.error = error?.message;
      throw error;
    }

    // Send preferred channel notification to winner (email remains as backup)
    try {
      console.log('[ProjectsService.awardQuote] Preparing notification for professional:', {
        professionalId: projectProfessional.professional.id,
        professionalEmail: projectProfessional.professional.email,
        professionalPhone: projectProfessional.professional.phone ? `${projectProfessional.professional.phone.substring(0, 4)}...` : null,
      });

      const preference = await this.prisma.notificationPreference.findUnique({
        where: { professionalId: projectProfessional.professional.id },
        select: {
          primaryChannel: true,
          fallbackChannel: true,
          enableWhatsApp: true,
          enableSMS: true,
        },
      });

      const preferredChannel = preference?.primaryChannel;
      const fallbackChannel = preference?.fallbackChannel;

      const isMessagingChannel = (channel?: NotificationChannel | null) =>
        channel === NotificationChannel.WHATSAPP ||
        channel === NotificationChannel.SMS;

      const isChannelEnabled = (channel?: NotificationChannel | null) => {
        if (!channel) return false;
        if (channel === NotificationChannel.WHATSAPP) {
          return preference?.enableWhatsApp ?? true;
        }
        if (channel === NotificationChannel.SMS) {
          return preference?.enableSMS ?? true;
        }
        return false;
      };

      let directChannel: NotificationChannel | null = null;
      if (isMessagingChannel(preferredChannel) && isChannelEnabled(preferredChannel)) {
        directChannel = preferredChannel as NotificationChannel;
      } else if (
        isMessagingChannel(fallbackChannel) &&
        isChannelEnabled(fallbackChannel)
      ) {
        directChannel = fallbackChannel as NotificationChannel;
      } else if (!preference) {
        directChannel = NotificationChannel.WHATSAPP;
      }
      winnerAudit.direct.preferredChannel = preferredChannel;
      winnerAudit.direct.channel = directChannel;

      // TODO(notification-templates): revisit award-notification templates per channel in a dedicated template pass.
      const winnerShortMsg = `Congratulations! Your quote for "${project.projectName}" has been awarded. The client will contact you soon to discuss next steps.`;

      if (projectProfessional.professional.phone && directChannel) {
        console.log('[ProjectsService.awardQuote] Sending notification to:', projectProfessional.professional.phone);

        const sendResult = await this.notificationService.send({
          professionalId: projectProfessional.professional.id,
          phoneNumber: projectProfessional.professional.phone,
          channel: directChannel,
          eventType: 'quote_awarded',
          message: winnerShortMsg,
        });

        if (sendResult.success) {
          winnerAudit.direct.status = 'sent';
          console.log('[ProjectsService.awardQuote] Notification sent successfully');
        } else {
          winnerAudit.direct.status = 'failed';
          winnerAudit.direct.error =
            sendResult.error || 'Direct winner notification failed';
        }
      } else {
        winnerAudit.direct.status = 'skipped';
        winnerAudit.direct.reason = !projectProfessional.professional.phone
          ? 'missing_phone'
          : preference
            ? 'no_enabled_messaging_channel'
            : 'missing_notification_preference';
        console.log('[ProjectsService.awardQuote] Skipping direct winner notification (no phone or primary channel is EMAIL/unsupported)', {
          hasPhone: Boolean(projectProfessional.professional.phone),
          preferredChannel,
        });
      }
    } catch (error) {
      winnerAudit.direct.status = 'failed';
      winnerAudit.direct.error = error?.message;
      console.error('[ProjectsService.awardQuote] Failed to send preferred-channel notification to winner:', error);
      console.error('[ProjectsService.awardQuote] Error details:', {
        message: error?.message,
      });
    }

    this.pushNotificationAuditRecipient(notificationAudit, winnerAudit);

    // Push notification for quote awarded (independent of SMS/WhatsApp)
    void this.pushService.sendToProfessional(projectProfessional.professional.id, {
      title: 'Quote Awarded!',
      body: `Your quote for "${project.projectName}" was accepted. The client will contact you soon.`,
      url: `/professional-projects?projectId=${projectId}`,
      tag: `quote-awarded-${projectProfessional.id}`,
    });

    // Send escrow notification to professional
    const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:3000';
    await this.emailService.sendEscrowNotification({
      to: projectProfessional.professional.email,
      professionalName: winnerName,
      projectName: project.projectName,
      invoiceAmount: `$${projectProfessional.quoteAmount?.toString() || '0'}`,
      projectUrl: `${webBaseUrl}/professional-projects/${awarded.id}`,
    });

    // Emit structured in-app event message for the awarded professional
    try {
      const awardedAmount = projectProfessional.quoteAmount
        ? `HK$${Number(projectProfessional.quoteAmount).toLocaleString()}`
        : null;
      const quoteAcceptedPayload = {
        type: 'quote-accepted',
        icon: '🏆',
        title: 'Quote Awarded',
        fields: [
          { label: 'Project', value: project.projectName },
          ...(awardedAmount ? [{ label: 'Amount', value: awardedAmount }] : []),
          ...getQuoteBreakdownDisplayLines((projectProfessional as any).quoteBreakdown).map((line) => {
            const separatorIndex = line.indexOf(':');
            if (separatorIndex === -1) {
              return { label: 'Breakdown', value: line };
            }
            return {
              label: line.slice(0, separatorIndex),
              value: line.slice(separatorIndex + 1).trim(),
            };
          }),
        ],
      };
      await this.prisma.message.create({
        data: {
          projectProfessionalId: awarded.id,
          senderType: 'client',
          senderClientId: project.clientId,
          content: `[[event]]\n${JSON.stringify(quoteAcceptedPayload)}`,
        },
      });
    } catch (e) {
      console.warn('[ProjectsService.awardQuote] Failed to create award event message:', e);
    }

    // Send notifications to non-declined, non-awarded professionals
    const otherProfessionals = professionals.filter(
      (pp: any) =>
        pp.professionalId !== professionalId &&
        !['declined', 'rejected'].includes(pp.status),
    );

    for (const pp of otherProfessionals) {
      const nonWinnerAudit: NotificationAuditRecipient = {
        actorType: 'professional',
        actorId: pp.professional.id,
        role: 'non_winner',
        email: { status: 'skipped' },
        direct: { status: 'skipped' },
      };

      const hadQuoted = Boolean(pp.quotedAt || pp.quoteAmount);
      const loserEmailMessage = hadQuoted
        ? 'Thank you for your time and effort on this project. We hope to work with you on future opportunities.'
        : 'Bidding has now concluded for this project. Thank you for your interest, and we look forward to working with you in the future.';
      const loserDirectMessage = hadQuoted
        ? `Update on "${project.projectName}": another professional was selected this time. Thank you for your quote-we hope to work with you on a future project.`
        : `Update on "${project.projectName}": bidding has now concluded. Thank you for your interest-we look forward to working with you in the future.`;
      const loserChatMessage = hadQuoted
        ? `Thank you for your quote on "${project.projectName}". Another professional was selected for this project. We appreciate your time and hope to work with you in the future.`
        : `Bidding has concluded for "${project.projectName}". Thank you for your interest in this opportunity. We look forward to working with you in the future.`;

      try {
        await this.emailService.sendLoserNotification({
          to: pp.professional.email,
          professionalName:
            pp.professional.fullName ||
            pp.professional.businessName ||
            'Professional',
          projectName: project.projectName,
          thankYouMessage: loserEmailMessage,
        });
        nonWinnerAudit.email.status = 'sent';
      } catch (err) {
        nonWinnerAudit.email.status = 'failed';
        nonWinnerAudit.email.error = err?.message;
        console.error(
          '[ProjectsService.awardQuote] Failed to send loser notification',
          {
            to: pp.professional.email,
            error: err?.message,
          },
        );
      }

      try {
        const preference = await this.prisma.notificationPreference.findUnique({
          where: { professionalId: pp.professional.id },
          select: {
            primaryChannel: true,
            fallbackChannel: true,
            enableWhatsApp: true,
            enableSMS: true,
          },
        });

        const preferredChannel = preference?.primaryChannel;
        const fallbackChannel = preference?.fallbackChannel;

        const isMessagingChannel = (channel?: NotificationChannel | null) =>
          channel === NotificationChannel.WHATSAPP ||
          channel === NotificationChannel.SMS;

        const isChannelEnabled = (channel?: NotificationChannel | null) => {
          if (!channel) return false;
          if (channel === NotificationChannel.WHATSAPP) {
            return preference?.enableWhatsApp ?? true;
          }
          if (channel === NotificationChannel.SMS) {
            return preference?.enableSMS ?? true;
          }
          return false;
        };

        let directChannel: NotificationChannel | null = null;
        if (isMessagingChannel(preferredChannel) && isChannelEnabled(preferredChannel)) {
          directChannel = preferredChannel as NotificationChannel;
        } else if (
          isMessagingChannel(fallbackChannel) &&
          isChannelEnabled(fallbackChannel)
        ) {
          directChannel = fallbackChannel as NotificationChannel;
        } else if (!preference) {
          directChannel = NotificationChannel.WHATSAPP;
        }
        nonWinnerAudit.direct.preferredChannel = preferredChannel;
        nonWinnerAudit.direct.channel = directChannel;

        if (pp.professional.phone && directChannel) {
          const sendResult = await this.notificationService.send({
            professionalId: pp.professional.id,
            phoneNumber: pp.professional.phone,
            channel: directChannel,
            eventType: 'quote_not_awarded',
            message: loserDirectMessage,
          });

          if (sendResult.success) {
            nonWinnerAudit.direct.status = 'sent';
          } else {
            nonWinnerAudit.direct.status = 'failed';
            nonWinnerAudit.direct.error =
              sendResult.error || 'Direct non-winner notification failed';
          }
        } else {
          nonWinnerAudit.direct.status = 'skipped';
          nonWinnerAudit.direct.reason = !pp.professional.phone
            ? 'missing_phone'
            : preference
              ? 'no_enabled_messaging_channel'
              : 'missing_notification_preference';
        }
      } catch (err) {
        nonWinnerAudit.direct.status = 'failed';
        nonWinnerAudit.direct.error = err?.message;
        console.error(
          '[ProjectsService.awardQuote] Failed to send preferred-channel non-winner notification',
          {
            professionalId: pp.professional?.id,
            error: err?.message,
          },
        );
      }

      this.pushNotificationAuditRecipient(notificationAudit, nonWinnerAudit);
    }

    await this.finalizeNotificationAudit(notificationAudit);

    // Loser messages (structured event cards)
    for (const pp of otherProfessionals) {
      // Update status to declined for non-awarded professionals
      try {
        await this.prisma.projectProfessional.update({
          where: { id: pp.id },
          data: { status: 'declined' },
        });

        // Cancel any pending site access requests from non-awarded professionals
        await this.prisma.siteAccessRequest.updateMany({
          where: {
            projectProfessionalId: pp.id,
            status: 'pending',
          },
          data: {
            status: 'cancelled',
            respondedAt: new Date(),
          },
        });
      } catch (err) {
        console.error(
          '[ProjectsService.awardQuote] Failed to update loser status to declined',
          {
            projectProfessionalId: pp.id,
            error: (err as Error)?.message,
          },
        );
      }
      const hadQuoted = Boolean(pp.quotedAt || pp.quoteAmount);
      const notSelectedPayload = {
        type: 'quote-not-selected',
        icon: '📋',
        title: hadQuoted ? 'Quote Not Selected' : 'Bidding Concluded',
        summary: hadQuoted
          ? `Thank you for your quote on "${project.projectName}". Another professional was selected this time. We appreciate your time and hope to work with you in the future.`
          : `Bidding has now concluded for "${project.projectName}". Thank you for your interest. We look forward to working with you in the future.`,
        fields: [{ label: 'Project', value: project.projectName }],
      };
      await this.prisma.message.create({
        data: {
          projectProfessionalId: pp.id,
          senderType: 'client',
          senderClientId: project.clientId,
          content: `[[event]]\n${JSON.stringify(notSelectedPayload)}`,
        },
      });
    }

    return awarded;
  }

  async reverseAward(
    projectId: string,
    adminUserId: string,
    body: { reason: string; reopenPriorQuotes?: boolean },
  ) {
    const reason = body.reason?.trim();
    if (!reason || reason.length < 5) {
      throw new BadRequestException('A clear admin reason is required to reverse an award');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: {
          select: {
            id: true,
            mobile: true,
            email: true,
          },
        },
        professionals: {
          include: {
            professional: true,
            paymentRequests: {
              select: { id: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const awardedProjectProfessional =
      project.professionals.find((pp: any) => pp.id === project.awardedProjectProfessionalId) ||
      project.professionals.find((pp: any) => pp.status === 'awarded');

    if (!awardedProjectProfessional) {
      throw new BadRequestException('No awarded professional is currently attached to this project');
    }

    const [nonAwardFinancialCount, projectPaymentRequestCount] = await Promise.all([
      this.prisma.financialTransaction.count({
        where: {
          projectId,
          type: { not: 'quotation_accepted' },
        },
      }),
      this.prisma.paymentRequest.count({
        where: {
          projectProfessional: {
            projectId,
          },
        },
      }),
    ]);

    const blockers: string[] = [];
    if (project.clientSignedAt) {
      blockers.push('client has already signed the contract');
    }
    if (project.professionalSignedAt) {
      blockers.push('professional has already signed the contract');
    }
    if (project.escrowHeld && new Decimal(project.escrowHeld.toString()).greaterThan(0)) {
      blockers.push('escrow funds are already held');
    }
    if (nonAwardFinancialCount > 0) {
      blockers.push('financial activity exists beyond quotation acceptance');
    }
    if (projectPaymentRequestCount > 0 || awardedProjectProfessional.paymentRequests?.length > 0) {
      blockers.push('payment requests already exist for this project');
    }

    if (blockers.length > 0) {
      throw new BadRequestException(
        `Award cannot be reversed automatically because ${blockers.join('; ')}. Please use a managed dispute or cancellation process instead.`,
      );
    }

    const reopenPriorQuotes = body.reopenPriorQuotes !== false;
    const reversedProfessionalName =
      awardedProjectProfessional.professional?.fullName ||
      awardedProjectProfessional.professional?.businessName ||
      awardedProjectProfessional.professional?.email ||
      'Professional';

    const priorQuotedProfessionals = project.professionals.filter(
      (pp: any) =>
        pp.id !== awardedProjectProfessional.id &&
        !!pp.quotedAt &&
        ['declined', 'quoted', 'counter_requested'].includes(pp.status),
    );

    const reopenedIds = reopenPriorQuotes
      ? priorQuotedProfessionals
          .filter((pp: any) => pp.status === 'declined' || pp.status === 'counter_requested')
          .map((pp: any) => pp.id)
      : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.projectProfessional.update({
        where: { id: awardedProjectProfessional.id },
        data: {
          status: 'award_reversed',
        },
      });

      if (reopenPriorQuotes && reopenedIds.length > 0) {
        await tx.projectProfessional.updateMany({
          where: { id: { in: reopenedIds } },
          data: {
            status: 'quoted',
          },
        });
      }

      await tx.projectStartProposal.updateMany({
        where: {
          projectId,
          projectProfessionalId: awardedProjectProfessional.id,
          status: 'proposed',
        },
        data: {
          status: 'superseded',
          respondedAt: new Date(),
          responseNotes: reason,
        },
      });

      await tx.project.update({
        where: { id: projectId },
        data: {
          status: 'quoted',
          currentStage: ProjectStage.QUOTE_RECEIVED,
          awardedProjectProfessionalId: null,
          approvedBudget: null,
          approvedBudgetTxId: null,
          escrowRequired: null,
          startDate: null,
          endDate: null,
          contractorName: null,
          contractorContactName: null,
          contractorContactPhone: null,
          contractorContactEmail: null,
        },
      });

      await this.activityLogService.record({
        userId: adminUserId,
        actorName: 'Admin',
        actorType: 'admin',
        action: 'project_award_reversed',
        resource: 'Project',
        resourceId: projectId,
        projectId,
        projectTitle: project.projectName,
        details: `Award reversed for ${reversedProfessionalName}`,
        metadata: {
          awardedProjectProfessionalId: awardedProjectProfessional.id,
          reversedProfessionalId: awardedProjectProfessional.professionalId,
          reopenPriorQuotes,
          reopenedProjectProfessionalIds: reopenedIds,
          reason,
        },
        status: 'warning',
        tx,
      });
    });

    try {
      if (awardedProjectProfessional.professional?.phone) {
        await this.notificationService.send({
          professionalId: awardedProjectProfessional.professional.id,
          phoneNumber: awardedProjectProfessional.professional.phone,
          eventType: 'award_reversed',
          message: `Admin update for "${project.projectName}": the award has been reversed and the project has been reopened for review. Reason: ${reason}`,
        });
      }
    } catch (error) {
      console.error('[ProjectsService.reverseAward] Failed to notify reversed professional:', error);
    }

    if (reopenPriorQuotes) {
      for (const projectProfessional of priorQuotedProfessionals) {
        if (!reopenedIds.includes(projectProfessional.id)) continue;
        try {
          if (projectProfessional.professional?.phone) {
            await this.notificationService.send({
              professionalId: projectProfessional.professional.id,
              phoneNumber: projectProfessional.professional.phone,
              eventType: 'quote_reopened',
              message: `Admin update for "${project.projectName}": the project has been reopened for quote review and your quotation is active again.`,
            });
          }
        } catch (error) {
          console.error('[ProjectsService.reverseAward] Failed to notify reopened professional:', error);
        }
      }
    }

    return {
      success: true,
      message: reopenPriorQuotes
        ? 'Award reversed and prior quoted professionals were reopened for review'
        : 'Award reversed successfully',
      reversedProfessionalId: awardedProjectProfessional.professionalId,
      reopenedProjectProfessionalIds: reopenedIds,
    };
  }

  async shareContact(
    projectId: string,
    professionalId: string,
    clientId?: string,
  ) {
    // Verify ProjectProfessional relationship exists and quote is awarded
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: {
            include: {
              user: true,

            },
          },
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (projectProfessional.status !== 'awarded') {
      throw new Error('Quote must be awarded before sharing contact details');
    }

    // Update ProjectProfessional to mark contact shared
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        directContactShared: true,
        directContactSharedAt: new Date(),
      },
    });

    const project = projectProfessional.project;
    const professional = projectProfessional.professional;
    const clientName = project.user
      ? `${project.user.firstName} ${project.user.surname}`.trim()
      : project.clientName;
    const clientPhone = project.user?.mobile || 'Not provided';
    const professionalName =
      professional.fullName || professional.businessName || 'Professional';

    // Send notification email to professional with client contact
    await this.emailService.sendContactShared({
      to: professional.email,
      professionalName,
      clientName,
      clientPhone,
      projectName: project.projectName,
    });

    // Return professional contact to client
    return {
      success: true,
      professional: {
        name: professionalName,
        phone: professional.phone,
        email: professional.email,
      },
    };
  }

  async counterRequest(projectId: string, professionalId: string) {
    // Verify ProjectProfessional exists and has a quote
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    if (!projectProfessional.quotedAt) {
      throw new Error('Professional has not submitted a quote yet');
    }

    // Update status to counter_requested
    await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        status: 'counter_requested',
      },
    });

    const project = projectProfessional.project;
    const professional = projectProfessional.professional;
    const professionalName =
      professional.fullName || professional.businessName || 'Professional';

    // Send notification email to professional
    await this.emailService.sendCounterRequest({
      to: professional.email,
      professionalName,
      projectName: project.projectName,
      currentQuote: projectProfessional.quoteAmount?.toString() || '0',
    });

    // Add system message
    await this.prisma.message.create({
      data: {
        projectProfessionalId: projectProfessional.id,
        senderType: 'client',
        senderClientId: project.clientId,
        content: `The client has requested a better offer. Please review and submit an updated quote if possible.`,
      },
    });

    return {
      success: true,
      message: 'Counter-request sent to professional',
    };
  }

  async updateQuote(
    projectId: string,
    professionalId: string,
    quoteAmount: number,
    quoteBreakdownInput?: unknown,
    quoteNotes?: string,
    quoteEstimatedStartAt?: string,
    quoteEstimatedDurationMinutes?: number,
    quoteEstimatedDurationUnit?: string,
  ) {
    // Verify ProjectProfessional exists
    const projectProfessional =
      await this.prisma.projectProfessional.findUnique({
        where: {
          projectId_professionalId: {
            projectId,
            professionalId,
          },
        },
        include: {
          professional: true,
          project: true,
        },
      });

    if (!projectProfessional) {
      throw new Error('Professional not invited to this project');
    }

    const quoteSchedule = this.normalizeQuoteSchedule(
      {
        quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes,
        quoteEstimatedDurationUnit,
      },
      { required: true },
    );

    const normalizedBreakdown = normalizeQuoteBreakdownInput(quoteBreakdownInput, {
      projectScale: (projectProfessional.project as any)?.projectScale,
      isEmergency: Boolean((projectProfessional.project as any)?.isEmergency),
    });

    const baseQuoteAmount = normalizedBreakdown?.baseTotal ?? quoteAmount;

    // Calculate gross price (with platform fee) from professional's base quote
    const feeBreakdown = await this.platformFeeService.calculateGrossPrice(
      baseQuoteAmount,
      professionalId,
      projectProfessional.project?.clientId || undefined,
    );

    const storedBreakdown = withClientQuoteBreakdown(normalizedBreakdown, feeBreakdown.grossAmount);

    // Update quote
    const updated = await this.prisma.projectProfessional.update({
      where: {
        projectId_professionalId: {
          projectId,
          professionalId,
        },
      },
      data: {
        quoteBaseAmount: feeBreakdown.baseAmount,
        quoteAmount: feeBreakdown.grossAmount,  // Client sees this (gross with fee)
        quotePlatformFeeAmount: feeBreakdown.platformFeeAmount,
        quotePlatformFeePercent: feeBreakdown.effectivePercent,
        quotePricingVersion: feeBreakdown.pricingVersion,
        quotePlatformFeeBreakdown: feeBreakdown as any,
        quoteBreakdown: storedBreakdown as any,
        feeCalculatedAt: feeBreakdown.calculatedAt,
        quoteNotes,
        quoteEstimatedStartAt: quoteSchedule.quoteEstimatedStartAt,
        quoteEstimatedDurationMinutes:
          quoteSchedule.quoteEstimatedDurationMinutes,
        quoteEstimatedDurationUnit: quoteSchedule.quoteEstimatedDurationUnit,
        quotedAt: new Date(),
        status: 'quoted', // Reset to quoted for client review
      },
      include: {
        professional: true,
      },
    });

    // Add system message
    await this.prisma.message.create({
      data: {
        projectProfessionalId: projectProfessional.id,
        senderType: 'professional',
        senderProfessionalId: professionalId,
        content: `Updated quote: $${feeBreakdown.grossAmount} (base: $${feeBreakdown.baseAmount}) · Estimated start ${this.formatDateTime(quoteSchedule.quoteEstimatedStartAt)} · Duration ${this.formatDurationMinutes(quoteSchedule.quoteEstimatedDurationMinutes || 0)}${quoteNotes ? ` - ${quoteNotes}` : ''}`,
      },
    });

    return {
      success: true,
      message: 'Quote updated successfully',
      projectProfessional: updated,
    };
  }

  async updateProjectSchedule(
    projectId: string,
    startDate?: string,
    endDate?: string,
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Update schedule fields
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });

    return {
      success: true,
      message: 'Schedule updated successfully',
      project: updated,
    };
  }

  async updateContractorContact(
    projectId: string,
    name?: string,
    phone?: string,
    email?: string,
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Update contractor contact fields
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        contractorContactName: name,
        contractorContactPhone: phone,
        contractorContactEmail: email,
      },
    });

    return {
      success: true,
      message: 'Contractor contact updated successfully',
      project: updated,
    };
  }

  async withdrawProject(projectId: string, userId: string) {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {

        professionals: {
          include: { professional: true },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found or not authorized');
    }

    const hasAwarded = project.professionals?.some(
      (pp: any) => pp.status === 'awarded',
    );
    if (hasAwarded) {
      throw new Error('Project already awarded; cannot withdraw');
    }

    const toNotify = (project.professionals || []).filter((pp: any) => {
      if (pp.status === 'awarded') return false;
      if (pp.status === 'accepted' || pp.status === 'quoted' || pp.status === 'counter_requested') return true;
      if (pp.createdAt && pp.createdAt >= cutoff) return true;
      return false;
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'withdrawn' },
    });

    await this.prisma.projectProfessional.updateMany({
      where: {
        projectId,
        status: { in: ['pending', 'accepted', 'quoted', 'counter_requested'] },
      },
      data: { status: 'withdrawn' },
    });

    // Notify professionals via email and system message
    await Promise.all(
      toNotify.map(async (pp: any) => {
        const professionalName =
          pp.professional.fullName || pp.professional.businessName || 'Professional';

        await this.prisma.message.create({
          data: {
            projectProfessionalId: pp.id,
            senderType: 'client',
            senderClientId: project.clientId,
            content:
              '🚫 Project withdrawn by client. Thank you for your participation.',
          },
        });

        try {
          await this.emailService.sendProjectWithdrawnNotification({
            to: pp.professional.email,
            professionalName,
            projectName: project.projectName,
          });
        } catch (err) {
          console.error('[ProjectsService.withdrawProject] Email failed', {
            to: pp.professional.email,
            error: (err as Error)?.message,
          });
        }
      }),
    );

    return { success: true, status: 'withdrawn' };
  }

  async archive(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if ((project.status || '').toLowerCase() === this.ARCHIVED_STATUS) {
      return { success: true, status: this.ARCHIVED_STATUS, alreadyArchived: true };
    }

    await this.prisma.project.update({
      where: { id },
      data: { status: this.ARCHIVED_STATUS, updatedAt: new Date() },
    });

    return { success: true, status: this.ARCHIVED_STATUS };
  }

  async unarchive(id: string, status = 'pending') {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if ((status || '').toLowerCase() === this.ARCHIVED_STATUS) {
      throw new BadRequestException('Unarchive status cannot be archived');
    }

    if ((project.status || '').toLowerCase() !== this.ARCHIVED_STATUS) {
      return { success: true, status: project.status, alreadyActive: true };
    }

    await this.prisma.project.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });

    return { success: true, status };
  }

  async remove(id: string) {
    return this.archive(id);
  }

  private buildBulkCleanWhere(criteria: {
    statuses?: string[];
    olderThanDays?: number;
    createdBefore?: string;
    includeArchived?: boolean;
  }): Prisma.ProjectWhereInput {
    const where: Prisma.ProjectWhereInput = {};

    const normalizedStatuses = Array.isArray(criteria.statuses)
      ? criteria.statuses
          .map((status) => String(status || '').trim().toLowerCase())
          .filter((status) => status.length > 0)
      : [];

    if (normalizedStatuses.length > 0) {
      where.status = { in: normalizedStatuses };
    } else if (!criteria.includeArchived) {
      where.status = { not: this.ARCHIVED_STATUS };
    }

    if (Number.isFinite(criteria.olderThanDays) && Number(criteria.olderThanDays) > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(criteria.olderThanDays));
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), lte: cutoff };
    }

    if (criteria.createdBefore) {
      const parsed = new Date(criteria.createdBefore);
      if (!Number.isNaN(parsed.getTime())) {
        where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), lte: parsed };
      }
    }

    return where;
  }

  private async getProjectDeletionImpact(projectIds: string[]) {
    if (projectIds.length === 0) {
      return {
        mimoProjectExtras: 0,
        projectPhotos: 0,
        projectProfessionals: 0,
        messages: 0,
        paymentRequests: 0,
        projectPaymentPlans: 0,
        paymentMilestones: 0,
        projectAssistRequests: 0,
        assistMessages: 0,
        projectChatThreads: 0,
        projectChatMessages: 0,
        privateChatThreads: 0,
        privateChatMessages: 0,
        privateContextMessages: 0,
        financialTransactions: 0,
        escrowLedgers: 0,
        procurementEvidence: 0,
        siteAccessRequests: 0,
        siteAccessVisits: 0,
        projectMilestones: 0,
        projectStartProposals: 0,
        nextStepActions: 0,
        adminActions: 0,
        emailTokens: 0,
        supportRequestsLinked: 0,
        questionnaireInvites: 0,
        aiIntakes: 0,
        aiIntakeImageInsights: 0,
        siteAccessData: 0,
        projectLocationDetails: 0,
        cases: 0,
        adminMessageAssignments: 0,
        acProjectsLinked: 0,
      };
    }

    const mimoProjectExtras = await this.prisma
      .$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(id)::bigint as count
        FROM mimo_project_extras
        WHERE "projectId" IN (${Prisma.join(projectIds)})
      `
      .then((rows) => Number(rows[0]?.count || 0n))
      .catch(() => 0);

    const [projectProfessionalIds, assistRequestIds, projectChatThreadIds, privateChatThreadIds, supportRequestIds, paymentPlanIds] = await Promise.all([
      this.prisma.projectProfessional.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } }),
      this.prisma.projectAssistRequest.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } }),
      this.prisma.projectChatThread.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } }),
      (this.prisma as any).privateChatThread.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } }),
      this.prisma.supportRequest.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } }),
      this.prisma.projectPaymentPlan.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } }),
    ]);

    const assignmentIds = projectProfessionalIds.map((row) => row.id);
    const assistIds = assistRequestIds.map((row) => row.id);
    const projectThreadIds = projectChatThreadIds.map((row) => row.id);
    const privateIds = privateChatThreadIds.map((row: { id: string }) => row.id);
    const supportIds = supportRequestIds.map((row) => row.id);
    const paymentPlanIdList = paymentPlanIds.map((row) => row.id);

    const privateContextMessages = projectIds.length
      ? await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(pcm.id)::bigint as count
          FROM "PrivateChatMessage" pcm
          INNER JOIN "PrivateChatThread" pct ON pct.id = pcm."threadId"
          WHERE pct."projectId" IS NULL
            AND COALESCE(pcm.context->>'projectId', '') IN (${Prisma.join(projectIds)})
        `
      : [{ count: BigInt(0) }];
    const privateContextMessageCount = Number(privateContextMessages[0]?.count || 0n);

    const [
      projectPhotos,
      projectProfessionals,
      messages,
      paymentRequests,
      projectPaymentPlans,
      paymentMilestones,
      projectAssistRequests,
      assistMessages,
      projectChatThreads,
      projectChatMessages,
      privateChatThreads,
      privateChatMessages,
      financialTransactions,
      escrowLedgers,
      procurementEvidence,
      siteAccessRequests,
      siteAccessVisits,
      projectMilestones,
      projectStartProposals,
      nextStepActions,
      adminActions,
      emailTokens,
      supportRequestsLinked,
      questionnaireInvites,
      aiIntakes,
      aiIntakeImageInsights,
      siteAccessData,
      projectLocationDetails,
      cases,
      acProjectsLinked,
    ] = await Promise.all([
      this.prisma.projectPhoto.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.projectProfessional.count({ where: { projectId: { in: projectIds } } }),
      assignmentIds.length ? this.prisma.message.count({ where: { projectProfessionalId: { in: assignmentIds } } }) : Promise.resolve(0),
      assignmentIds.length ? this.prisma.paymentRequest.count({ where: { projectProfessionalId: { in: assignmentIds } } }) : Promise.resolve(0),
      this.prisma.projectPaymentPlan.count({ where: { projectId: { in: projectIds } } }),
      paymentPlanIdList.length ? this.prisma.paymentMilestone.count({ where: { paymentPlanId: { in: paymentPlanIdList } } }) : Promise.resolve(0),
      this.prisma.projectAssistRequest.count({ where: { projectId: { in: projectIds } } }),
      assistIds.length ? this.prisma.assistMessage.count({ where: { assistRequestId: { in: assistIds } } }) : Promise.resolve(0),
      this.prisma.projectChatThread.count({ where: { projectId: { in: projectIds } } }),
      projectThreadIds.length ? this.prisma.projectChatMessage.count({ where: { threadId: { in: projectThreadIds } } }) : Promise.resolve(0),
      (this.prisma as any).privateChatThread.count({ where: { projectId: { in: projectIds } } }),
      privateIds.length ? (this.prisma as any).privateChatMessage.count({ where: { threadId: { in: privateIds } } }) : Promise.resolve(0),
      this.prisma.financialTransaction.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.escrowLedger.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.milestoneProcurementEvidence.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.siteAccessRequest.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.siteAccessVisit.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.projectMilestone.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.projectStartProposal.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.nextStepAction.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.adminAction.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.emailToken.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.supportRequest.count({ where: { projectId: { in: projectIds } } }),
      (this.prisma as any).questionnaireInvite.count({ where: { projectId: { in: projectIds } } }),
      (this.prisma as any).aiIntake.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.aiIntakeImageInsight.count({ where: { intake: { projectId: { in: projectIds } } } }),
      this.prisma.siteAccessData.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.projectLocationDetails.count({ where: { projectId: { in: projectIds } } }),
      (this.prisma as any).case.count({
        where: {
          OR: [
            { projectId: { in: projectIds } },
            ...(assistIds.length ? [{ assistRequestId: { in: assistIds } }] : []),
            ...(supportIds.length ? [{ supportRequestId: { in: supportIds } }] : []),
            ...(privateIds.length ? [{ privateChatId: { in: privateIds } }] : []),
          ],
        },
      }),
      this.prisma.acProject.count({ where: { linkedProjectId: { in: projectIds } } }),
    ]);

    const adminMessageAssignments = await this.prisma.adminMessageAssignment.count({
      where: {
        OR: [
          { sourceType: 'project', sourceId: { in: projectIds } },
          ...(projectThreadIds.length ? [{ sourceType: 'project', sourceId: { in: projectThreadIds } }] : []),
          ...(assistIds.length ? [{ sourceType: 'assist', sourceId: { in: assistIds } }] : []),
          ...(supportIds.length ? [{ sourceType: 'support', sourceId: { in: supportIds } }] : []),
          ...(privateIds.length ? [{ sourceType: 'private', sourceId: { in: privateIds } }] : []),
        ],
      },
    });

    return {
      mimoProjectExtras,
      projectPhotos,
      projectProfessionals,
      messages,
      paymentRequests,
      projectPaymentPlans,
      paymentMilestones,
      projectAssistRequests,
      assistMessages,
      projectChatThreads,
      projectChatMessages,
      privateChatThreads,
      privateChatMessages,
      privateContextMessages: privateContextMessageCount,
      financialTransactions,
      escrowLedgers,
      procurementEvidence,
      siteAccessRequests,
      siteAccessVisits,
      projectMilestones,
      projectStartProposals,
      nextStepActions,
      adminActions,
      emailTokens,
      supportRequestsLinked,
      questionnaireInvites,
      aiIntakes,
      aiIntakeImageInsights,
      siteAccessData,
      projectLocationDetails,
      cases,
      adminMessageAssignments,
      acProjectsLinked,
    };
  }

  async bulkCleanPreview(criteria: {
    statuses?: string[];
    olderThanDays?: number;
    createdBefore?: string;
    includeArchived?: boolean;
    limit?: number;
  }) {
    const where = this.buildBulkCleanWhere(criteria);
    const safeLimit = Number.isFinite(criteria.limit)
      ? Math.min(Math.max(Number(criteria.limit), 1), 500)
      : 200;

    const [totalMatched, statusBreakdown, sampleProjects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          projectName: true,
          status: true,
          createdAt: true,
        },
        take: safeLimit,
      }),
    ]);

    const projectIds = sampleProjects.map((project) => project.id);
    const affected = await this.getProjectDeletionImpact(projectIds);

    return {
      criteria: {
        statuses: criteria.statuses || [],
        olderThanDays: criteria.olderThanDays || null,
        createdBefore: criteria.createdBefore || null,
        includeArchived: !!criteria.includeArchived,
      },
      totalMatched,
      sampled: sampleProjects.length,
      statusBreakdown: statusBreakdown.map((row) => ({ status: row.status, count: row._count.status })),
      sampleProjects,
      sampleImpact: affected,
    };
  }

  async bulkCleanExecute(criteria: {
    action: 'archive' | 'permanent_delete';
    statuses?: string[];
    olderThanDays?: number;
    createdBefore?: string;
    includeArchived?: boolean;
    limit?: number;
    adminId?: string;
    adminName?: string;
  }) {
    const where = this.buildBulkCleanWhere(criteria);
    const safeLimit = Number.isFinite(criteria.limit)
      ? Math.min(Math.max(Number(criteria.limit), 1), 500)
      : 200;

    const candidates = await this.prisma.project.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
      },
      take: safeLimit,
    });

    if (criteria.action === 'archive') {
      const targetIds = candidates
        .filter((project) => (project.status || '').toLowerCase() !== this.ARCHIVED_STATUS)
        .map((project) => project.id);

      if (targetIds.length === 0) {
        return {
          action: criteria.action,
          selected: candidates.length,
          affected: 0,
          skipped: candidates.length,
        };
      }

      const result = await this.prisma.project.updateMany({
        where: {
          id: { in: targetIds },
        },
        data: {
          status: this.ARCHIVED_STATUS,
          updatedAt: new Date(),
        },
      });

      return {
        action: criteria.action,
        selected: candidates.length,
        affected: result.count,
        skipped: candidates.length - result.count,
      };
    }

    let deleted = 0;
    for (const project of candidates) {
      await this.hardRemove(project.id, criteria.adminId, criteria.adminName);
      deleted += 1;
    }

    return {
      action: criteria.action,
      selected: candidates.length,
      affected: deleted,
      skipped: candidates.length - deleted,
    };
  }

  async hardRemove(id: string, adminId?: string, adminName?: string) {
    // Capture pre-deletion impact counts for the audit log
    const preDeleteImpact = await this.getProjectDeletionImpact([id]);

    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        projectName: true,
        notes: true,
        photos: {
          select: {
            url: true,
            note: true,
          },
        },
        milestones: {
          select: {
            id: true,
            notes: true,
            photoUrls: true,
          },
        },
        locationDetails: {
          select: {
            photoUrls: true,
          },
        },
        assistRequests: {
          select: {
            id: true,
            notes: true,
            messages: {
              select: {
                content: true,
              },
            },
          },
        },
        chatThread: {
          select: {
            id: true,
            messages: {
              select: {
                content: true,
                attachments: true,
              },
            },
          },
        },
        supportRequests: {
          select: {
            id: true,
            body: true,
            notes: true,
            replies: true,
          },
        },
        professionals: {
          select: {
            id: true,
            quoteNotes: true,
            visitNotes: true,
          },
        },
        financialTransactions: {
          select: {
            id: true,
            notes: true,
          },
        },
        procurementEvidence: {
          select: {
            id: true,
            notes: true,
            invoiceUrls: true,
            photoUrls: true,
          },
        },
        siteAccessRequests: {
          select: {
            id: true,
            visitDetails: true,
            reasonDenied: true,
          },
        },
        siteAccessVisits: {
          select: {
            id: true,
            notes: true,
            responseNotes: true,
          },
        },
        startProposals: {
          select: {
            id: true,
            notes: true,
            responseNotes: true,
          },
        },
        nextStepActions: {
          select: {
            id: true,
          },
        },
        adminActions: {
          select: {
            id: true,
          },
        },
        emailTokens: {
          select: {
            id: true,
          },
        },
        paymentPlan: {
          select: {
            id: true,
            milestones: {
              select: {
                id: true,
              },
            },
          },
        },
        aiIntake: {
          select: {
            id: true,
            rawPrompt: true,
            rawOutput: true,
            summary: true,
            scope: true,
          },
        },
        acProjects: {
          select: {
            id: true,
            notes: true,
            shoppingList: true,
          },
        },
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const privateThreads = await this.prisma.privateChatThread.findMany({
      where: { projectId: id },
      select: {
        id: true,
        messages: {
          select: {
            content: true,
            attachments: true,
          },
        },
      },
    });

    // Some legacy/general FOH threads keep project linkage in message context only.
    // Remove those project-scoped messages as part of hard delete as well.
    const privateContextMessages = await this.prisma.$queryRaw<
      Array<{ id: string; threadId: string; content: string | null; attachments: Prisma.JsonValue | null }>
    >`
      SELECT pcm.id, pcm."threadId", pcm.content, pcm.attachments
      FROM "PrivateChatMessage" pcm
      INNER JOIN "PrivateChatThread" pct ON pct.id = pcm."threadId"
      WHERE pct."projectId" IS NULL
        AND COALESCE(pcm.context->>'projectId', '') = ${id}
    `;

    const questionnaireInvites = await (this.prisma as any).questionnaireInvite.findMany({
      where: { projectId: id },
      select: {
        id: true,
        customMessage: true,
        metadata: true,
      },
    });

    const caseWhereOr: Array<Record<string, string>> = [{ projectId: id }];
    project.assistRequests.forEach((request) => caseWhereOr.push({ assistRequestId: request.id }));
    project.supportRequests.forEach((request) => caseWhereOr.push({ supportRequestId: request.id }));
    privateThreads.forEach((thread) => caseWhereOr.push({ privateChatId: thread.id }));

    const cases = await (this.prisma as any).case.findMany({
      where: {
        OR: caseWhereOr,
      },
      select: {
        id: true,
      },
    });

    const projectProfessionalIds = project.professionals.map((assignment) => assignment.id);
    const assistIds = project.assistRequests.map((request) => request.id);
    const supportIds = project.supportRequests.map((request) => request.id);
    const privateIds = privateThreads.map((thread) => thread.id);
    const privateContextMessageIds = privateContextMessages.map((message) => message.id);
    const projectThreadIds = project.chatThread?.id ? [project.chatThread.id] : [];
    const paymentPlanIds = project.paymentPlan ? [project.paymentPlan.id] : [];
    const paymentMilestoneIds = project.paymentPlan?.milestones.map((milestone) => milestone.id) || [];
    const financialTransactionIds = project.financialTransactions.map((transaction) => transaction.id);
    const milestoneIds = project.milestones.map((milestone) => milestone.id);
    const siteAccessRequestIds = project.siteAccessRequests.map((request) => request.id);
    const siteAccessVisitIds = project.siteAccessVisits.map((visit) => visit.id);
    const startProposalIds = project.startProposals.map((proposal) => proposal.id);
    const nextStepActionIds = project.nextStepActions.map((action) => action.id);
    const adminActionIds = project.adminActions.map((action) => action.id);
    const emailTokenIds = project.emailTokens.map((token) => token.id);
    const procurementEvidenceIds = project.procurementEvidence.map((evidence) => evidence.id);
    const questionnaireInviteIds = questionnaireInvites.map((invite: { id: string }) => invite.id);
    const aiIntakeIds = project.aiIntake?.id ? [project.aiIntake.id] : [];
    const acProjectIds = project.acProjects.map((acProject) => acProject.id);
    const caseIds = cases.map((record: { id: string }) => record.id);

    const assignmentFilters: Array<{ sourceType: string; sourceId: string }> = [
      { sourceType: 'project', sourceId: id },
      ...projectThreadIds.map((sourceId) => ({ sourceType: 'project', sourceId })),
      ...assistIds.map((sourceId) => ({ sourceType: 'assist', sourceId })),
      ...supportIds.map((sourceId) => ({ sourceType: 'support', sourceId })),
      ...privateIds.map((sourceId) => ({ sourceType: 'private', sourceId })),
    ];

    const activityLogFilters: Array<{ resource: string; resourceId: string }> = [
      { resource: 'Project', resourceId: id },
      ...projectProfessionalIds.map((resourceId) => ({ resource: 'ProjectProfessional', resourceId })),
      ...assistIds.map((resourceId) => ({ resource: 'ProjectAssistRequest', resourceId })),
      ...projectThreadIds.map((resourceId) => ({ resource: 'ProjectChatThread', resourceId })),
      ...supportIds.map((resourceId) => ({ resource: 'SupportRequest', resourceId })),
      ...privateIds.map((resourceId) => ({ resource: 'PrivateChatThread', resourceId })),
      ...caseIds.map((resourceId) => ({ resource: 'Case', resourceId })),
      ...financialTransactionIds.map((resourceId) => ({ resource: 'FinancialTransaction', resourceId })),
      ...paymentPlanIds.map((resourceId) => ({ resource: 'ProjectPaymentPlan', resourceId })),
      ...paymentMilestoneIds.map((resourceId) => ({ resource: 'PaymentMilestone', resourceId })),
      ...milestoneIds.map((resourceId) => ({ resource: 'ProjectMilestone', resourceId })),
      ...siteAccessRequestIds.map((resourceId) => ({ resource: 'SiteAccessRequest', resourceId })),
      ...siteAccessVisitIds.map((resourceId) => ({ resource: 'SiteAccessVisit', resourceId })),
      ...startProposalIds.map((resourceId) => ({ resource: 'ProjectStartProposal', resourceId })),
      ...nextStepActionIds.map((resourceId) => ({ resource: 'NextStepAction', resourceId })),
      ...adminActionIds.map((resourceId) => ({ resource: 'AdminAction', resourceId })),
      ...emailTokenIds.map((resourceId) => ({ resource: 'EmailToken', resourceId })),
      ...procurementEvidenceIds.map((resourceId) => ({ resource: 'MilestoneProcurementEvidence', resourceId })),
      ...questionnaireInviteIds.map((resourceId) => ({ resource: 'QuestionnaireInvite', resourceId })),
      ...aiIntakeIds.map((resourceId) => ({ resource: 'AiIntake', resourceId })),
      ...acProjectIds.map((resourceId) => ({ resource: 'AcProject', resourceId })),
    ];

    const fileCandidates: unknown[] = [
      project.notes,
      ...project.photos.flatMap((photo) => [photo.url, photo.note]),
      ...project.milestones.flatMap((milestone) => [milestone.notes, milestone.photoUrls]),
      project.locationDetails?.photoUrls,
      ...project.assistRequests.flatMap((request) => [request.notes, request.messages.map((message) => message.content)]),
      ...project.chatThread?.messages.flatMap((message) => [message.content, message.attachments]) || [],
      ...project.supportRequests.flatMap((request) => [request.body, request.notes, request.replies]),
      ...privateThreads.flatMap((thread) => thread.messages.flatMap((message) => [message.content, message.attachments])),
      ...privateContextMessages.flatMap((message) => [message.content, message.attachments]),
      ...project.professionals.flatMap((assignment) => [assignment.quoteNotes, assignment.visitNotes]),
      ...project.financialTransactions.map((transaction) => transaction.notes),
      ...project.procurementEvidence.flatMap((evidence) => [evidence.notes, evidence.invoiceUrls, evidence.photoUrls]),
      ...project.siteAccessRequests.flatMap((request) => [request.visitDetails, request.reasonDenied]),
      ...project.siteAccessVisits.flatMap((visit) => [visit.notes, visit.responseNotes]),
      ...project.startProposals.flatMap((proposal) => [proposal.notes, proposal.responseNotes]),
      ...questionnaireInvites.flatMap((invite: { customMessage?: string | null; metadata?: unknown }) => [invite.customMessage, invite.metadata]),
      project.aiIntake?.rawPrompt,
      project.aiIntake?.rawOutput,
      project.aiIntake?.summary,
      project.aiIntake?.scope,
      ...project.acProjects.flatMap((acProject) => [acProject.notes, acProject.shoppingList]),
    ];

    const result = await this.prisma.$transaction(async (tx) => {
      if (assignmentFilters.length > 0) {
        await tx.adminMessageAssignment.deleteMany({
          where: {
            OR: assignmentFilters,
          },
        });
      }

      if (caseWhereOr.length > 0) {
        await (tx as any).case.deleteMany({
          where: {
            OR: caseWhereOr,
          },
        });
      }

      if (questionnaireInviteIds.length > 0) {
        await (tx as any).questionnaireInvite.deleteMany({
          where: {
            id: { in: questionnaireInviteIds },
          },
        });
      }

      if (aiIntakeIds.length > 0) {
        await (tx as any).aiIntake.deleteMany({
          where: {
            id: { in: aiIntakeIds },
          },
        });
      }

      await tx
        .$executeRaw`
          DELETE FROM mimo_project_extras
          WHERE "projectId" = ${id}
        `
        .catch(() => 0);

      if (supportIds.length > 0) {
        await tx.supportRequest.deleteMany({
          where: {
            id: { in: supportIds },
          },
        });
      }

      if (privateIds.length > 0) {
        await (tx as any).privateChatThread.deleteMany({
          where: {
            id: { in: privateIds },
          },
        });
      }

      if (privateContextMessageIds.length > 0) {
        await (tx as any).privateChatMessage.deleteMany({
          where: {
            id: { in: privateContextMessageIds },
          },
        });
      }

      if (acProjectIds.length > 0) {
        await tx.acProject.deleteMany({
          where: {
            id: { in: acProjectIds },
          },
        });
      }

      if (activityLogFilters.length > 0) {
        await (tx as any).activityLog.deleteMany({
          where: {
            OR: activityLogFilters,
          },
        });
      }

      const deletedProject = await tx.project.delete({
        where: { id },
      });

      const residualCounts = {
        mimoProjectExtras: await tx
          .$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(id)::bigint as count
            FROM mimo_project_extras
            WHERE "projectId" = ${id}
          `
          .then((rows) => Number(rows[0]?.count || 0n))
          .catch(() => 0),
        project: await tx.project.count({ where: { id } }),
        projectPhotos: await tx.projectPhoto.count({ where: { projectId: id } }),
        projectProfessionals: await tx.projectProfessional.count({ where: { projectId: id } }),
        messages: projectProfessionalIds.length
          ? await tx.message.count({ where: { projectProfessionalId: { in: projectProfessionalIds } } })
          : 0,
        paymentRequests: projectProfessionalIds.length
          ? await tx.paymentRequest.count({ where: { projectProfessionalId: { in: projectProfessionalIds } } })
          : 0,
        paymentPlans: await tx.projectPaymentPlan.count({ where: { projectId: id } }),
        paymentMilestones: paymentPlanIds.length
          ? await tx.paymentMilestone.count({ where: { paymentPlanId: { in: paymentPlanIds } } })
          : 0,
        assistRequests: await tx.projectAssistRequest.count({ where: { projectId: id } }),
        assistMessages: assistIds.length
          ? await tx.assistMessage.count({ where: { assistRequestId: { in: assistIds } } })
          : 0,
        projectChatThreads: await tx.projectChatThread.count({ where: { projectId: id } }),
        projectChatMessages: projectThreadIds.length
          ? await tx.projectChatMessage.count({ where: { threadId: { in: projectThreadIds } } })
          : 0,
        privateChatThreads: await (tx as any).privateChatThread.count({ where: { projectId: id } }),
        privateChatMessages: privateIds.length
          ? await (tx as any).privateChatMessage.count({ where: { threadId: { in: privateIds } } })
          : 0,
        financialTransactions: await tx.financialTransaction.count({ where: { projectId: id } }),
        escrowLedgers: await tx.escrowLedger.count({ where: { projectId: id } }),
        procurementEvidence: await tx.milestoneProcurementEvidence.count({ where: { projectId: id } }),
        siteAccessRequests: await tx.siteAccessRequest.count({ where: { projectId: id } }),
        siteAccessVisits: await tx.siteAccessVisit.count({ where: { projectId: id } }),
        projectMilestones: await tx.projectMilestone.count({ where: { projectId: id } }),
        startProposals: await tx.projectStartProposal.count({ where: { projectId: id } }),
        nextStepActions: await tx.nextStepAction.count({ where: { projectId: id } }),
        adminActions: await tx.adminAction.count({ where: { projectId: id } }),
        emailTokens: await tx.emailToken.count({ where: { projectId: id } }),
        supportRequests: await tx.supportRequest.count({ where: { projectId: id } }),
        questionnaireInvites: await (tx as any).questionnaireInvite.count({ where: { projectId: id } }),
        aiIntakes: await (tx as any).aiIntake.count({ where: { projectId: id } }),
        aiIntakeImageInsights: await tx.aiIntakeImageInsight.count({ where: { intake: { projectId: id } } }),
        siteAccessData: await tx.siteAccessData.count({ where: { projectId: id } }),
        locationDetails: await tx.projectLocationDetails.count({ where: { projectId: id } }),
        cases: await (tx as any).case.count({
          where: {
            OR: [
              { projectId: id },
              ...(assistIds.length ? [{ assistRequestId: { in: assistIds } }] : []),
              ...(supportIds.length ? [{ supportRequestId: { in: supportIds } }] : []),
              ...(privateIds.length ? [{ privateChatId: { in: privateIds } }] : []),
            ],
          },
        }),
        adminMessageAssignments: await tx.adminMessageAssignment.count({
          where: {
            OR: assignmentFilters,
          },
        }),
        acProjects: await tx.acProject.count({ where: { linkedProjectId: id } }),
      };

      const residualEntries = Object.entries(residualCounts).filter(([, count]) => count > 0);
      if (residualEntries.length > 0) {
        throw new BadRequestException(
          `Project delete left residual records: ${residualEntries
            .map(([key, count]) => `${key}=${count}`)
            .join(', ')}`,
        );
      }

      return deletedProject;
    }, { timeout: 30000, maxWait: 5000 });

    const filesCleanedUp = this.extractUploadFilepaths(fileCandidates).length;
    await this.deleteProjectFiles(fileCandidates);

    // Write immutable purge audit entry (outside the transaction so it survives)
    await this.writePurgeAuditEntry({
      projectId: id,
      projectName: (project as any).projectName || id,
      adminId,
      adminName,
      impactCounts: preDeleteImpact,
      filesCleanedUp,
    });

    return result;
  }

  private async writePurgeAuditEntry(data: {
    projectId: string;
    projectName: string;
    adminId?: string;
    adminName?: string;
    impactCounts: Record<string, number>;
    filesCleanedUp: number;
  }) {
    const totalRecords = Object.values(data.impactCounts).reduce((sum, n) => sum + n, 0);
    try {
      await this.activityLogService.record({
        userId: data.adminId || null,
        actorName: data.adminName || 'Admin',
        actorType: 'admin',
        action: 'project_purged',
        resource: 'PurgeAuditLog',
        resourceId: data.projectId,
        projectId: data.projectId,
        projectTitle: data.projectName,
        details: `Project "${data.projectName}" permanently deleted. ${totalRecords} records purged across ${Object.keys(data.impactCounts).length} tables. ${data.filesCleanedUp} file(s) removed from storage.`,
        metadata: {
          projectName: data.projectName,
          impact: data.impactCounts,
          totalRecords,
          filesCleanedUp: data.filesCleanedUp,
          purgedAt: new Date().toISOString(),
        },
        status: 'danger',
        bumpProjectActivity: false,
      });
    } catch (err) {
      // Audit write must not block the response — log and continue
      console.error('[ProjectsService.writePurgeAuditEntry] Failed to write purge audit log:', (err as any)?.message);
    }
  }

  async getPurgeAuditLogs(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { action: 'project_purged' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { firstName: true, surname: true, email: true } },
        },
      }),
      this.prisma.activityLog.count({ where: { action: 'project_purged' } }),
    ]);
    return { logs, total, page, limit };
  }

  private async deleteProjectFiles(values: unknown[]) {
    const files = this.extractUploadFilepaths(values);
    if (files.length === 0) {
      return;
    }

    await Promise.all(
      files.map(async (filepath) => {
        try {
          await fs.unlink(filepath);
        } catch (err) {
          return;
        }
      }),
    );
  }

  private extractUploadFilepaths(values: unknown[]): string[] {
    const uploadsRoot = resolve(process.cwd(), 'uploads');
    const filepaths = new Set<string>();

    const visit = (value: unknown) => {
      if (value == null) return;

      if (typeof value === 'string') {
        const matches = value.match(/(https?:\/\/[^\s,;"')]+|\/uploads\/[^\s,;"')]+)/g) || [];
        matches.forEach((raw) => {
          const uploadIndex = raw.indexOf('/uploads/');
          if (uploadIndex === -1) return;

          const relative = raw
            .slice(uploadIndex + '/uploads/'.length)
            .split(/[?#]/)[0]
            .trim();
          if (!relative) return;

          const target = resolve(uploadsRoot, relative);
          if (!target.startsWith(uploadsRoot)) return;

          filepaths.add(target);
        });
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      if (typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(visit);
      }
    };

    values.forEach(visit);
    return Array.from(filepaths);
  }

  // Removed payInvoice flow; payments are handled via escrow and payment requests

  // ─── On-site QR start ────────────────────────────────────────────────────

  /**
   * Professional generates a short-lived signed token for the client to scan.
   * Token encodes { projectId, generatedByUserId, purpose: 'site_start' } and
   * expires in 15 minutes.
   */
  async generateSiteStartToken(
    projectId: string,
    professionalUserId: string,
  ): Promise<{ token: string; expiresAt: string }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        siteStartedAt: true,
        awardedProjectProfessional: {
          select: { professional: { select: { userId: true } } },
        },
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (project.siteStartedAt) {
      throw new BadRequestException('Project has already been started on site');
    }

    // Verify the caller is the awarded professional
    const awardedUserId = (project.awardedProjectProfessional as any)?.professional?.userId;
    if (awardedUserId && awardedUserId !== professionalUserId) {
      throw new BadRequestException('Only the awarded professional can generate the site start QR');
    }

    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const expiresInSeconds = 15 * 60; // 15 minutes
    const payload = {
      projectId,
      generatedByUserId: professionalUserId,
      purpose: 'site_start',
    };

    const token = jwt.sign(payload, secret, { expiresIn: expiresInSeconds });
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return { token, expiresAt };
  }

  /**
   * Client scans the QR and calls this to confirm on-site presence.
   * Validates the token, sets siteStartedAt, and returns info for stage transition.
   * Stage transition (PRE_WORK / CONTRACT_PHASE → WORK_IN_PROGRESS) is handled by the controller.
   */
  async confirmSiteStart(
    projectId: string,
    clientUserId: string,
    token: string,
  ): Promise<{ siteStartedAt: Date; previousStage: string }> {
    const secret = process.env.JWT_SECRET || 'your-secret-key';

    let decoded: { projectId: string; generatedByUserId: string; purpose: string };
    try {
      decoded = jwt.verify(token, secret) as typeof decoded;
    } catch {
      throw new BadRequestException('QR code is invalid or has expired. Ask the professional to regenerate it.');
    }

    if (decoded.purpose !== 'site_start') {
      throw new BadRequestException('Invalid QR code');
    }

    if (decoded.projectId !== projectId) {
      throw new BadRequestException('QR code does not match this project');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        siteStartedAt: true,
        currentStage: true,
      },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (project.userId !== clientUserId) {
      throw new BadRequestException('Only the project client can confirm on-site presence');
    }

    if (project.siteStartedAt) {
      throw new BadRequestException('Project has already been started on site');
    }

    const now = new Date();
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        siteStartedAt: now,
        siteStartConfirmedById: clientUserId,
      },
    });

    return { siteStartedAt: now, previousStage: project.currentStage };
  }
}
