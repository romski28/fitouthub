import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

interface TradeTranslationView {
  locale: string;
  name: string;
  description?: string | null;
  aliases: string[];
  jobs: string[];
}

// In-memory cache for trades and mappings
export interface TradeView {
  id: string;
  name: string;
  locale: string;
  category: string;
  professionType?: string | null;
  aliases: string[];
  jobs: string[];
  description?: string | null;
  enabled: boolean;
  featured: boolean;
  sortOrder: number;
  usageCount: number;
  serviceMappings?: { keyword: string }[];
  translations?: TradeTranslationView[];
}

interface TradesCache {
  trades: TradeView[];
  mappings: Map<string, string>;
  lastUpdated: number;
}

@Injectable()
export class TradesService {
  private cache: TradesCache | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly DEFAULT_LOCALE = 'en';

  private readonly ZH_HK_TITLE_DRAFTS: Record<string, string> = {
    electrician: '電工',
    plumber: '水喉工',
    carpenter: '木工',
    painter: '油漆師傅',
    tiler: '鋪磚師傅',
    builder: '裝修工程承建',
    contractor: '承建商',
    architect: '建築師',
    designer: '設計師',
    locksmith: '開鎖師傅',
    handyman: '雜工師傅',
    roofer: '屋頂防水師傅',
    mason: '泥水師傅',
    welder: '焊接師傅',
    glazier: '玻璃師傅',
    flooring: '地板師傅',
    cleaner: '清潔服務',
    moving: '搬運服務',
    aircon: '冷氣師傅',
    hvac: '冷暖通風工程',
  };

  constructor(private prisma: PrismaService) {
    // Cache will be loaded lazily on first use, not during bootstrap
    // This prevents eager DB queries before PrismaService is ready
  }

  private normalizeLocale(locale?: string | null) {
    if (!locale || typeof locale !== 'string') return this.DEFAULT_LOCALE;
    return locale.trim().replace('_', '-').toLowerCase() || this.DEFAULT_LOCALE;
  }

  private pickTranslation(
    trade: any,
    locale?: string,
    includeTranslations = false,
  ): TradeView {
    const normalizedLocale = this.normalizeLocale(locale);
    const translations = Array.isArray(trade.translations) ? trade.translations : [];
    const localized =
      translations.find((t: any) => this.normalizeLocale(t.locale) === normalizedLocale) ||
      translations.find((t: any) => this.normalizeLocale(t.locale) === this.DEFAULT_LOCALE) ||
      null;

    return {
      id: trade.id,
      name: localized?.title || trade.title,
      locale: normalizedLocale,
      category: trade.category,
      professionType: trade.professionType,
      aliases: localized?.aliases ?? trade.aliases ?? [],
      jobs: localized?.jobs ?? trade.jobs ?? [],
      description: localized?.description ?? trade.description,
      enabled: trade.enabled ?? true,
      featured: trade.featured ?? false,
      sortOrder: trade.sortOrder ?? 999,
      usageCount: trade.usageCount ?? 0,
      serviceMappings: trade.serviceMappings,
      ...(includeTranslations
        ? {
            translations: translations.map((t: any) => ({
              locale: this.normalizeLocale(t.locale),
              name: t.title,
              description: t.description,
              aliases: t.aliases ?? [],
              jobs: t.jobs ?? [],
            })),
          }
        : {}),
    };
  }

