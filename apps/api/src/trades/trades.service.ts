import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// In-memory cache for trades and mappings
interface TradesCache {
  trades: any[];
  mappings: Map<string, string>;
  lastUpdated: number;
}

@Injectable()
export class TradesService {
  private cache: TradesCache | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private prisma: PrismaService) {
    // Pre-load cache on startup (with error handling for missing tables)
    this.refreshCache().catch((err) => {
      console.warn('[TradesService] Failed to load cache on startup (tables may not exist yet):', err.message);
      // Set empty cache so service doesn't crash
      this.cache = {
        trades: [],
        mappings: new Map(),
        lastUpdated: Date.now(),
      };
    });
  }

  private async refreshCache() {
    try {
      const [trades, mappings] = await Promise.all([
        this.prisma.trade.findMany({
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            serviceMappings: {
              where: { enabled: true },
              select: { keyword: true },
            },
          },
        }),
        this.prisma.serviceMapping.findMany({
          where: { enabled: true },
          include: {
            trade: {
              select: { name: true, professionType: true },
            },
          },
        }),
      ]);

      const mappingsMap = new Map<string, string>();
      for (const mapping of mappings) {
        mappingsMap.set(mapping.keyword.toLowerCase(), mapping.trade.professionType || mapping.trade.name);
      }

      this.cache = {
        trades,
        mappings: mappingsMap,
        lastUpdated: Date.now(),
      };

      console.log('[TradesService] Cache refreshed:', {
        trades: trades.length,
        mappings: mappingsMap.size,
      });
    } catch (error) {
      // If tables don't exist yet (during initial deploy), log warning and use empty cache
      if (error?.code === 'P2021') {
        console.warn('[TradesService] Trade tables not found - run migrations first');
        this.cache = {
          trades: [],
          mappings: new Map(),
          lastUpdated: Date.now(),
        };
      } else {
        throw error;
      }
    }
  }

  private async getCache(): Promise<TradesCache> {
    if (!this.cache || Date.now() - this.cache.lastUpdated > this.CACHE_TTL) {
      await this.refreshCache();
    }
    return this.cache!;
  }

  async findAll() {
    const cache = await this.getCache();
    return cache.trades;
  }

  async findById(id: string) {
    return this.prisma.trade.findUnique({
      where: { id },
      include: {
        serviceMappings: {
          orderBy: { keyword: 'asc' },
        },
      },
    });
  }

  async create(data: {
    name: string;
    category: string;
    professionType?: string;
    aliases?: string[];
    description?: string;
    featured?: boolean;
    sortOrder?: number;
  }) {
    const trade = await this.prisma.trade.create({
      data,
    });
    await this.refreshCache();
    return trade;
  }

  async update(id: string, data: Partial<{
    name: string;
    category: string;
    professionType: string;
    aliases: string[];
    description: string;
    enabled: boolean;
    featured: boolean;
    sortOrder: number;
  }>) {
    const trade = await this.prisma.trade.update({
      where: { id },
      data,
    });
    await this.refreshCache();
    return trade;
  }

  async delete(id: string) {
    await this.prisma.trade.delete({ where: { id } });
    await this.refreshCache();
    return { success: true };
  }

  async incrementUsage(id: string) {
    await this.prisma.trade.update({
      where: { id },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });
  }

  // Service mappings
  async createMapping(data: {
    keyword: string;
    tradeId: string;
    confidence?: number;
  }) {
    const mapping = await this.prisma.serviceMapping.create({
      data,
    });
    await this.refreshCache();
    return mapping;
  }

  async updateMapping(id: string, data: Partial<{
    keyword: string;
    tradeId: string;
    confidence: number;
    enabled: boolean;
  }>) {
    const mapping = await this.prisma.serviceMapping.update({
      where: { id },
      data,
    });
    await this.refreshCache();
    return mapping;
  }

  async deleteMapping(id: string) {
    await this.prisma.serviceMapping.delete({ where: { id } });
    await this.refreshCache();
    return { success: true };
  }

  // Lookup service by keyword (cached)
  async matchService(keyword: string): Promise<string | null> {
    const cache = await this.getCache();
    const normalized = keyword.toLowerCase().trim();
    
    // Direct match
    if (cache.mappings.has(normalized)) {
      return cache.mappings.get(normalized)!;
    }

    // Partial match (find if keyword contains any mapping keyword)
    for (const [mappingKeyword, professionType] of cache.mappings.entries()) {
      if (normalized.includes(mappingKeyword) || mappingKeyword.includes(normalized)) {
        return professionType;
      }
    }

    return null;
  }

  // For migration: return mappings as Record for backward compatibility
  async getLegacyMappings(): Promise<Record<string, string>> {
    const cache = await this.getCache();
    const result: Record<string, string> = {};
    cache.mappings.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
