import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// Load environment variables from apps/api/.env
config({ path: resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

const TRADES = [
  'Plumber', 'Electrician', 'Carpenter', 'Painter', 'Builder', 'Renovator',
  'HVAC Technician', 'Tiler', 'Mason', 'Glazier', 'Roofer', 'Flooring Specialist'
];

const SUPPLIES = [
  'Tiles', 'Bathroom Fixtures', 'Kitchen Appliances', 'Lighting Fixtures',
  'Flooring Materials', 'Paint & Wallpaper', 'Doors & Windows', 'Hardware & Tools',
  'Plumbing Supplies', 'Electrical Components', 'Building Materials', 'HVAC Equipment'
];

function getTradesForType(type: string, index: number): {
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
  console.log('Fetching all professionals...');
  const professionals = await prisma.professional.findMany({
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Found ${professionals.length} professionals to update.\n`);

  let updated = 0;

  for (let i = 0; i < professionals.length; i++) {
    const pro = professionals[i];
    const trades = getTradesForType(pro.professionType, i + 1);

    await prisma.professional.update({
      where: { id: pro.id },
      data: {
        primaryTrade: trades.primaryTrade,
        tradesOffered: trades.tradesOffered,
        suppliesOffered: trades.suppliesOffered,
      },
    });

    updated++;
    if (updated % 20 === 0) {
      console.log(`Updated ${updated} professionals...`);
    }
  }

  console.log(`\n✓ Updated ${updated} professionals with trades data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
