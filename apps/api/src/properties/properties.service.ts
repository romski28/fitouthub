import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  computeCanonicalKey,
  formatDisplayAddress,
  normalizeBlock,
  normalizeFloor,
  normalizeText,
  normalizeUnit,
} from './address-normalizer';

export interface UpsertPropertyInput {
  unitNumber?: string;
  floorLevel?: string;
  blockTower?: string;
  buildingName: string;
  buildingNameZh?: string;
  street?: string;
  districtAreaId?: string;
  googlePlaceId?: string;
  lat?: number;
  lng?: number;
  addressVisible?: boolean;
}

/** Above this trigram score a different-spelled building is flagged for review. */
const FLAG_THRESHOLD = 0.6;

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listProperties(params: { skip?: number; take?: number; q?: string }) {
    const take = Math.min(params.take ?? 100, 250);
    const skip = params.skip ?? 0;
    const q = params.q?.trim() ?? '';
    const where: any = q
      ? {
          OR: [
            { buildingName: { contains: q, mode: 'insensitive' } },
            { buildingNameZh: { contains: q, mode: 'insensitive' } },
            { displayAddress: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.property.count({ where }),
    ]);

    return { properties, total, skip, take };
  }

  async upsertProperty(input: UpsertPropertyInput) {
    if (!input.buildingName?.trim()) {
      throw new BadRequestException('buildingName is required');
    }

    // Normalised tokens drive matching; original values are stored for display.
    const buildingToken = normalizeText(input.buildingName);
    const blockToken = normalizeBlock(input.blockTower);
    const floorToken = normalizeFloor(input.floorLevel);
    const unitToken = normalizeUnit(input.unitNumber);

    let districtAreaId = input.districtAreaId ?? undefined;
    let zoneId: string | undefined;
    let districtName: string | undefined;
    if (districtAreaId) {
      const area = await this.prisma.regionArea.findUnique({
        where: { id: districtAreaId },
        select: { id: true, name: true, zoneId: true },
      });
      if (!area) throw new BadRequestException('Unknown district area');
      zoneId = area.zoneId;
      districtName = area.name;
    }

    const canonicalKey = computeCanonicalKey({
      buildingName: buildingToken,
      block: blockToken,
      floor: floorToken,
      unit: unitToken,
      districtAreaId,
    });

    const existing = await this.prisma.property.findUnique({ where: { canonicalKey } });
    if (existing) {
      return { property: existing, matched: 'exact', matchCandidates: [] };
    }

    const similar = await this.findSimilar(buildingToken, districtAreaId);

    const property = await this.prisma.property.create({
      data: {
        unitNumber: input.unitNumber?.trim() || null,
        floorLevel: input.floorLevel?.trim() || null,
        blockTower: input.blockTower?.trim() || null,
        buildingName: input.buildingName.trim(),
        buildingNameZh: input.buildingNameZh?.trim() || null,
        street: input.street?.trim() || null,
        districtAreaId: districtAreaId ?? null,
        zoneId: zoneId ?? null,
        googlePlaceId: input.googlePlaceId ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        canonicalKey,
        displayAddress: formatDisplayAddress({
          unit: input.unitNumber,
          floor: input.floorLevel,
          block: input.blockTower,
          buildingName: input.buildingName,
          districtName,
        }),
        addressVisible: input.addressVisible ?? false,
      },
    });

    const matchCandidates: Array<{ id: string; similarity: number; candidatePropertyId: string }> = [];
    for (const c of similar) {
      if (c.similarity < FLAG_THRESHOLD) continue;
      const row = await this.prisma.propertyMatchCandidate.create({
        data: {
          sourcePropertyId: property.id,
          candidatePropertyId: c.id,
          similarity: c.similarity,
          reasons: [`building name similarity ${c.similarity.toFixed(2)}: "${c.buildingName}" vs "${property.buildingName}"`],
          status: 'pending',
        },
      });
      matchCandidates.push({ id: row.id, similarity: row.similarity, candidatePropertyId: row.candidatePropertyId });
    }

    return { property, matched: 'created', matchCandidates };
  }

  async searchProperties(q: string, districtAreaId?: string) {
    const query = normalizeText(q);
    if (!query) return { results: [] };

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        buildingName: string;
        displayAddress: string | null;
        districtAreaId: string | null;
        similarity: number;
      }>
    >`
      SELECT p."id", p."buildingName", p."displayAddress", p."districtAreaId",
             similarity(p."buildingName", ${query}) AS similarity
      FROM "Property" p
      WHERE p."canonicalKey" IS NOT NULL
        AND (${districtAreaId ?? null}::text IS NULL OR p."districtAreaId" = ${districtAreaId ?? null})
        AND (similarity(p."buildingName", ${query}) > 0.2 OR p."buildingName" ILIKE ${'%' + query + '%'})
      ORDER BY similarity DESC, p."buildingName"
      LIMIT 25
    `;

    return {
      results: rows.map((r) => ({ ...r, similarity: Number(r.similarity) })),
    };
  }

  async listDistricts() {
    return this.prisma.regionArea.findMany({
      select: { id: true, code: true, name: true, nameZh: true, zoneId: true, sortOrder: true },
      orderBy: [{ zoneId: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async searchGazetteer(q: string, districtAreaId?: string) {
    const query = normalizeText(q);
    if (!query) return { results: [] };

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        nameEn: string | null;
        nameZh: string | null;
        addressFull: string | null;
        districtAreaId: string | null;
        districtName: string | null;
        buildingType: string | null;
        lat: number | null;
        lng: number | null;
        similarity: number;
      }>
    >`
      SELECT b."id", b."nameEn", b."nameZh", b."addressFull", b."districtAreaId",
             b."districtName", b."buildingType",
             b."lat"::float8 AS lat, b."lng"::float8 AS lng,
             GREATEST(
               similarity(COALESCE(b."nameEn", ''), ${query}),
               similarity(COALESCE(b."addressFull", ''), ${query})
             ) AS similarity
      FROM "BuildingGazetteer" b
      WHERE b."isResidential" = true
        AND (${districtAreaId ?? null}::text IS NULL OR b."districtAreaId" = ${districtAreaId ?? null})
        AND (
          COALESCE(b."nameEn", '') ILIKE ${'%' + query + '%'}
          OR COALESCE(b."addressFull", '') ILIKE ${'%' + query + '%'}
        )
      ORDER BY similarity DESC
      LIMIT 15
    `;

    return {
      results: rows.map((r) => ({ ...r, similarity: Number(r.similarity) })),
    };
  }

  async getProperty(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { accountLinks: true, aliases: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  private personaCardinality(type: string): 'single' | 'multi' | 'none' {
    switch (type) {
      case 'CLIENT':
      case 'OWNER_OCCUPIER':
      case 'PROFESSIONAL':
        return 'single';
      case 'LANDLORD':
      case 'PROPERTY_MANAGER':
      case 'ESTATE_AGENT':
        return 'multi';
      case 'WORKER':
      case 'PROJECT_DELEGATE':
        return 'none';
      default:
        return 'multi';
    }
  }

  async linkAccount(
    propertyId: string,
    personaId: string,
    opts?: { role?: string; setPrimary?: boolean },
  ) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');

    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
      select: { id: true, type: true },
    });
    if (!persona) throw new BadRequestException('Persona not found');

    const cardinality = this.personaCardinality(persona.type);
    if (cardinality === 'none') {
      throw new BadRequestException(`Persona type ${persona.type} cannot be linked to an address`);
    }

    const role = opts?.role ?? persona.type;

    if (cardinality === 'single') {
      // Replace the persona's single address.
      await this.prisma.propertyAccountLink.deleteMany({ where: { personaId } });
      return this.prisma.propertyAccountLink.create({
        data: { propertyId, personaId, role, isPrimary: true },
      });
    }

    const existingCount = await this.prisma.propertyAccountLink.count({ where: { personaId } });
    const makePrimary = opts?.setPrimary || existingCount === 0;
    if (makePrimary) {
      await this.prisma.propertyAccountLink.updateMany({
        where: { personaId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.propertyAccountLink.upsert({
      where: { propertyId_personaId: { propertyId, personaId } },
      create: { propertyId, personaId, role, isPrimary: makePrimary },
      update: { role, ...(makePrimary ? { isPrimary: true } : {}) },
    });
  }

  async listMyProperties(personaId: string) {
    const links = await this.prisma.propertyAccountLink.findMany({
      where: { personaId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      include: { property: true },
    });
    return {
      properties: links.map((l) => ({
        ...l.property,
        linkId: l.id,
        linkRole: l.role,
        isPrimary: l.isPrimary,
      })),
    };
  }

  async unlinkAccount(personaId: string, propertyId: string) {
    const link = await this.prisma.propertyAccountLink.findUnique({
      where: { propertyId_personaId: { propertyId, personaId } },
    });
    if (!link) throw new NotFoundException('Address link not found');

    await this.prisma.propertyAccountLink.delete({ where: { id: link.id } });

    if (link.isPrimary) {
      const next = await this.prisma.propertyAccountLink.findFirst({
        where: { personaId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.propertyAccountLink.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
    return { success: true };
  }

  async setPrimaryAccount(personaId: string, propertyId: string) {
    const link = await this.prisma.propertyAccountLink.findUnique({
      where: { propertyId_personaId: { propertyId, personaId } },
    });
    if (!link) throw new NotFoundException('Address link not found');

    await this.prisma.propertyAccountLink.updateMany({
      where: { personaId, isPrimary: true },
      data: { isPrimary: false },
    });
    return this.prisma.propertyAccountLink.update({
      where: { id: link.id },
      data: { isPrimary: true },
    });
  }

  async listMatchCandidates(status?: string) {
    return this.prisma.propertyMatchCandidate.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        sourceProperty: { select: { id: true, buildingName: true, displayAddress: true } },
        candidateProperty: { select: { id: true, buildingName: true, displayAddress: true } },
      },
      take: 100,
    });
  }

  async resolveMatchCandidate(id: string, action: 'merge' | 'dismiss', actorId: string) {
    const candidate = await this.prisma.propertyMatchCandidate.findUnique({
      where: { id },
      include: { sourceProperty: true, candidateProperty: true },
    });
    if (!candidate) throw new NotFoundException('Match candidate not found');
    if (candidate.status !== 'pending') throw new BadRequestException('Candidate already resolved');

    if (action === 'merge') {
      // Keep source canonical; demote the candidate and record its name as an alias.
      await this.prisma.propertyAlias
        .create({
          data: {
            propertyId: candidate.sourcePropertyId,
            alias: candidate.candidateProperty.buildingName,
            aliasNormalized: normalizeText(candidate.candidateProperty.buildingName),
          },
        })
        .catch(() => {});
      await this.prisma.property.update({
        where: { id: candidate.candidatePropertyId },
        data: { canonicalKey: null },
      });
    }

    return this.prisma.propertyMatchCandidate.update({
      where: { id },
      data: {
        status: action === 'merge' ? 'merged' : 'dismissed',
        resolvedBy: actorId,
        resolvedAt: new Date(),
      },
    });
  }

  private async findSimilar(buildingToken: string, districtAreaId?: string) {
    if (!buildingToken) return [];
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; buildingName: string; similarity: number }>
    >`
      SELECT p."id", p."buildingName", similarity(p."buildingName", ${buildingToken}) AS similarity
      FROM "Property" p
      WHERE p."canonicalKey" IS NOT NULL
        AND (${districtAreaId ?? null}::text IS NULL OR p."districtAreaId" = ${districtAreaId ?? null})
        AND similarity(p."buildingName", ${buildingToken}) >= 0.35
      ORDER BY similarity DESC
      LIMIT 10
    `;
    return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  }
}
