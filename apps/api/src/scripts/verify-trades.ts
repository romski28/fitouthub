import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  const contractors = await prisma.professional.findMany({
    where: { professionType: 'contractor' },
    take: 3,
    select: {
      fullName: true,
      professionType: true,
      primaryTrade: true,
      tradesOffered: true,
      suppliesOffered: true,
    },
  });

  const companies = await prisma.professional.findMany({
    where: { professionType: 'company' },
    take: 3,
    select: {
      fullName: true,
      professionType: true,
      primaryTrade: true,
      tradesOffered: true,
      suppliesOffered: true,
    },
  });

  const resellers = await prisma.professional.findMany({
    where: { professionType: 'reseller' },
    take: 3,
    select: {
      businessName: true,
      professionType: true,
      primaryTrade: true,
      tradesOffered: true,
      suppliesOffered: true,
    },
  });

  console.log('\n=== CONTRACTORS (Primary Trade) ===');
  contractors.forEach((c) => {
    console.log(`${c.fullName}: ${c.primaryTrade || 'None'}`);
  });

  console.log('\n=== COMPANIES (Multiple Trades) ===');
  companies.forEach((c) => {
    console.log(`${c.fullName}: ${c.tradesOffered.join(', ') || 'None'}`);
  });

  console.log('\n=== RESELLERS (Supplies) ===');
  resellers.forEach((r) => {
    console.log(`${r.businessName}: ${r.suppliesOffered.join(', ') || 'None'}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