  private async refreshCache() {
    try {
      const [tradesmen, mappings] = await Promise.all([
        this.prisma.tradesman.findMany({
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
          include: {
            serviceMappings: {
              where: { enabled: true },
              select: { keyword: true },
            },
            translations: {
              where: { locale: this.DEFAULT_LOCALE },
              select: {
                locale: true,
                title: true,
                description: true,
                aliases: true,
                jobs: true,
              },
            },
          },
        }),
        this.prisma.serviceMapping.findMany({
          where: { enabled: true },
          include: {
            trade: {
              select: { title: true, professionType: true },
            },
          },
        }),
      ]);

      const mappingsMap = new Map<string, string>();
      for (const mapping of mappings) {
        mappingsMap.set(
          mapping.keyword.toLowerCase(),
          mapping.trade.professionType || mapping.trade.title,
        );
      }

      this.cache = {
        trades: tradesmen.map((t) => this.pickTranslation(t, this.DEFAULT_LOCALE)),
        mappings: mappingsMap,
        lastUpdated: Date.now(),
      };

      console.log('[TradesService] Cache refreshed:', {
        trades: this.cache.trades.length,
        mappings: mappingsMap.size,
      });
    } catch (error) {
      // Fallback for schema mismatch (columns or relations not present yet)
      console.warn(
        '[TradesService] Primary query failed, attempting fallback without relations/order:',
        error?.message,
      );
      try {
        const tradesmen = await this.prisma.tradesman.findMany({
          // Some DBs may not have 'enabled' or 'sortOrder' yet
          orderBy: [{ title: 'asc' }],
        });
        let mappingsMap = new Map<string, string>();
        try {
          const mappings = await this.prisma.serviceMapping.findMany({
            include: {
              trade: {
                select: { title: true, professionType: true },
              },
            },
          });
          mappingsMap = new Map(
            mappings.map((m) => [
              m.keyword.toLowerCase(),
              m.trade.professionType || m.trade.title,
            ]),
          );
        } catch (inner) {
          console.warn(
            '[TradesService] Mappings query failed, continuing without mappings:',
            inner?.message,
          );
        }
        this.cache = {
          trades: tradesmen.map((t) => this.pickTranslation(t, this.DEFAULT_LOCALE)),
          mappings: mappingsMap,
          lastUpdated: Date.now(),
        };
      } catch (fallbackErr) {
        console.warn(
          '[TradesService] Fallback also failed - using empty cache:',
          fallbackErr?.message,
        );
        this.cache = {
          trades: [],
          mappings: new Map(),
          lastUpdated: Date.now(),
        };
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
    return this.findAllByLocale(this.DEFAULT_LOCALE);
  }

  async findAllByLocale(locale?: string) {
    const normalizedLocale = this.normalizeLocale(locale);
    if (normalizedLocale === this.DEFAULT_LOCALE) {
      const cache = await this.getCache();
      return cache.trades;
    }

    try {
      const trades = await this.prisma.tradesman.findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        include: {
          serviceMappings: {
            where: { enabled: true },
            select: { keyword: true },
          },
          translations: {
            where: {
              locale: {
                in: [normalizedLocale, this.DEFAULT_LOCALE],
              },
            },
            select: {
              locale: true,
              title: true,
              description: true,
              aliases: true,
              jobs: true,
            },
          },
        },
      });

      return trades.map((trade) => this.pickTranslation(trade, normalizedLocale));
    } catch {
      const cache = await this.getCache();
      return cache.trades;
    }
  }

  async findByIdWithLocale(id: string, locale?: string, includeTranslations = false) {
    const normalizedLocale = this.normalizeLocale(locale);

    const translationWhere = includeTranslations
      ? undefined
      : {
          locale: {
            in: [normalizedLocale, this.DEFAULT_LOCALE],
          },
        };

    const trade = await this.prisma.tradesman.findUnique({
      where: { id },
      include: {
        serviceMappings: {
          orderBy: { keyword: 'asc' },
        },
        translations: {
          ...(translationWhere ? { where: translationWhere } : {}),
          orderBy: { locale: 'asc' },
        },
      },
    });

    return trade ? this.pickTranslation(trade, normalizedLocale, includeTranslations) : null;
  }

  async findById(id: string) {
    return this.findByIdWithLocale(id, this.DEFAULT_LOCALE, true);
  }

  async listTranslations(id: string) {
    try {
      const rows = await (this.prisma as any).tradesmanTranslation.findMany({
        where: { tradeId: id },
        orderBy: { locale: 'asc' },
      });

      return rows.map((row: any) => ({
        locale: this.normalizeLocale(row.locale),
        name: row.title,
        description: row.description,
        aliases: row.aliases ?? [],
        jobs: row.jobs ?? [],
      }));
    } catch {
      return [];
    }
  }

  async upsertTranslation(
    id: string,
    locale: string,
    data: {
      name?: string;
      description?: string | null;
      aliases?: string[];
      jobs?: string[];
    },
  ) {
    const normalizedLocale = this.normalizeLocale(locale);

    const title = (data.name || '').trim();
    if (!title) {
      throw new Error('Translation name is required');
    }

    const payload = {
      locale: normalizedLocale,
      title,
      description: data.description ?? null,
      aliases: data.aliases ?? [],
      jobs: data.jobs ?? [],
    };

    try {
      await (this.prisma as any).tradesmanTranslation.upsert({
        where: {
          tradeId_locale: {
            tradeId: id,
            locale: normalizedLocale,
          },
        },
        create: {
          tradeId: id,
          ...payload,
        },
        update: payload,
      });

      if (normalizedLocale === this.DEFAULT_LOCALE) {
        await this.prisma.tradesman.update({
          where: { id },
          data: {
            title: title,
            description: data.description ?? null,
            aliases: data.aliases ?? [],
            jobs: data.jobs ?? [],
          },
        });
      }

      await this.refreshCache();
      return this.findByIdWithLocale(id, normalizedLocale, true);
    } catch (error) {
      if (normalizedLocale === this.DEFAULT_LOCALE) {
        const fallback = await this.prisma.tradesman.update({
          where: { id },
          data: {
            title: title,
            description: data.description ?? null,
            aliases: data.aliases ?? [],
            jobs: data.jobs ?? [],
          },
        });
        await this.refreshCache();
        return this.pickTranslation(fallback, normalizedLocale, false);
      }
      throw error;
    }
  }

