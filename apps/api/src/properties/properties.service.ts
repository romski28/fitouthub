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

  async getProperty(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { accountLinks: true, aliases: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async linkAccount(propertyId: string, personaId: string, role?: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');

    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
      select: { id: true, type: true },
    });
    if (!persona) throw new BadRequestException('Persona not found');

    return this.prisma.propertyAccountLink.upsert({
      where: { propertyId_personaId: { propertyId, personaId } },
      create: { propertyId, personaId, role: role ?? persona.type },
      update: { role: role ?? persona.type },
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
