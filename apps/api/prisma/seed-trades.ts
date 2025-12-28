import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Trade definitions derived from existing SERVICE_TO_PROFESSION
const trades = [
  {
    name: 'Plumber',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['Plumbing', 'Drainage Specialist'],
    description: 'Plumbing, water systems, drainage, and bathroom fittings',
    featured: true,
    sortOrder: 1,
  },
  {
    name: 'Electrician',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['Electrical', 'Sparky'],
    description: 'Electrical work, wiring, lighting, and power systems',
    featured: true,
    sortOrder: 2,
  },
  {
    name: 'Carpenter',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['Woodworker', 'Joiner'],
    description: 'Carpentry, joinery, custom woodwork, and furniture',
    featured: true,
    sortOrder: 3,
  },
  {
    name: 'Painter',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['Decorator', 'Painting'],
    description: 'Painting, decorating, and wall finishing',
    featured: true,
    sortOrder: 4,
  },
  {
    name: 'Tiler',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['Tiling Specialist'],
    description: 'Tile installation, grouting, and flooring',
    featured: false,
    sortOrder: 5,
  },
  {
    name: 'Mason',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['Bricklayer', 'Masonry'],
    description: 'Brickwork, stonework, and concrete',
    featured: false,
    sortOrder: 6,
  },
  {
    name: 'Builder',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['General Builder', 'Construction', 'Renovator'],
    description: 'General building, renovation, and construction',
    featured: true,
    sortOrder: 7,
  },
  {
    name: 'Architect',
    category: 'company',
    professionType: 'company',
    aliases: ['Architectural Design', 'Designer'],
    description: 'Architectural design, space planning, and building design',
    featured: false,
    sortOrder: 8,
  },
  {
    name: 'HVAC Technician',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['AC Technician', 'Aircon', 'Climate Control'],
    description: 'Air conditioning, heating, and ventilation systems',
    featured: false,
    sortOrder: 9,
  },
  {
    name: 'Glazier',
    category: 'contractor',
    professionType: 'contractor',
    aliases: ['Glass Fitter', 'Window Specialist'],
    description: 'Window installation, glass work, and glazing',
    featured: false,
    sortOrder: 10,
  },
];

