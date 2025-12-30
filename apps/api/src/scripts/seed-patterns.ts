import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPatterns() {
  console.log('🌱 Seeding patterns...');

  const patterns = [
    // Service patterns
    {
      name: 'Plumbing Services',
      pattern: 'plumb',
      matchType: 'contains',
      category: 'service',
      notes: 'Matches plumbing, plumber, etc.',
      enabled: true,
    },
    {
      name: 'Electrical Services',
      pattern: 'electric|elec',
      matchType: 'regex',
      category: 'service',
      notes: 'Matches electrical, electrician, etc.',
      enabled: true,
    },
    {
      name: 'Carpentry Services',
      pattern: 'carp',
      matchType: 'contains',
      category: 'service',
      notes: 'Matches carpentry, carpenter, etc.',
      enabled: true,
    },
    {
      name: 'Painting Services',
      pattern: 'paint',
      matchType: 'contains',
      category: 'service',
      notes: 'Matches painting, painter, etc.',
      enabled: true,
    },
    {
      name: 'HVAC Services',
      pattern: 'hvac|heating|cooling|air con',
      matchType: 'regex',
      category: 'service',
      notes: 'Matches HVAC, air conditioning, heating, etc.',
      enabled: true,
    },
    {
      name: 'Tiling Services',
      pattern: 'tile|tiling',
      matchType: 'regex',
      category: 'service',
      notes: 'Matches tiling, tile work, etc.',
      enabled: true,
    },
    {
      name: 'Flooring Services',
      pattern: 'floor',
      matchType: 'contains',
      category: 'service',
      notes: 'Matches flooring, laminate, parquet, etc.',
      enabled: true,
    },
    {
      name: 'Masonry Services',
      pattern: 'mason|brick|concrete',
      matchType: 'regex',
      category: 'service',
      notes: 'Matches masonry, brickwork, concrete, etc.',
      enabled: true,
    },

    // Trade patterns
    {
      name: 'Plumber Trade',
      pattern: 'Plumber',
      matchType: 'equals',
      category: 'trade',
      notes: 'Primary trade: Plumber',
      enabled: true,
    },
    {
      name: 'Electrician Trade',
      pattern: 'Electrician',
      matchType: 'equals',
      category: 'trade',
      notes: 'Primary trade: Electrician',
      enabled: true,
    },
    {
      name: 'Carpenter Trade',
      pattern: 'Carpenter',
      matchType: 'equals',
      category: 'trade',
      notes: 'Primary trade: Carpenter',
      enabled: true,
    },
    {
      name: 'Painter Trade',
      pattern: 'Painter',
      matchType: 'equals',
      category: 'trade',
      notes: 'Primary trade: Painter',
      enabled: true,
    },
    {
      name: 'Tiler Trade',
      pattern: 'Tiler',
      matchType: 'equals',
      category: 'trade',
      notes: 'Primary trade: Tiler',
      enabled: true,
    },

    // Location patterns - Hong Kong
    {
      name: 'Hong Kong Island',
      pattern: 'HK Island|Central|Causeway|Admiralty|Wan Chai|Island',
      matchType: 'regex',
      category: 'location',
      notes: 'HK Island districts',
      enabled: true,
    },
    {
      name: 'Kowloon',
      pattern: 'Kowloon|Yau Tsim|Mong Kok|Tsim Sha Tsui|Jordan',
      matchType: 'regex',
      category: 'location',
      notes: 'Kowloon districts',
      enabled: true,
    },
    {
      name: 'New Territories',
      pattern: 'New Territories|Shatin|Tai Po|Yuen Long|Kwai Tsing',
      matchType: 'regex',
      category: 'location',
      notes: 'NT districts',
      enabled: true,
    },
    {
      name: 'Central',
      pattern: 'Central',
      matchType: 'equals',
      category: 'location',
      notes: 'Central district',
      enabled: true,
    },
    {
      name: 'Sheung Wan',
      pattern: 'Sheung Wan',
      matchType: 'equals',
      category: 'location',
      notes: 'Sheung Wan district',
      enabled: true,
    },

    // Supply patterns
    {
      name: 'Building Materials',
      pattern: 'Building Materials',
      matchType: 'equals',
      category: 'supply',
      notes: 'Supplies: Building materials',
      enabled: true,
    },
    {
      name: 'Tiles & Flooring',
      pattern: 'Tiles',
      matchType: 'contains',
      category: 'supply',
      notes: 'Supplies: Tiles, flooring products',
      enabled: true,
    },
    {
      name: 'Fixtures & Fittings',
      pattern: 'Fixtures',
      matchType: 'contains',
      category: 'supply',
      notes: 'Supplies: Fixtures, fittings, hardware',
      enabled: true,
    },
    {
      name: 'Paint & Finishes',
      pattern: 'Paint',
      matchType: 'contains',
      category: 'supply',
      notes: 'Supplies: Paint, varnish, finishes',
      enabled: true,
    },

    // Intent patterns
    {
      name: 'Renovation Intent',
      pattern: 'renovate|renovation|refurbish|remodel',
      matchType: 'regex',
      category: 'intent',
      notes: 'Search intent: Major renovation work',
      enabled: true,
    },
    {
      name: 'Repair Intent',
      pattern: 'repair|fix|replace',
      matchType: 'regex',
      category: 'intent',
      notes: 'Search intent: Repair or fix work',
      enabled: true,
    },
    {
      name: 'Upgrade Intent',
      pattern: 'upgrade|improve|enhance|install',
      matchType: 'regex',
      category: 'intent',
      notes: 'Search intent: Upgrade or improvement',
      enabled: true,
    },
    {
      name: 'Maintenance Intent',
      pattern: 'maintain|maintenance|service|clean',
      matchType: 'regex',
      category: 'intent',
      notes: 'Search intent: Maintenance or cleaning',
      enabled: true,
    },
  ];

  for (const pattern of patterns) {
    try {
      const result = await prisma.pattern.upsert({
        where: {
          id: `${pattern.category}-${pattern.name}`
            .toLowerCase()
            .replace(/\s+/g, '-'),
        },
        update: pattern,
        create: {
          ...pattern,
          id: `${pattern.category}-${pattern.name}`
            .toLowerCase()
            .replace(/\s+/g, '-'),
        },
      });
      console.log(`✓ Seeded: ${result.name}`);
    } catch (error) {
      console.log(`✓ Already exists: ${pattern.name}`);
    }
  }

  console.log('✅ Pattern seeding complete!');
}

seedPatterns()
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