  async seedDraftTranslations(locale?: string, overwrite = false) {
    const normalizedLocale = this.normalizeLocale(locale || 'zh-hk');
    const trades = await this.prisma.tradesman.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        aliases: true,
        jobs: true,
      },
    });

    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (const trade of trades) {
      const translatedTitle =
        this.ZH_HK_TITLE_DRAFTS[trade.title.trim().toLowerCase()] || trade.title;
      const translatedAliases = (trade.aliases ?? []).map((alias) =>
        this.ZH_HK_TITLE_DRAFTS[alias.trim().toLowerCase()] || alias,
      );

      try {
        const existing = await (this.prisma as any).tradesmanTranslation.findUnique({
          where: {
            tradeId_locale: {
              tradeId: trade.id,
              locale: normalizedLocale,
            },
          },
        });

        if (existing && !overwrite) {
          skipped += 1;
          continue;
        }

        await (this.prisma as any).tradesmanTranslation.upsert({
          where: {
            tradeId_locale: {
              tradeId: trade.id,
              locale: normalizedLocale,
            },
          },
          create: {
            tradeId: trade.id,
            locale: normalizedLocale,
            title: translatedTitle,
            description: trade.description,
            aliases: translatedAliases,
            jobs: trade.jobs ?? [],
          },
          update: {
            title: translatedTitle,
            description: trade.description,
            aliases: translatedAliases,
            jobs: trade.jobs ?? [],
          },
        });

        if (existing) {
          updated += 1;
        } else {
          created += 1;
        }
      } catch {
        skipped += 1;
      }
    }

    await this.refreshCache();
    return {
      locale: normalizedLocale,
      created,
      updated,
      skipped,
      total: trades.length,
    };
  }

  async create(data: {
    name: string;
    category: string;
    professionType?: string;
    aliases?: string[];
    jobs?: string[];
    description?: string;
    featured?: boolean;
    sortOrder?: number;
    enabled?: boolean;
  }) {
    const trade = await this.prisma.tradesman.create({
      data: {
        title: data.name,
        category: data.category,
        professionType: data.professionType,
        aliases: data.aliases ?? [],
        jobs: data.jobs ?? [],
        description: data.description,
        featured: data.featured ?? false,
        sortOrder: data.sortOrder ?? 999,
        enabled: data.enabled ?? true,
      },
    });

    try {
      await (this.prisma as any).tradesmanTranslation.create({
        data: {
          tradeId: trade.id,
          locale: this.DEFAULT_LOCALE,
          title: data.name,
          description: data.description,
          aliases: data.aliases ?? [],
          jobs: data.jobs ?? [],
        },
      });
    } catch {
      // Ignore if translation table is not migrated yet
    }

    await this.refreshCache();
    return this.pickTranslation(trade, this.DEFAULT_LOCALE, false);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      category: string;
      professionType: string;
      aliases: string[];
      jobs: string[];
      description: string;
      enabled: boolean;
      featured: boolean;
      sortOrder: number;
    }>,
  ) {
    const trade = await this.prisma.tradesman.update({
      where: { id },
      data: {
        ...(data.name ? { title: data.name } : {}),
        ...(data.category ? { category: data.category } : {}),
        ...(data.professionType !== undefined
          ? { professionType: data.professionType }
          : {}),
        ...(data.aliases ? { aliases: data.aliases } : {}),
        ...(data.jobs ? { jobs: data.jobs } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.featured !== undefined ? { featured: data.featured } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });

    try {
      const hasTranslationPayload =
        data.name !== undefined ||
        data.description !== undefined ||
        data.aliases !== undefined ||
        data.jobs !== undefined;

      if (hasTranslationPayload) {
        await (this.prisma as any).tradesmanTranslation.upsert({
          where: {
            tradeId_locale: {
              tradeId: id,
              locale: this.DEFAULT_LOCALE,
            },
          },
          create: {
            tradeId: id,
            locale: this.DEFAULT_LOCALE,
            title: data.name || trade.title,
            description: data.description ?? trade.description,
            aliases: data.aliases ?? trade.aliases ?? [],
            jobs: data.jobs ?? trade.jobs ?? [],
          },
          update: {
            title: data.name || trade.title,
            description: data.description ?? trade.description,
            aliases: data.aliases ?? trade.aliases ?? [],
            jobs: data.jobs ?? trade.jobs ?? [],
          },
        });
      }
    } catch {
      // Ignore if translation table is not migrated yet
    }

    await this.refreshCache();
    return this.pickTranslation(trade, this.DEFAULT_LOCALE, false);
  }

  async delete(id: string) {
    await this.prisma.tradesman.delete({ where: { id } });
    await this.refreshCache();
    return { success: true };
  }

  async incrementUsage(id: string) {
    await this.prisma.tradesman.update({
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

  async updateMapping(
    id: string,
    data: Partial<{
      keyword: string;
      tradeId: string;
      confidence: number;
      enabled: boolean;
    }>,
  ) {
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
      if (
        normalized.includes(mappingKeyword) ||
        mappingKeyword.includes(normalized)
      ) {
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

  private toView(trade: any): TradeView {
    return this.pickTranslation(trade, this.DEFAULT_LOCALE, false);
  }
}
