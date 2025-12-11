import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Seed Tradesmen
  const tradesmen = [
    {
      id: 'builder',
      title: 'Builder',
      category: 'General',
      emoji: '🏗️',
      description: 'New builds, extensions, and structural works.',
      featured: true,
      image: 'builder.png',
      jobs: ['New build planning', 'Structural framing', 'Extension construction', 'Foundation repair', 'Site preparation'],
    },
    {
      id: 'renovator',
      title: 'Renovator',
      category: 'General',
      emoji: '🔧',
      description: 'Interior and exterior refurbishments.',
      featured: false,
      image: 'renovator.png',
      jobs: ['Kitchen refurbishment', 'Bathroom upgrade', 'Ceiling repair', 'Partition removal', 'General makeover'],
    },
    {
      id: 'project-manager',
      title: 'Project Manager',
      category: 'General',
      emoji: '📋',
      description: 'Coordination of timelines, budgets, and stakeholders.',
      featured: false,
      image: 'pm.png',
      jobs: ['Budget tracking', 'Timeline management', 'Quality inspections', 'Risk mitigation', 'Stakeholder reporting'],
    },
    {
      id: 'painting',
      title: 'Decorator / Painter',
      category: 'Interior',
      emoji: '🎨',
      description: 'Painting, wallpapering, and interior finishes.',
      featured: true,
      image: 'painter.png',
      jobs: ['Interior painting', 'Exterior painting', 'Wallpaper hanging', 'Trim & detail work', 'Surface preparation'],
    },
    {
      id: 'plasterer',
      title: 'Plasterer',
      category: 'Interior',
      emoji: '🧱',
      description: 'Wall smoothing and ceiling finishes.',
      featured: false,
      image: 'plasterer.png',
      jobs: ['Skim coating', 'Ceiling repair', 'Patch repairs', 'Drywall finishing', 'Textured finishes'],
    },
    {
      id: 'tiler',
      title: 'Tiler',
      category: 'Interior',
      emoji: '🪨',
      description: 'Wall and floor tiling.',
      featured: false,
      image: 'tiler.png',
      jobs: ['Bathroom wall tiles', 'Kitchen splashback', 'Floor leveling', 'Grouting & sealing', 'Tile repairs'],
    },
    {
      id: 'flooring',
      title: 'Flooring Specialist',
      category: 'Interior',
      emoji: '🪵',
      description: 'Wood, laminate, vinyl, carpet installation.',
      featured: false,
      image: 'flooring.png',
      jobs: ['Hardwood install', 'Laminate flooring', 'Vinyl planks', 'Carpet fitting', 'Floor preparation'],
    },
    {
      id: 'roofer',
      title: 'Roofer',
      category: 'Exterior',
      emoji: '🏠',
      description: 'Roof repairs, installations, and waterproofing.',
      featured: false,
      image: 'roofer.png',
      jobs: ['Leak detection', 'Tile replacement', 'Flashing repair', 'Flat roof membrane', 'Gutter cleaning'],
    },
    {
      id: 'landscaper',
      title: 'Landscaper',
      category: 'Exterior',
      emoji: '🌳',
      description: 'Garden design, paving, and turfing.',
      featured: false,
      image: 'landscaper.png',
      jobs: ['Garden planning', 'Turf laying', 'Paving installation', 'Planting & beds', 'Irrigation setup'],
    },
    {
      id: 'fencer',
      title: 'Fencer',
      category: 'Exterior',
      emoji: '🚧',
      description: 'Boundary fencing and gates.',
      featured: false,
      image: 'fencer.png',
      jobs: ['Timber fencing', 'Gate installation', 'Repairs & posts', 'Security panels', 'Screening'],
    },
    {
      id: 'window-door',
      title: 'Window & Door Installer',
      category: 'Exterior',
      emoji: '🚪',
      description: 'Glazing, frames, and security doors.',
      featured: false,
      image: 'windowdoor.png',
      jobs: ['Window replacement', 'Door hanging', 'Frame repair', 'Security door install', 'Seal & insulation'],
    },
    {
      id: 'electrician',
      title: 'Electrician',
      category: 'Systems',
      emoji: '💡',
      description: 'Wiring, lighting, and safety systems.',
      featured: true,
      image: 'electrician.png',
      jobs: ['Light fixture install', 'Socket additions', 'Safety inspection', 'Circuit troubleshooting', 'Consumer unit upgrade'],
    },
    {
      id: 'plumber',
      title: 'Plumber',
      category: 'Systems',
      emoji: '🚿',
      description: 'Water systems, heating, and drainage.',
      featured: true,
      image: 'plumber.png',
      jobs: ['Leaky tap repair', 'Drain unblocking', 'Pipe replacement', 'Water heater service', 'Fixture installation'],
    },
    {
      id: 'hvac',
      title: 'HVAC Technician',
      category: 'Systems',
      emoji: '🌬️',
      description: 'Air conditioning, ventilation, and heating.',
      featured: true,
      image: 'hvac.png',
      jobs: ['AC servicing', 'Filter replacement', 'Ventilation setup', 'Duct inspection', 'Thermostat install'],
    },
    {
      id: 'smart-home',
      title: 'Smart Home Installer',
      category: 'Systems',
      emoji: '📱',
      description: 'Automation, security, and network systems.',
      featured: false,
      image: 'smarthome.png',
      jobs: ['Device pairing', 'Security camera setup', 'Network cabling', 'Hub configuration', 'Energy monitoring'],
    },
    {
      id: 'carpenter',
      title: 'Joiner / Carpenter',
      category: 'Specialist',
      emoji: '🪚',
      description: 'Custom woodwork, cabinetry, and framing.',
      featured: false,
      image: 'carpenter.png',
      jobs: ['Bespoke shelving', 'Door framing', 'Cabinet installation', 'Trim carpentry', 'Repair & refurbishment'],
    },
    {
      id: 'bricklayer',
      title: 'Bricklayer',
      category: 'Specialist',
      emoji: '🧱',
      description: 'Walls, chimneys, and structural masonry.',
      featured: false,
      image: 'bricklayer.png',
      jobs: ['Wall construction', 'Pointing & repairs', 'Garden walls', 'Chimney rebuild', 'Block laying'],
    },
    {
      id: 'steelworker',
      title: 'Steelworker / Welder',
      category: 'Specialist',
      emoji: '🔩',
      description: 'Structural steel, gates, and railings.',
      featured: false,
      image: 'steelworker.png',
      jobs: ['Gate fabrication', 'Railing installation', 'On-site welding', 'Steel frame repair', 'Bracket & supports'],
    },
    {
      id: 'insulation',
      title: 'Insulation Installer',
      category: 'Specialist',
      emoji: '🧤',
      description: 'Thermal and acoustic insulation.',
      featured: false,
      image: 'insulation.png',
      jobs: ['Loft insulation', 'Wall cavity fill', 'Pipe lagging', 'Acoustic panel fit', 'Energy efficiency upgrade'],
    },
    {
      id: 'architect',
      title: 'Architect',
      category: 'Design',
      emoji: '📐',
      description: 'Building design and planning approvals.',
      featured: false,
      image: 'architect.png',
      jobs: ['Concept design', 'Permit drawings', '3D modeling', 'Spec documentation', 'Planning submission'],
    },
    {
      id: 'interior-designer',
      title: 'Interior Designer',
      category: 'Design',
      emoji: '🛋️',
      description: 'Space planning, finishes, and furniture layout.',
      featured: false,
      image: 'interiordesigner.png',
      jobs: ['Mood board creation', 'Material selection', 'Furniture plan', 'Lighting layout', 'Finish schedule'],
    },
    {
      id: 'landscape-designer',
      title: 'Landscape Designer',
      category: 'Design',
      emoji: '🌿',
      description: 'Outdoor space planning and aesthetics.',
      featured: false,
      image: 'landscapedesigner.png',
      jobs: ['Concept planting', 'Hardscape layout', 'Drainage planning', 'Lighting design', 'Seasonal plan'],
    },
    {
      id: 'surveyor',
      title: 'Surveyor',
      category: 'Design',
      emoji: '📏',
      description: 'Site measurements, valuations, and compliance.',
      featured: false,
      image: 'surveyor.png',
      jobs: ['Site measurement', 'Condition report', 'Valuation study', 'Compliance review', 'Boundary verification'],
    },
  ];

  console.log(`📋 Seeding ${tradesmen.length} tradesmen...`);
  for (const tradesman of tradesmen) {
    await prisma.tradesman.upsert({
      where: { id: tradesman.id },
      update: tradesman,
      create: tradesman,
    });
  }
  console.log(`✓ ${tradesmen.length} tradesmen seeded\n`);

  // Seed demo user
  console.log('👤 Seeding demo user...');
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@fitouthub.com' },
    update: {},
    create: {
      id: 'user_demo_001',
      nickname: 'demo',
      firstName: 'Demo',
      surname: 'User',
      email: 'demo@fitouthub.com',
      mobile: '+852 9123 4567',
      passwordHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
      emailVerified: true,
      role: 'client',
    },
  });
  console.log(`✓ Demo user created: ${demoUser.email}\n`);

  // Seed sample contractors
  console.log('🏢 Seeding sample contractors...');
  const builderTradesman = await prisma.tradesman.findUnique({
    where: { id: 'builder' },
  });
  const electricianTradesman = await prisma.tradesman.findUnique({
    where: { id: 'electrician' },
  });

  const sampleContractors = [
    {
      id: 'contractor_001',
      nickname: 'contractor_john_builder',
      firstName: 'John',
      surname: 'Smith',
      email: 'john@builderservices.com',
      mobile: '+852 9111 2222',
      passwordHash: 'hashedpassword123',
      role: 'professional',
    },
    {
      id: 'contractor_002',
      nickname: 'contractor_mary_electrician',
      firstName: 'Mary',
      surname: 'Wong',
      email: 'mary@electrical.com',
      mobile: '+852 9333 4444',
      passwordHash: 'hashedpassword456',
      role: 'professional',
    },
  ];

  for (const contractor of sampleContractors) {
    const user = await prisma.user.upsert({
      where: { email: contractor.email },
      update: {},
      create: contractor,
    });

    const tradeId = contractor.email.includes('electrical') ? electricianTradesman?.id : builderTradesman?.id;

    await prisma.professional.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        professionType: 'contractor',
        email: contractor.email,
        phone: contractor.mobile || '+852-0000-0000',
        status: 'approved',
        rating: 4.5,
        fullName: `${contractor.firstName} ${contractor.surname}`,
        serviceArea: 'Hong Kong Island, Kowloon',
      },
    });
  }
  console.log(`✓ ${sampleContractors.length} sample contractors seeded\n`);

  console.log('✅ Database seed completed successfully!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
