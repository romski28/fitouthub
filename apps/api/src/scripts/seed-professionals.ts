import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// Load environment variables from apps/api/.env
config({ path: resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

const PROFESSIONAL_TYPES = ['contractor', 'company', 'reseller'] as const;
type ProfType = (typeof PROFESSIONAL_TYPES)[number];

const HK_LOCATIONS: Array<{ primary: string; secondary?: string; tertiary?: string }> = [
  { primary: 'Hong Kong Island', secondary: 'Central and Western', tertiary: 'Central' },
  { primary: 'Hong Kong Island', secondary: 'Central and Western', tertiary: 'Sheung Wan' },
  { primary: 'Hong Kong Island', secondary: 'Wan Chai', tertiary: 'Causeway Bay' },
  { primary: 'Hong Kong Island', secondary: 'Wan Chai', tertiary: 'Wan Chai' },
  { primary: 'Kowloon', secondary: 'Yau Tsim Mong', tertiary: 'Tsim Sha Tsui' },
  { primary: 'Kowloon', secondary: 'Yau Tsim Mong', tertiary: 'Mong Kok' },
  { primary: 'Kowloon', secondary: 'Sham Shui Po', tertiary: 'Sham Shui Po' },
  { primary: 'New Territories', secondary: 'Sai Kung', tertiary: 'Tseung Kwan O' },
  { primary: 'New Territories', secondary: 'Sha Tin', tertiary: 'Sha Tin' },
  { primary: 'Islands District', secondary: 'Lantau', tertiary: 'Discovery Bay' },
];

const TRADES = [
  'Plumber', 'Electrician', 'Carpenter', 'Painter', 'Builder', 'Renovator',
  'HVAC Technician', 'Tiler', 'Mason', 'Glazier', 'Roofer', 'Flooring Specialist'
];

const SUPPLIES = [
  'Tiles', 'Bathroom Fixtures', 'Kitchen Appliances', 'Lighting Fixtures',
  'Flooring Materials', 'Paint & Wallpaper', 'Doors & Windows', 'Hardware & Tools',
  'Plumbing Supplies', 'Electrical Components', 'Building Materials', 'HVAC Equipment'
];

function pickType(i: number): ProfType {
  return PROFESSIONAL_TYPES[i % PROFESSIONAL_TYPES.length];
}

function pickLocation(i: number) {
  return HK_LOCATIONS[i % HK_LOCATIONS.length];
}

function randomPhone(i: number): string {
  const base = 90000000 + (i % 9999);
  return `+852-${base}`;
}

function randomRating(i: number): number {
  return parseFloat((3 + (i % 30) / 10).toFixed(1)); // 3.0 - 5.9 range
}

function getTradesForType(type: ProfType, index: number): {
  primaryTrade?: string;
  tradesOffered: string[];
  suppliesOffered: string[];
} {
  if (type === 'contractor') {
    // Contractors have one primary trade
    return {
      primaryTrade: TRADES[index % TRADES.length],
      tradesOffered: [],
      suppliesOffered: [],
    };
  } else if (type === 'company') {
    // Companies offer 2-5 trades
    const numTrades = 2 + (index % 4);
    const trades: string[] = [];
    for (let i = 0; i < numTrades; i++) {
      trades.push(TRADES[(index + i) % TRADES.length]);
    }
    return {
      tradesOffered: trades,
      suppliesOffered: [],
    };
  } else {
    // Resellers offer 3-6 supplies
    const numSupplies = 3 + (index % 4);
    const supplies: string[] = [];
    for (let i = 0; i < numSupplies; i++) {
      supplies.push(SUPPLIES[(index + i) % SUPPLIES.length]);
    }
    return {
      tradesOffered: [],
      suppliesOffered: supplies,
    };
  }
}

async function main() {
  const toCreate = 100;
  const created: string[] = [];
  let skipped = 0;

  console.log(`Checking existing professionals...`);
  const existingCount = await prisma.professional.count();
  console.log(`Found ${existingCount} existing professionals in database.`);
  console.log(`Attempting to seed ${toCreate} professionals...\n`);

  for (let i = 1; i <= toCreate; i++) {
    const type = pickType(i);
    const loc = pickLocation(i);
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${i.toString().padStart(3, '0')}`;
    const email = `${type}${i}@example.com`;
    const phone = randomPhone(i);
    const rating = randomRating(i);
    const trades = getTradesForType(type, i);

    try {
      const pro = await prisma.professional.create({
        data: {
          professionType: type,
          email,
          phone,
          status: 'approved',
          rating,
          fullName: type === 'reseller' ? undefined : name,
          businessName: type !== 'reseller' ? undefined : name,
          serviceArea: [loc.primary, loc.secondary, loc.tertiary].filter(Boolean).join(', '),
          locationPrimary: loc.primary,
          locationSecondary: loc.secondary,
          locationTertiary: loc.tertiary,
          servicePrimaries: type !== 'reseller' ? [loc.primary] : [],
          serviceSecondaries: type !== 'reseller' && loc.secondary ? [loc.secondary] : [],
          primaryTrade: trades.primaryTrade,
          tradesOffered: trades.tradesOffered,
          suppliesOffered: trades.suppliesOffered,
          additionalData: {
            seeded: true,
            seedBatch: '2025-12-12',
          },
        },
      });
      created.push(pro.id);
      if (i % 20 === 0) {
        console.log(`Created ${i} professionals...`);
      }
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Unique constraint (email) – skip duplicates if re-running seed
        skipped++;
        continue;
      }
      console.error('Error creating professional', i, err?.message ?? err);
      throw err;
    }
  }

  console.log(`\n✓ Seeded ${created.length} new professionals.`);
  console.log(`  Skipped ${skipped} duplicates (already exist).`);
  
  const finalCount = await prisma.professional.count();
  console.log(`\nTotal professionals in database: ${finalCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
