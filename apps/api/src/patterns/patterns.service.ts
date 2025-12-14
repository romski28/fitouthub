import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CORE_SERVICE_PATTERNS } from './patterns.constants';

@Injectable()
export class PatternsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeCore: boolean = false) {
    const dbPatterns = await this.prisma.pattern.findMany({ orderBy: { updatedAt: 'desc' } });
    
    if (!includeCore) {
      return dbPatterns;
    }

    // Combine core and DB patterns, marking them appropriately
    const corePatterns = CORE_SERVICE_PATTERNS.map((p, idx) => ({
      id: `core-service-${idx}`,
      name: p.name,
      pattern: p.pattern,
      matchType: 'contains',
      category: p.category,
      notes: 'Core hardcoded pattern - read only',
      enabled: true,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      mapsTo: (p as any).mapsTo || null,
      _source: 'core' as const,
    }));

    const userPatterns = dbPatterns.map(p => ({
      ...p,
      _source: 'user' as const,
    }));

    // Return core patterns first (marked as immutable), then user patterns
    return [...corePatterns, ...userPatterns];
  }

  create(body: any) {
    const data = {
      name: body.name,
      pattern: body.pattern,
      matchType: body.matchType,
      category: body.category,
      notes: body.notes,
      enabled: body.enabled ?? true,
    };
    return this.prisma.pattern.create({ data });
  }

  update(id: string, body: any) {
    const data = {
      name: body.name,
      pattern: body.pattern,
      matchType: body.matchType,
      category: body.category,
      notes: body.notes,
      enabled: body.enabled,
    };
    return this.prisma.pattern.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.pattern.delete({ where: { id } });
  }
}