// Service mappings derived from existing SERVICE_TO_PROFESSION
const serviceMappings = [
  // Plumbing
  { keyword: 'leaky pipe', tradeName: 'Plumber' },
  { keyword: 'leaking pipe', tradeName: 'Plumber' },
  { keyword: 'burst pipe', tradeName: 'Plumber' },
  { keyword: 'water pipe', tradeName: 'Plumber' },
  { keyword: 'toilet repair', tradeName: 'Plumber' },
  { keyword: 'blocked drain', tradeName: 'Plumber' },
  { keyword: 'drainage', tradeName: 'Plumber' },
  { keyword: 'bathroom fitting', tradeName: 'Plumber' },
  { keyword: 'hot water', tradeName: 'Plumber' },
  { keyword: 'boiler', tradeName: 'Plumber' },
  { keyword: 'sink repair', tradeName: 'Plumber' },
  { keyword: 'taps', tradeName: 'Plumber' },
  { keyword: 'faucet', tradeName: 'Plumber' },

  // Electrical
  { keyword: 'electrical work', tradeName: 'Electrician' },
  { keyword: 'wiring', tradeName: 'Electrician' },
  { keyword: 'light installation', tradeName: 'Electrician' },
  { keyword: 'socket installation', tradeName: 'Electrician' },
  { keyword: 'circuit breaker', tradeName: 'Electrician' },
  { keyword: 'electrical fault', tradeName: 'Electrician' },
  { keyword: 'power outage', tradeName: 'Electrician' },
  { keyword: 'rewiring', tradeName: 'Electrician' },
  { keyword: 'lighting', tradeName: 'Electrician' },
  { keyword: 'electrics', tradeName: 'Electrician' },
  { keyword: 'light not working', tradeName: 'Electrician' },
  { keyword: 'lights not working', tradeName: 'Electrician' },
  { keyword: 'bulb replacement', tradeName: 'Electrician' },
  { keyword: 'replace bulb', tradeName: 'Electrician' },
  { keyword: 'lamp repair', tradeName: 'Electrician' },
  { keyword: 'short circuit', tradeName: 'Electrician' },
  { keyword: 'tripping power', tradeName: 'Electrician' },
  { keyword: 'fuse blown', tradeName: 'Electrician' },
  { keyword: 'breaker tripped', tradeName: 'Electrician' },
  { keyword: 'distribution panel', tradeName: 'Electrician' },
  { keyword: 'electrical panel', tradeName: 'Electrician' },
  { keyword: 'dimmer switch', tradeName: 'Electrician' },
  { keyword: 'install dimmer', tradeName: 'Electrician' },
  { keyword: 'led light', tradeName: 'Electrician' },
  { keyword: 'ceiling light', tradeName: 'Electrician' },
  { keyword: 'downlight', tradeName: 'Electrician' },
  { keyword: 'spotlight', tradeName: 'Electrician' },
  { keyword: 'track lighting', tradeName: 'Electrician' },
  { keyword: 'socket repair', tradeName: 'Electrician' },
  { keyword: 'switch repair', tradeName: 'Electrician' },
  { keyword: 'plug point', tradeName: 'Electrician' },
  { keyword: 'power socket', tradeName: 'Electrician' },

  // Carpentry
  { keyword: 'carpentry', tradeName: 'Carpenter' },
  { keyword: 'wooden door', tradeName: 'Carpenter' },
  { keyword: 'cabinet', tradeName: 'Carpenter' },
  { keyword: 'shelving', tradeName: 'Carpenter' },
  { keyword: 'desk building', tradeName: 'Carpenter' },
  { keyword: 'wood repair', tradeName: 'Carpenter' },
  { keyword: 'wardrobe', tradeName: 'Carpenter' },
  { keyword: 'custom woodwork', tradeName: 'Carpenter' },
  { keyword: 'timber work', tradeName: 'Carpenter' },
  { keyword: 'joinery', tradeName: 'Carpenter' },

  // Painting
  { keyword: 'paint wall', tradeName: 'Painter' },
  { keyword: 'painting', tradeName: 'Painter' },
  { keyword: 'wall paint', tradeName: 'Painter' },
  { keyword: 'interior paint', tradeName: 'Painter' },
  { keyword: 'exterior paint', tradeName: 'Painter' },
  { keyword: 'repainting', tradeName: 'Painter' },
  { keyword: 'wall decoration', tradeName: 'Painter' },
  { keyword: 'decorating', tradeName: 'Painter' },
  { keyword: 'wallpaper', tradeName: 'Painter' },
  { keyword: 'paint job', tradeName: 'Painter' },

  // Tiling
  { keyword: 'tile installation', tradeName: 'Tiler' },
  { keyword: 'tiling', tradeName: 'Tiler' },
  { keyword: 'floor tile', tradeName: 'Tiler' },
  { keyword: 'wall tile', tradeName: 'Tiler' },
  { keyword: 'bathroom tile', tradeName: 'Tiler' },
  { keyword: 'kitchen tile', tradeName: 'Tiler' },
  { keyword: 'grout', tradeName: 'Tiler' },
  { keyword: 'mosaic', tradeName: 'Tiler' },
  { keyword: 'marble', tradeName: 'Tiler' },

  // Masonry
  { keyword: 'brick work', tradeName: 'Mason' },
  { keyword: 'masonry', tradeName: 'Mason' },
  { keyword: 'concrete', tradeName: 'Mason' },
  { keyword: 'brickwork', tradeName: 'Mason' },
  { keyword: 'stone work', tradeName: 'Mason' },
  { keyword: 'wall construction', tradeName: 'Mason' },
  { keyword: 'foundation', tradeName: 'Mason' },
  { keyword: 'concrete floor', tradeName: 'Mason' },
  { keyword: 'retaining wall', tradeName: 'Mason' },

  // Building/Renovation
  { keyword: 'renovation', tradeName: 'Builder' },
  { keyword: 'fitout', tradeName: 'Builder' },
  { keyword: 'construction', tradeName: 'Builder' },
  { keyword: 'building work', tradeName: 'Builder' },
  { keyword: 'structural work', tradeName: 'Builder' },
  { keyword: 'extension', tradeName: 'Builder' },
  { keyword: 'new build', tradeName: 'Builder' },
  { keyword: 'refurbishment', tradeName: 'Builder' },
  { keyword: 'major works', tradeName: 'Builder' },

  // Architecture
  { keyword: 'architectural design', tradeName: 'Architect' },
  { keyword: 'building design', tradeName: 'Architect' },
  { keyword: 'space planning', tradeName: 'Architect' },
  { keyword: 'floor plan', tradeName: 'Architect' },
  { keyword: 'design consultation', tradeName: 'Architect' },
  { keyword: 'interior design', tradeName: 'Architect' },

  // HVAC
  { keyword: 'air conditioning', tradeName: 'HVAC Technician' },
  { keyword: 'ac repair', tradeName: 'HVAC Technician' },
  { keyword: 'heating', tradeName: 'HVAC Technician' },
  { keyword: 'ventilation', tradeName: 'HVAC Technician' },
  { keyword: 'climate control', tradeName: 'HVAC Technician' },
  { keyword: 'thermostat', tradeName: 'HVAC Technician' },

  // Glazing
  { keyword: 'window', tradeName: 'Glazier' },
  { keyword: 'glass', tradeName: 'Glazier' },
  { keyword: 'glazing', tradeName: 'Glazier' },
  { keyword: 'mirror', tradeName: 'Glazier' },
  { keyword: 'glass door', tradeName: 'Glazier' },
  { keyword: 'window repair', tradeName: 'Glazier' },
  { keyword: 'double glazing', tradeName: 'Glazier' },
];

async function main() {
  console.log('🌱 Seeding trades and service mappings...');

  // Create trades (using Tradesman model as the source of truth)
  const tradeMap = new Map<string, string>();
  for (const trade of trades) {
    const created = await prisma.tradesman.upsert({
      where: { title: trade.name },
      update: {
        title: trade.name,
        category: trade.category,
        professionType: trade.professionType,
        aliases: trade.aliases ?? [],
        description: trade.description,
        featured: trade.featured ?? false,
        sortOrder: trade.sortOrder ?? 999,
        enabled: true,
      },
      create: {
        title: trade.name,
        category: trade.category,
        professionType: trade.professionType,
        aliases: trade.aliases ?? [],
        description: trade.description,
        featured: trade.featured ?? false,
        sortOrder: trade.sortOrder ?? 999,
        enabled: true,
        jobs: [],
      },
    });
    tradeMap.set(trade.name, created.id);
    console.log(`✅ Trade: ${trade.name}`);
  }

  // Create service mappings
  let mappingCount = 0;
  for (const mapping of serviceMappings) {
    const tradeId = tradeMap.get(mapping.tradeName);
    if (!tradeId) {
      console.warn(`⚠️  Skipping mapping "${mapping.keyword}" - trade "${mapping.tradeName}" not found`);
      continue;
    }

    await prisma.serviceMapping.upsert({
      where: { keyword: mapping.keyword },
      update: { tradeId },
      create: {
        keyword: mapping.keyword,
        tradeId,
      },
    });
    mappingCount++;
  }

  console.log(`✅ Created ${mappingCount} service mappings`);
  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
